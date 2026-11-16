import puppeteer from 'puppeteer'

const URL = process.argv[2] || 'https://ai-credit-hub-44763.app.workbuddy.host/?sharecode=RIOZLFZCRN'
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 1200 })
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message)))
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 2500))
  const info = await page.evaluate(() => ({
    gridText: (document.getElementById('grid') || {}).textContent || '',
    cards: document.querySelectorAll('#grid .card, #grid article, .card').length,
    syncTime: (document.getElementById('syncTime') || {}).textContent || '',
    firstTitle: (document.querySelector('#grid .card h3, #grid h3, .card h3') || {}).textContent || '',
  }))
  await page.screenshot({ path: 'docs/live-check.png' })
  console.log(JSON.stringify({
    cards: info.cards,
    syncTime: info.syncTime,
    failText: /加载失败/.test(info.gridText),
    firstTitle: String(info.firstTitle).slice(0, 40),
    pageErrors: errors.slice(0, 3),
  }, null, 2))
} finally {
  await browser.close()
}
