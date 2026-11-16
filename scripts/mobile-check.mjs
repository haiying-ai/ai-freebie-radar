import puppeteer from 'puppeteer'

const URL = process.argv[2] || 'https://ai-credit-hub-44763.app.workbuddy.host/?sharecode=RIOZLFZCRN'
const W = Number(process.argv[3] || 390)
const H = Number(process.argv[4] || 844)
const OUT = process.argv[5] || 'docs/mobile-check.png'

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  const errors = []
  page.on('pageerror', e => errors.push(String(e.message)))
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(r => setTimeout(r, 2500))
  const diag = await page.evaluate(() => {
    const docW = document.documentElement.clientWidth
    const over = []
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && (r.right > docW + 1 || r.left < -1)) {
        const cls = (el.className && typeof el.className === 'string') ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase()
        over.push({ sel: cls.slice(0, 60), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), text: (el.textContent || '').trim().slice(0, 24) })
      }
    })
    // 去重按选择器
    const seen = new Set()
    const uniq = over.filter(o => (seen.has(o.sel) ? false : (seen.add(o.sel), true)))
    return {
      docW,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      overflow: uniq.slice(0, 14),
      cards: document.querySelectorAll('#grid .card').length,
      heroH1: getComputedStyle(document.querySelector('.hero h1') || document.body).fontSize,
      gridCols: getComputedStyle(document.getElementById('grid') || document.body).gridTemplateColumns,
      filterH: (document.querySelector('.filters') || {}).offsetHeight || 0,
    }
  })
  // 分段截图：首屏 + 列表区
  await page.screenshot({ path: OUT.replace(/\.png$/, '-top.png') })
  await page.evaluate(() => {
    const el = document.querySelector('.filters') || document.getElementById('grid')
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70)
  })
  await new Promise(r => setTimeout(r, 600))
  await page.screenshot({ path: OUT.replace(/\.png$/, '-list.png') })
  await page.evaluate(() => window.scrollTo(0, 0))
  await new Promise(r => setTimeout(r, 300))
  await page.screenshot({ path: OUT, fullPage: true })
  console.log(JSON.stringify({ ...diag, pageErrors: errors.slice(0, 3) }, null, 2))
} finally {
  await browser.close()
}
