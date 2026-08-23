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
  base: './',
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

        // CD/DVD Optical Drive Auto-Detection & High-Speed Stream Endpoints
        server.middlewares.use('/api/system/detect-optical-drives', async (req, res) => {
          const fs = require('fs')
          const { exec } = require('child_process')

          const findDrive = () => new Promise((resolve) => {
            if (process.platform !== 'win32') return resolve(null)
            exec('powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Select-Object Drive, MediaLoaded, Name, VolumeName | ConvertTo-Json"', { timeout: 4000 }, (err, stdout) => {
              try {
                if (!err && stdout && stdout.trim()) {
                  let data = JSON.parse(stdout.trim())
                  if (!Array.isArray(data)) data = [data]
                  for (const item of data) {
                    const drive = item.Drive || (item.DeviceID ? item.DeviceID.match(/([A-Z]:)/)?.[1] : null)
                    if (drive && (item.MediaLoaded === true || item.MediaLoaded === 'True')) {
                      const root = drive.endsWith('\\') ? drive : drive + '\\'
                      if (fs.existsSync(root)) {
                        const files = fs.readdirSync(root)
                        if (files.length > 0) {
                          return resolve({
                            driveLetter: drive.replace(/\\$/, ''),
                            name: item.Name || 'CD/DVD Drive',
                            volumeName: item.VolumeName || 'DICOM_DISC',
                            rootPath: root
                          })
                        }
                      }
                    }
                  }
                }
              } catch (_) {}

              for (let i = 68; i <= 90; i++) {
                const letter = String.fromCharCode(i) + ':'
                const root = letter + '\\'
                try {
                  if (fs.existsSync(root)) {
                    const files = fs.readdirSync(root)
                    if (files.length > 0) {
                      return resolve({
                        driveLetter: letter,
                        name: 'Optical Disc Drive',
                        volumeName: 'DICOM_MEDIA',
                        rootPath: root
                      })
                    }
                  }
                } catch (_) {}
              }
              resolve(null)
            })
          })

          const ready = await findDrive()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(ready ? [ready] : []))
        })

        server.middlewares.use('/api/system/read-optical-disc/stream', async (req, res) => {
          const fs = require('fs')
          const path = require('path')
          const { exec } = require('child_process')

          const findDrive = () => new Promise((resolve) => {
            if (process.platform !== 'win32') return resolve(null)
            exec('powershell -NoProfile -Command "Get-CimInstance Win32_CDROMDrive | Select-Object Drive, MediaLoaded, Name, VolumeName | ConvertTo-Json"', { timeout: 4000 }, (err, stdout) => {
              try {
                if (!err && stdout && stdout.trim()) {
                  let data = JSON.parse(stdout.trim())
                  if (!Array.isArray(data)) data = [data]
                  for (const item of data) {
                    const drive = item.Drive || (item.DeviceID ? item.DeviceID.match(/([A-Z]:)/)?.[1] : null)
                    if (drive && (item.MediaLoaded === true || item.MediaLoaded === 'True')) {
                      const root = drive.endsWith('\\') ? drive : drive + '\\'
                      if (fs.existsSync(root)) {
                        const files = fs.readdirSync(root)
                        if (files.length > 0) {
                          return resolve({
                            driveLetter: drive.replace(/\\$/, ''),
                            name: item.Name || 'CD/DVD Drive',
                            volumeName: item.VolumeName || 'DICOM_DISC',
                            rootPath: root
                          })
                        }
                      }
                    }
                  }
                }
              } catch (_) {}

              for (let i = 68; i <= 90; i++) {
                const letter = String.fromCharCode(i) + ':'
                const root = letter + '\\'
                try {
                  if (fs.existsSync(root)) {
                    const files = fs.readdirSync(root)
                    if (files.length > 0) {
                      return resolve({
                        driveLetter: letter,
                        name: 'Optical Disc Drive',
                        volumeName: 'DICOM_MEDIA',
                        rootPath: root
                      })
                    }
                  }
                } catch (_) {}
              }
              resolve(null)
            })
          })

          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.setHeader('Connection', 'keep-alive')

          const ready = await findDrive()
          if (!ready) {
            res.write(`data: ${JSON.stringify({ type: 'not_detected', message: 'No CD/DVD disc was detected in the drive.' })}\n\n`)
            res.end()
            return
          }

          res.write(`data: ${JSON.stringify({ type: 'detected', driveLetter: ready.driveLetter, volumeName: ready.volumeName, name: ready.name })}\n\n`)

          const scanDir = (dirPath, onFile) => {
            try {
              const entries = fs.readdirSync(dirPath, { withFileTypes: true })
              for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name)
                if (entry.isDirectory()) {
                  scanDir(fullPath, onFile)
                } else if (entry.isFile()) {
                  try {
                    const stats = fs.statSync(fullPath)
                    if (stats.size >= 8) {
                      const data = fs.readFileSync(fullPath)
                      onFile({
                        fileName: entry.name,
                        filePath: fullPath,
                        buffer: data.toString('base64'),
                        size: stats.size
                      })
                    }
                  } catch (e) {}
                }
              }
            } catch (err) {}
          }

          let sliceCount = 0
          scanDir(ready.rootPath, (file) => {
            sliceCount++
            res.write(`data: ${JSON.stringify({ type: 'slice', file, index: sliceCount })}\n\n`)
          })

          res.write(`data: ${JSON.stringify({ type: 'done', count: sliceCount, driveLetter: ready.driveLetter, volumeName: ready.volumeName })}\n\n`)
          res.end()
        })
      }
    }
  ],
  server: {
    port: 5173,
    host: true,
    watch: {
      ignored: ['**/dist_installer/**', '**/dist_app/**', '**/release/**', '**/dist/**']
    }
  },
  define: {
    'process.env': {}
  },
  optimizeDeps: {
    include: ['dicom-parser', 'dcmjs', 'jszip']
  }
})
