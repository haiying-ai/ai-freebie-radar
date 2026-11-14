/**
 * EdgeOne 静态站导出
 *
 * 把「数据库里的活动 + 日报」预渲染成纯静态站点，输出到 edgeone-dist/：
 *   index.html                 首页（SPA，数据走 /api/activities）
 *   a/<id>/index.html          每个活动一个 SEO 落地页
 *   daily/index.html           日报列表
 *   daily/<date>/index.html    每篇日报
 *   data/activities.json       活动快照（/api/activities 直接读它）
 *   data/digests.json          日报快照
 *   data/qr.svg                分享海报二维码（构建时预生成）
 *   sitemap.xml / robots.txt / og-cover.png
 *   edge-functions/api/*.js    边缘函数（activities / stats / visit / submit / qr）
 *
 * 用法：
 *   node scripts/build-edgeone.mjs                       # 只构建
 *   EDGEONE_SITE_URL=https://xxx.edgeone.app node scripts/build-edgeone.mjs
 *   node scripts/build-edgeone.mjs --push                # 构建并推送到 GitHub pages 分支
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import QRCode from 'qrcode'
import { activityPage, dailyIndexPage, dailyPostPage, escapeHtml } from '../pages.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(ROOT, 'edgeone-dist')

const BACKEND = 'https://ai-credit-hub-44763.app.workbuddy.host'
const SHARE = 'RIOZLFZCRN'
const SITE_URL = String(process.env.EDGEONE_SITE_URL || 'https://ai-freebie-radar.edgeone.app').replace(/\/+$/, '')
const REPO = 'https://github.com/haiying-ai/ai-freebie-radar.git'
const PUSH = process.argv.includes('--push')

function log(...a) { console.log('[edgeone]', ...a) }
function write(rel, content) {
  const p = path.join(OUT, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content)
}

async function getJson(url) {
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } })
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`)
  return r.json()
}

function dayOf(v) { return String(v || '').slice(0, 10) }

async function main() {
  log('站点地址:', SITE_URL)
  log('拉取线上数据…')
  const actsRes = await getJson(`${BACKEND}/api/activities?sharecode=${SHARE}`)
  const digRes = await getJson(`${BACKEND}/api/digest?sharecode=${SHARE}`)
  const activities = Array.isArray(actsRes.data) ? actsRes.data : []
  const digests = (Array.isArray(digRes.data) ? digRes.data : []).filter(d => d && dayOf(d.digest_date))
  log(`活动 ${activities.length} 条 / 日报 ${digests.length} 篇`)

  fs.rmSync(OUT, { recursive: true, force: true })
  fs.mkdirSync(OUT, { recursive: true })

  /* ---------- 首页 ---------- */
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
  const BACKEND_HOST = new URL(BACKEND).host
  const SITE_HOST = new URL(SITE_URL).host
  html = html.split(BACKEND_HOST).join(SITE_HOST).split(`?sharecode=${SHARE}`).join('')
  write('index.html', html)

  /* ---------- 数据快照 ---------- */
  write('data/activities.json', JSON.stringify({
    data: activities,
    syncedAt: new Date().toISOString(),
  }, null, 0))
  write('data/digests.json', JSON.stringify({ data: digests }, null, 0))

  /* ---------- 活动详情页 ---------- */
  const active = activities.filter(a => (a.status || 'active') === 'active')
  for (const a of activities) {
    const related = active
      .filter(r => r.id !== a.id && (!a.category || r.category === a.category))
      .slice(0, 5)
    const page = activityPage(a, {
      related,
      canonical: `${SITE_URL}/a/${a.id}`,
      ogImage: `${SITE_URL}/og-cover.png`,
      homeUrl: '/',
    })
    write(`a/${a.id}/index.html`, page)
  }
  log(`详情页 ${activities.length} 个`)

  /* ---------- 日报 ---------- */
  write('daily/index.html', dailyIndexPage(
    digests.map(d => ({ digest_date: dayOf(d.digest_date), title: d.title, body: d.body })),
    { canonical: `${SITE_URL}/daily`, ogImage: `${SITE_URL}/og-cover.png`, homeUrl: '/' }
  ))
  for (const d of digests) {
    const date = dayOf(d.digest_date)
    write(`daily/${date}/index.html`, dailyPostPage(
      { digest_date: date, title: d.title, body: d.body },
      { canonical: `${SITE_URL}/daily/${date}`, ogImage: `${SITE_URL}/og-cover.png`, homeUrl: '/' }
    ))
  }
  log(`日报页 ${digests.length + 1} 个`)

  /* ---------- sitemap / robots ---------- */
  const nowIso = new Date().toISOString()
  const urls = [
    { loc: `${SITE_URL}/`, lastmod: nowIso, freq: 'daily', pr: '1.0' },
    { loc: `${SITE_URL}/daily`, lastmod: nowIso, freq: 'daily', pr: '0.8' },
    ...activities.map(a => ({ loc: `${SITE_URL}/a/${a.id}`, lastmod: a.last_updated || nowIso, freq: 'weekly', pr: '0.7' })),
    ...digests.map(d => ({ loc: `${SITE_URL}/daily/${dayOf(d.digest_date)}`, lastmod: d.updated_at || d.digest_date || nowIso, freq: 'monthly', pr: '0.6' })),
  ]
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pr}</priority></url>`).join('\n')}
</urlset>`)
  write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`)

  /* ---------- 静态资源 ---------- */
  const cover = path.join(ROOT, 'article-images', 'cover-2.35x1.png')
  if (fs.existsSync(cover)) write('og-cover.png', fs.readFileSync(cover))

  const qr = await QRCode.toString(`${SITE_URL}/`, {
    type: 'svg', margin: 1, width: 480, errorCorrectionLevel: 'M',
    color: { dark: '#0b0f1a', light: '#ffffff' },
  })
  write('data/qr.svg', qr)

  /* ---------- 边缘函数 ---------- */
  const fnSrc = path.join(ROOT, 'edgeone', 'functions')
  const fnDst = path.join(OUT, 'edge-functions')
  fs.cpSync(fnSrc, fnDst, { recursive: true })
  log('边缘函数已复制:', fs.readdirSync(path.join(fnDst, 'api')).join(', '))

  const size = execFileSync('du', ['-sh', OUT], { encoding: 'utf8' }).split('\t')[0]
  log(`构建完成 → edgeone-dist（${size.trim()}）`)

  if (PUSH) {
    log('推送到 GitHub pages 分支…')
    const run = (cmd, args, cwd = OUT) => execFileSync(cmd, args, { cwd, stdio: 'inherit' })
    if (!fs.existsSync(path.join(OUT, '.git'))) run('git', ['init', '-q'])
    run('git', ['checkout', '-q', '-B', 'pages'])
    run('git', ['add', '-A'])
    try {
      run('git', ['commit', '-q', '-m', `chore: 静态站构建 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`])
    } catch (e) { log('无变更，跳过提交') }
    run('git', ['push', '-f', REPO, 'pages'])
    log('已推送：branch pages')
  }
}

main().catch(e => {
  console.error('[edgeone] 构建失败:', e)
  process.exit(1)
})
