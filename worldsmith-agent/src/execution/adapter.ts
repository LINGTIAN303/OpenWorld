export interface ExecOptions {
  cwd?: string
  timeout?: number
  env?: Record<string, string>
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
}

export interface PtyOptions {
  shell?: string | null
  cwd?: string | null
  cols?: number
  rows?: number
}

export interface ExecutionAdapter {
  isAvailable(): boolean
  tryConnect(): Promise<boolean>
  executeCommand(cmd: string, opts?: ExecOptions): Promise<ExecResult>
  spawnPty(id: string, opts?: PtyOptions): Promise<void>
  writePty(id: string, data: string): Promise<void>
  resizePty(id: string, cols: number, rows: number): Promise<void>
  killPty(id: string): Promise<void>
  onPtyOutput(id: string, callback: (data: string) => void): Promise<() => void>
}
