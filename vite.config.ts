import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
function getDicomNetwork() {
  try {
    const resolved = require.resolve('./electron/dicomNetwork.cjs')
    delete require.cache[resolved]
  } catch {}
  return require('./electron/dicomNetwork.cjs')
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'pacs-proxy-plugin',
      configureServer(server) {
        server.middlewares.use('/api/pacs/echo', (req, res) => {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
              try {
                const config = JSON.parse(body)
                const { testDicomEcho } = getDicomNetwork()
                const result = await testDicomEcho(config)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(result))
              } catch (err) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ success: false, message: err.message, responseTimeMs: 0 }))
              }
            })
          } else {
            res.statusCode = 405
            res.end('Method Not Allowed')
          }
        })

        server.middlewares.use('/api/pacs/search', (req, res) => {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body)
                const serverConfig = payload.server
                const filters = payload.filters || {}
                const { searchDicomStudies } = getDicomNetwork()
                const results = await searchDicomStudies(serverConfig, filters)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(results))
              } catch (err) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message }))
              }
            })
          } else {
            res.statusCode = 405
            res.end('Method Not Allowed')
          }
        })

        server.middlewares.use('/api/pacs/retrieve/stream', (req, res) => {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body)
                const serverConfig = payload.server
                const studyInstanceUid = payload.studyInstanceUid
                const { retrieveDicomStudy } = getDicomNetwork()

                res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
                res.setHeader('Cache-Control', 'no-cache')
                res.setHeader('Connection', 'keep-alive')

                const result = await retrieveDicomStudy(serverConfig, studyInstanceUid, (slice) => {
                  res.write(`data: ${JSON.stringify({ type: 'slice', file: slice })}\n\n`)
                })

                res.write(`data: ${JSON.stringify({ type: 'done', count: result.count })}\n\n`)
                res.end()
              } catch (err) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message, success: false, files: [] }))
              }
            })
          } else {
            res.statusCode = 405
            res.end('Method Not Allowed')
          }
        })

        server.middlewares.use('/api/pacs/retrieve', (req, res) => {
          if (req.method === 'POST') {
            let body = ''
            req.on('data', chunk => { body += chunk })
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body)
                const serverConfig = payload.server
                const studyInstanceUid = payload.studyInstanceUid
                const { retrieveDicomStudy } = getDicomNetwork()
                const result = await retrieveDicomStudy(serverConfig, studyInstanceUid)
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify(result))
              } catch (err) {
                res.statusCode = 500
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ error: err.message, success: false, files: [] }))
              }
            })
          } else {
            res.statusCode = 405
            res.end('Method Not Allowed')
          }
        })
      }
    }
  ],
  server: {
    port: 5173,
    host: true
  },
  define: {
    'process.env': {}
  },
  optimizeDeps: {
    include: ['dicom-parser', 'dcmjs', 'jszip']
  }
})
