#!/usr/bin/env node
/**
 * WorldSmith CLI 入口
 *
 * 用法：
 *   worldsmith chat [options]     交互式对话
 *   worldsmith serve [options]    启动 HTTP+WS 服务器（供 Web 端连接）
 *   worldsmith --help
 */
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// 使用 tsx 运行时注册 TypeScript 支持
register('tsx', pathToFileURL(import.meta.url))

// 导入并运行 CLI 主逻辑
import '../src/cli/index.ts'
