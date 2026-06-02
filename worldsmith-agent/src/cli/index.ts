import { Command } from 'commander'
import { createWorldSmithAgent } from '../agent'
import { createCliToolContext } from './cli-context'
import { createCLISafetyGuard } from './cli-safety-guard'
import type { ProviderConfig } from '../providers/config'
import type { AgentEvent } from '../bridge-types'
import * as fs from 'fs'
import * as path from 'path'

function loadApiKeyFromEnv(provider: string): string {
  const envKey = `WORLDSMITH_API_KEY_${provider.toUpperCase().replace(/-/g, '_')}`
  if (process.env[envKey]) return process.env[envKey]!
  if (process.env.WORLDSMITH_API_KEY) return process.env.WORLDSMITH_API_KEY
  const cfgPath = path.join(process.cwd(), '.worldsmith-keys.json')
  if (fs.existsSync(cfgPath)) {
    try {
      const keys = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      return keys[provider] || keys.default || ''
    } catch { return '' }
  }
  return ''
}

export async function runCli(): Promise<void> {
  const program = new Command()

  program
    .name('worldsmith-agent')
    .description('WorldSmith AI Agent CLI')
    .version('0.1.0')

  program
    .command('chat')
    .description('Start an interactive chat session')
    .option('-p, --provider <provider>', 'LLM provider (deepseek, openai, anthropic)', 'deepseek')
    .option('-m, --model <model>', 'Model ID', 'deepseek-chat')
    .option('-k, --api-key <key>', 'API key (or use env WORLDSMITH_API_KEY)')
    .option('-d, --data <path>', 'Data directory path', './worldsmith-data')
    .option('--base-url <url>', 'Custom API base URL')
    .option('--no-guard', 'Disable safety guard for sensitive operations')
    .action(async (opts) => {
      const apiKey = opts.apiKey || loadApiKeyFromEnv(opts.provider)
      if (!apiKey) {
        console.error('Error: API key required. Use -k flag, WORLDSMITH_API_KEY env, or .worldsmith-keys.json')
        process.exit(1)
      }

      const config: ProviderConfig = opts.baseUrl
        ? { mode: 'custom', baseUrl: opts.baseUrl, apiType: 'openai', modelId: opts.model, apiKey }
        : { mode: 'cloud', provider: opts.provider, modelId: opts.model, apiKey }

      const toolContext = createCliToolContext(opts.data, config)

      const agent = await createWorldSmithAgent({
        providerConfig: config,
        toolContext,
        projectName: 'WorldSmith',
        beforeToolCall: opts.guard ? createCLISafetyGuard(toolContext.stores.ui) : undefined,
      })

      agent.subscribe((event: AgentEvent) => {
        switch (event.type) {
          case 'message_update':
            if (event.content) process.stdout.write(event.content)
            break
          case 'message_end':
            process.stdout.write('\n\n')
            break
          case 'tool_execution_start':
            process.stdout.write(`\n🔧 ${event.toolCall.name}(...)\n`)
            break
          case 'tool_execution_end':
            process.stdout.write(`  ${event.success ? '✅ done' : '❌ failed'}\n`)
            break
          case 'error':
            process.stderr.write(`\n❌ ${event.error?.message || 'Unknown error'}\n`)
            break
        }
      })

      const readline = await import('readline')
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

      const prompt = (): void => {
        rl.question('You> ', async (input) => {
          const text = input.trim()
          if (!text) { prompt(); return }
          if (text === '/quit' || text === '/exit') {
            agent.dispose()
            rl.close()
            process.exit(0)
          }
          try {
            await agent.prompt(text)
          } catch (err) {
            process.stderr.write(`Error: ${err}\n`)
          }
          prompt()
        })
      }

      console.log('WorldSmith AI Agent CLI')
      console.log(`Model: ${opts.provider}/${opts.model}`)
      console.log(`Data:  ${path.resolve(opts.data)}`)
      console.log(`Guard: ${opts.guard ? 'ON' : 'OFF'}`)
      console.log('Type /quit to exit\n')
      prompt()
    })

  program.parse()
}
