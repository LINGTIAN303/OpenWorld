import { spawn, IPty } from 'node-pty'

interface PtyProcess {
  id: string
  pty: IPty
  createdAt: number
}

export class PtyManager {
  private processes: Map<string, PtyProcess> = new Map()

  spawn(id: string, opts: {
    shell?: string | null
    cwd?: string | null
    cols?: number
    rows?: number
    env?: Record<string, string>
  } = {}): void {
    if (this.processes.has(id)) {
      this.kill(id)
    }

    const shell = opts.shell || process.env.COMSPEC || process.env.SHELL || 'powershell.exe'
    const pty = spawn(shell, [], {
      name: 'xterm-256color',
      cols: opts.cols || 200,
      rows: opts.rows || 50,
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...opts.env } as Record<string, string>,
    })

    this.processes.set(id, { id, pty, createdAt: Date.now() })
  }

  spawnWithArgs(id: string, opts: {
    shell: string
    args: string[]
    cwd?: string | null
    cols?: number
    rows?: number
    env?: Record<string, string>
  }): void {
    if (this.processes.has(id)) {
      this.kill(id)
    }

    const pty = spawn(opts.shell, opts.args, {
      name: 'xterm-256color',
      cols: opts.cols || 200,
      rows: opts.rows || 50,
      cwd: opts.cwd || process.cwd(),
      env: { ...process.env, ...opts.env } as Record<string, string>,
    })

    this.processes.set(id, { id, pty, createdAt: Date.now() })
  }

  write(id: string, data: string): void {
    const proc = this.processes.get(id)
    if (!proc) throw new Error(`PTY process "${id}" not found`)
    proc.pty.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const proc = this.processes.get(id)
    if (!proc) return
    try {
      proc.pty.resize(cols, rows)
    } catch {}
  }

  kill(id: string): void {
    const proc = this.processes.get(id)
    if (!proc) return
    try {
      proc.pty.kill()
    } catch {}
    this.processes.delete(id)
  }

  killAll(): void {
    for (const [id] of this.processes) {
      this.kill(id)
    }
  }

  get(id: string): IPty | null {
    return this.processes.get(id)?.pty || null
  }

  has(id: string): boolean {
    return this.processes.has(id)
  }

  list(): string[] {
    return Array.from(this.processes.keys())
  }

  onData(id: string, callback: (data: string) => void): (() => void) | null {
    const proc = this.processes.get(id)
    if (!proc) return null
    const listener = proc.pty.onData(callback)
    return () => listener.dispose()
  }

  onExit(id: string, callback: (exitCode: number, signal?: number) => void): (() => void) | null {
    const proc = this.processes.get(id)
    if (!proc) return null
    const listener = proc.pty.onExit(({ exitCode, signal }) => callback(exitCode, signal))
    return () => listener.dispose()
  }
}
