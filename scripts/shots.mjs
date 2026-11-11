// Headless-скриншоты dist: статик-сервер + puppeteer-core + Edge
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const DIST = path.resolve('dist')
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (p === '/') p = '/index.html'
  let f = path.join(DIST, p)
  if (!existsSync(f)) f = path.join(DIST, 'index.html')
  try { res.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); res.end(await readFile(f)) }
  catch { res.writeHead(404); res.end() }
})
await new Promise((r) => server.listen(0, r))
const port = server.address().port
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: 'new', args: ['--no-sandbox'] })

// спеки: route=name или route=name=КЛИК1,КЛИК2 (клики по тексту кнопок/ссылок)
const shots = process.argv.slice(2)
for (const spec of shots) {
  const [route, name, click] = spec.split('=')
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}/#${route}`, { waitUntil: 'networkidle0', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 2500))
  if (click) {
    for (const txt of click.split(',')) {
      await page.evaluate((t) => {
        const el = [...document.querySelectorAll('button, a')].find((b) => b.textContent.trim().toUpperCase().startsWith(t.toUpperCase()))
        el?.click()
      }, txt.trim())
      await new Promise((r) => setTimeout(r, 900))
    }
  }
  await page.screenshot({ path: `shots-${name}.png` })
  console.log('saved', `shots-${name}.png`, page.url())
  await page.close()
}
await browser.close()
server.close()
