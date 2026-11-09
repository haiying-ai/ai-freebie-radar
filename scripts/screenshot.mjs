import puppeteer from 'puppeteer'
import fs from 'fs'
import path from 'path'

const S = 'https://ai-credit-hub-44763.app.workbuddy.host'
const SC = '?sharecode=RIOZLFZCRN'
const OUT = path.join(process.cwd(), 'docs', 'screenshots')
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
})

async function shot(name, url, { width = 1440, height = 900, full = false, wait = 2500, clip = null } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 2 })
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, wait))
  const file = path.join(OUT, name)
  await page.screenshot({ path: file, fullPage: full, clip: clip || undefined })
  console.log('saved', name, fs.statSync(file).size, 'bytes')
  await page.close()
}

await shot('01-home.png', S + '/' + SC, { width: 1440, height: 940, wait: 3000 })
await shot('02-detail.png', S + '/a/37' + SC, { width: 1440, height: 1100, wait: 2000 })
await shot('03-daily.png', S + '/daily' + SC, { width: 1440, height: 1100, wait: 2000 })

// 移动端视图（展示响应式）
await shot('04-mobile.png', S + '/' + SC, { width: 390, height: 844, wait: 3000 })

await browser.close()
console.log('done')
