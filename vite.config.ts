import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import wasm from 'vite-plugin-wasm'
import path from 'path'
import http from 'http'
import https from 'https'
import { worldsmithServerLauncher } from './vite-plugin-server-launcher'

function customProxyPlugin(): Plugin {
  return {
    name: 'custom-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/api/custom-proxy')) return next()

        const targetUrl = req.headers['x-target-base-url'] as string
        if (!targetUrl) {
          res.statusCode = 400
          res.end('Missing X-Target-Base-Url header')
          return
        }

        let parsedTarget: URL
        try {
          parsedTarget = new URL(targetUrl)
        } catch {
          res.statusCode = 400
          res.end('Invalid X-Target-Base-Url')
          return
        }

        const proxyPath = req.url.replace(/^\/api\/custom-proxy/, '') || '/'
        const isHttps = parsedTarget.protocol === 'https:'
        const lib = isHttps ? https : http

        const forwardHeaders: Record<string, string> = {}
        for (const [key, value] of Object.entries(req.headers)) {
          if (key.startsWith('x-target-') || key.startsWith('sec-') || key === 'origin' || key === 'referer') continue
          if (typeof value === 'string') forwardHeaders[key] = value
          else if (Array.isArray(value)) forwardHeaders[key] = value.join(', ')
        }
        forwardHeaders['host'] = parsedTarget.host

        const options: https.RequestOptions = {
          hostname: parsedTarget.hostname,
          port: parsedTarget.port || (isHttps ? 443 : 80),
          path: proxyPath,
          method: req.method,
          headers: forwardHeaders,
          rejectUnauthorized: false,
        }

        console.log(`[custom-proxy] ${req.method} ${req.url} → ${parsedTarget.protocol}//${parsedTarget.host}${proxyPath}`)

        const proxyReq = lib.request(options, (proxyRes) => {
          console.log(`[custom-proxy] ← ${proxyRes.statusCode} ${req.url} content-type: ${proxyRes.headers['content-type']}`)
          res.writeHead(proxyRes.statusCode!, proxyRes.headers)
          proxyRes.pipe(res)
        })

        proxyReq.on('error', (err) => {
          console.error(`[custom-proxy] ERROR ${req.method} ${req.url}:`, err.message)
          if (!res.headersSent) {
            res.statusCode = 502
            res.end('Proxy error: ' + err.message)
          }
        })

        req.pipe(proxyReq)
      })
    },
  }
}

export default defineConfig({
  plugins: [vue(), wasm(), worldsmithServerLauncher(), customProxyPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@agent': path.resolve(__dirname, 'worldsmith-agent/src'),
      '@worldsmith/entity-core': path.resolve(__dirname, 'packages/entity-core/src'),
      '@worldsmith/plugin-sdk': path.resolve(__dirname, 'packages/plugin-sdk/src'),
      '@worldsmith/ui-kit': path.resolve(__dirname, 'packages/ui-kit/src'),
      '@worldsmith/canvas-engine': path.resolve(__dirname, 'packages/canvas-engine/src'),
      '@worldsmith/motion-kit': path.resolve(__dirname, 'packages/motion-kit/src'),
      '@worldsmith/font-kit': path.resolve(__dirname, 'packages/font-kit/src'),
    },
  },
  optimizeDeps: {
    include: ['docx', 'turndown'],
    exclude: ['@worldsmith/tactical-engine', '@worldsmith/core'],
  },
  server: {
    watch: {
      ignored: [
        '**/target/**',
        '**/dist/**',
        '**/WS备份/**',
        '**/.deepseek/**',
        '**/node_modules/.cache/**',
      ],
    },
    proxy: {
      '/api/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/anthropic/, ''),
      },
      '/api/openai': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/openai/, ''),
      },
      '/api/google': {
        target: 'https://generativelanguage.googleapis.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/google/, ''),
      },
      '/api/deepseek': {
        target: 'https://api.deepseek.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/deepseek/, ''),
      },
      '/api/groq': {
        target: 'https://api.groq.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/groq/, ''),
      },
      '/api/openrouter': {
        target: 'https://openrouter.ai',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/openrouter/, ''),
      },
      '/api/zhipu': {
        target: 'https://open.bigmodel.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/zhipu/, ''),
      },
      '/api/qwen': {
        target: 'https://dashscope.aliyuncs.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/qwen/, ''),
      },
      '/api/minimax': {
        target: 'https://api.minimax.chat',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/minimax/, ''),
      },
      '/api/kimi': {
        target: 'https://api.moonshot.cn',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/kimi/, ''),
      },
    },
  },
  build: {
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('pdfjs-dist')) return 'vendor-pdf'
            if (id.includes('naive-ui')) return 'vendor-naive'
            if (id.includes('sigma') || id.includes('graphology')) return 'vendor-graph'
            if (id.includes('d3-')) return 'vendor-d3'
            if (id.includes('vis-timeline')) return 'vendor-timeline'
            if (id.includes('docx')) return 'vendor-docx'
            if (id.includes('mammoth')) return 'vendor-mammoth'
            if (id.includes('marked')) return 'vendor-marked'
            if (id.includes('jszip')) return 'vendor-jszip'
            if (id.includes('tiptap')) return 'vendor-tiptap'
          }
        },
      },
    },
  },
})
