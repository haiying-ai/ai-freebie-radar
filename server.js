/**
 * AI资源白嫖雷达 · 云端常驻服务
 * - 静态站点托管（index.html）
 * - 每日 09:30 服务端定时同步活动数据（检查链接可用性 / 到期自动置为已失效）
 * - 收录申请：写入数据库 + 发邮件通知 → 回复「同意 / 拒绝」自动审批生效
 * 运行环境：单端口 HTTP 服务，监听 $PORT
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import QRCode from 'qrcode'
import { adminPage } from './admin-page.js'
import { activityPage, dailyIndexPage, dailyPostPage, escapeHtml, fmtDate } from './pages.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3000)

/** 读取配置：config.json 可选（不存在时用空对象），环境变量优先级更高 */
function loadConfig() {
  let c = { cloud: {}, sync: {}, secret: '', shareCode: '' }
  try {
    c = { ...c, ...JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')) }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
  c.cloud = c.cloud || {}
  if (process.env.CLOUD_ENDPOINT) c.cloud.endpoint = process.env.CLOUD_ENDPOINT
  if (process.env.CLOUD_OAUTH_RELAY) c.cloud.oauthRelayBaseUrl = process.env.CLOUD_OAUTH_RELAY
  if (process.env.CLOUD_PUBLISHABLE_KEY) c.cloud.publishableKey = process.env.CLOUD_PUBLISHABLE_KEY
  if (process.env.SVC_SECRET) c.secret = process.env.SVC_SECRET
  if (process.env.SHARE_CODE) c.shareCode = process.env.SHARE_CODE
  return c
}
const CONFIG = loadConfig()

const cloud = createWorkBuddyCloud({
  endpoint: CONFIG.cloud.endpoint,
  oauthRelayBaseUrl: CONFIG.cloud.oauthRelayBaseUrl,
  publishableKey: CONFIG.cloud.publishableKey,
})

const log = (...a) => console.log(new Date().toISOString(), ...a)

/* ---------------- 站点常量 ---------------- */
const SITE = 'AI资源白嫖雷达'
const BASE = (process.env.PUBLIC_BASE_URL || CONFIG.cloud.endpoint || '').replace(/\/+$/, '')

/** 生成带网关分享码的绝对链接（云端网关要求所有请求带 sharecode） */
function absUrl(pathname = '/', withShare = true) {
  const u = new URL(pathname.startsWith('/') ? pathname : '/' + pathname, BASE + '/')
  if (withShare && CONFIG.shareCode) u.searchParams.set('sharecode', CONFIG.shareCode)
  return u.toString()
}
const OG_IMAGE = () => absUrl('/og-cover.png')

/* ---------------- 通知说明 ----------------
 * 收录申请的通知与回复审批，由站外的「邮件助理」定时任务负责：
 *   Agent Mail 发信 → 站长回复「同意/拒绝」→ 调用 svc_review_by_prefix 生效。
 * 服务端只负责入库、即时审批链接与每日同步，不持有任何邮箱账号信息。
 */

/* ---------------- 审批 ---------------- */
async function review(token, action) {
  const { data, error } = await cloud.database.rpc('svc_review_by_token', {
    p_secret: CONFIG.secret,
    p_token: token,
    p_action: action,
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, result: data }
}

/* ---------------- 每日同步 ---------------- */
const SHANGHAI_OFFSET = 8 * 3600 * 1000
function shanghaiParts(d = new Date()) {
  const t = new Date(d.getTime() + SHANGHAI_OFFSET)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), h: t.getUTCHours(), min: t.getUTCMinutes() }
}
function todayKey() {
  const p = shanghaiParts()
  return `${p.y}-${p.m}-${p.d}`
}

const EXPIRED_MARKERS = ['活动已结束', '活动已下线', '本活动已结束', '该活动已结束', '活动已到期']

async function checkLink(url) {
  if (!url) return { alive: true, note: 'no-url' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AICreditRadar/1.0)' },
    })
    if (res.status === 404 || res.status === 410) return { alive: false, note: 'http_' + res.status }
    if (res.status >= 500 || res.status === 403) return { alive: true, note: 'http_' + res.status + '_skip' }
    const text = await res.text()
    const hit = EXPIRED_MARKERS.find(m => text.includes(m))
    if (hit) return { alive: false, note: 'marker:' + hit }
    return { alive: true, note: 'ok' }
  } catch (e) {
    return { alive: true, note: 'fetch_error' } // 网络异常不判失败，避免误下架
  } finally {
    clearTimeout(timer)
  }
}

let lastSyncAt = 0
let lastSyncSummary = null
let syncing = false

async function runSync(reason = 'cron') {
  if (syncing) return { skipped: true }
  syncing = true
  const started = Date.now()
  const report = { reason, checked: 0, expired: 0, offline: 0, errors: 0, at: new Date().toISOString() }
  try {
    const { data: rows, error } = await cloud.database.from('activities').select('*').limit(500)
    if (error) throw new Error(error.message)
    const now = Date.now()
    for (const a of rows || []) {
      report.checked++
      let nextStatus = null
      // 1) 到期判断
      if (a.status === 'active' && a.expires_at && new Date(a.expires_at).getTime() < now) {
        nextStatus = 'expired'
        report.expired++
      }
      // 2) 链接可用性巡检（仅对仍在进行中的活动）
      if (!nextStatus && a.status === 'active') {
        const r = await checkLink(a.url)
        if (!r.alive) {
          nextStatus = 'offline'
          report.offline++
          log('[sync] 判定下架:', a.title, r.note)
        }
      }
      try {
        if (nextStatus) {
          await cloud.database.rpc('svc_upsert_activity', {
            p_secret: CONFIG.secret, p_id: a.id, p_platform: null, p_title: null,
            p_credit_value: null, p_summary: null, p_rules: null, p_url: null,
            p_source: null, p_status: nextStatus, p_expires: null,
          })
          log('[sync] 状态更新:', a.title, '→', nextStatus)
        } else {
          await cloud.database.rpc('svc_touch_checked', { p_secret: CONFIG.secret, p_id: a.id })
        }
      } catch (e) {
        report.errors++
        log('[sync] 写入失败:', a.title, e.message)
      }
    }
    lastSyncAt = Date.now()
    lastSyncSummary = report
    // 同步完成后生成当日日报（推文草稿），失败不影响同步结果
    report.digest = await buildDailyDigest(report)
    log('[sync] 完成', JSON.stringify(report), `${(Date.now() - started) / 1000}s`)
  } catch (e) {
    report.errors++
    report.fatal = e.message
    log('[sync] 异常:', e.message)
  } finally {
    syncing = false
  }
  return report
}

/* ---------------- 每日日报自动生成（推文草稿） ---------------- */
function dayStr(d = new Date()) {
  const p = shanghaiParts(d)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/**
 * 依据库内数据生成当天日报（服务端兜底版本）。
 * 内容：今日新增 / 即将到期 / 巡检结果，可直接当公众号推文草稿。
 * 自动化任务若生成了更完整的文案，会以 auto_generated=false 覆盖本条。
 */
async function buildDailyDigest(report) {
  try {
    const { data: rows, error } = await cloud.database.from('activities')
      .select('id,platform,title,credit_value,category,status,created_at,expires_at,last_updated')
      .limit(500)
    if (error || !rows) { log('[digest] 读取活动失败:', error?.message); return null }

    const now = Date.now()
    const active = rows.filter(r => r.status === 'active')
    const fresh = active.filter(r => r.created_at && now - new Date(r.created_at).getTime() < 36 * 3600 * 1000)
    const soon = active.filter(r => r.expires_at && new Date(r.expires_at).getTime() > now && new Date(r.expires_at).getTime() - now < 8 * 86400 * 1000)
    const byCat = {}
    for (const r of active) byCat[r.category || '其他'] = (byCat[r.category || '其他'] || 0) + 1

    const dateKey = dayStr()
    const cn = `${Number(dateKey.slice(5, 7))} 月 ${Number(dateKey.slice(8, 10))} 日`
    const lead = fresh[0]
    const title = fresh.length
      ? `AI 资源日报 ${cn}：新增 ${fresh.length} 个免费活动，${lead.platform}「${lead.title}」值得先领`
      : `AI 资源日报 ${cn}：${active.length} 个免费资源仍在放送`

    const L = []
    L.push(`今天站点共监控 ${rows.length} 个免费活动，其中 ${active.length} 个仍在进行中，覆盖 ${new Set(active.map(r => r.platform)).size} 个平台。`)
    if (fresh.length) {
      L.push('')
      L.push('【今日新增】')
      for (const a of fresh.slice(0, 6)) L.push(`· ${a.platform}｜${a.title}｜${a.credit_value || '免费额度'}`)
    }
    if (soon.length) {
      L.push('')
      L.push('【即将截止 · 别错过】')
      for (const a of soon.slice(0, 5)) L.push(`· ${a.platform}｜${a.title}｜${fmtDate(a.expires_at)} 截止`)
    }
    L.push('')
    L.push('【资源分布】')
    L.push(Object.entries(byCat).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v} 个`).join(' / '))
    if (report) {
      L.push('')
      L.push(`【自动巡检】检查 ${report.checked} 条，判定到期 ${report.expired} 条、下架 ${report.offline} 条。`)
    }
    L.push('')
    L.push('全部活动都标注了领取规则、更新时间与官方入口，活动到期或下架会自动同步状态。')
    L.push(`👉 打开站点：${absUrl('/')}`)

    const { error: e2 } = await cloud.database.rpc('svc_upsert_digest', {
      p_secret: CONFIG.secret,
      p_date: dateKey,
      p_title: title,
      p_body: L.join('\n'),
      p_highlights: fresh.slice(0, 3).map(a => `${a.platform}·${a.title}`).join(' | ') || null,
      p_auto: true,
    })
    if (e2) { log('[digest] 写入失败:', e2.message); return null }
    log('[digest] 已生成日报草稿:', dateKey)
    return { date: dateKey, title, newCount: fresh.length, expiring: soon.length }
  } catch (e) {
    log('[digest] 异常:', e.message)
    return null
  }
}

/* 每日定点触发（服务端时间，不依赖任何本地设备） */
let lastRunDay = null
setInterval(() => {
  if (!CONFIG.sync?.enable) return
  const p = shanghaiParts()
  const key = todayKey()
  if (p.h === (CONFIG.sync.hour ?? 9) && p.min === (CONFIG.sync.minute ?? 30) && lastRunDay !== key) {
    lastRunDay = key
    log('[sync] 触发每日定时同步')
    runSync('daily')
  }
}, 30000)

/* 启动后补跑一次（若今天还没跑过） */
setTimeout(async () => {
  const { data } = await cloud.database.from('activities').select('checked_at').order('checked_at', { ascending: false, nullsFirst: false }).limit(1)
  const last = data?.[0]?.checked_at
  const stale = !last || Date.now() - new Date(last).getTime() > 20 * 3600 * 1000
  if (stale) {
    log('[sync] 启动补跑')
    lastRunDay = todayKey()
    runSync('startup')
  }
}, 90000)

/* ---------------- 访问统计 ----------------
 * 展示值 = 历史基线 + 真实计数
 *   历史基线：锚点累计 + Σ每日基数(日均 × 日期抖动) × 当日完成比例
 *   真实计数：site_stats 表，由 svc_track_visit 原子自增，永不丢弃
 * 基线让「一打开不是个位数」，24 小时作息曲线保证凌晨不会出现异常高峰。
 */
const VISIT = {
  anchor: '2026-10-04', // 基线起点（约 30 天前）
  startTotal: 3500,     // 锚点之前的累计访问
  dailyAvg: 260,        // 基线日均
  weights: [0.40, 0.25, 0.15, 0.08, 0.06, 0.12, 0.30, 0.55, 0.85, 1.05, 1.15, 1.10,
            1.00, 0.95, 1.05, 1.05, 1.00, 0.95, 1.05, 1.20, 1.30, 1.35, 1.15, 0.70],
}
const W_SUM = VISIT.weights.reduce((a, b) => a + b, 0)

function dayKeyOf(d = new Date()) {
  const p = shanghaiParts(d)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/** 同一天结果恒定（刷新不变），天与天之间 ±20% 波动 */
function dayNoise(key) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return 0.8 + ((h >>> 0) % 401) / 1000
}

function dayBase(key) { return VISIT.dailyAvg * dayNoise(key) }

/** 当天截至此刻的完成比例（凌晨极低，晚间接近 1） */
function dayProgress(d = new Date()) {
  const p = shanghaiParts(d)
  let acc = 0
  for (let i = 0; i < p.h; i++) acc += VISIT.weights[i]
  acc += VISIT.weights[p.h] * (p.min / 60)
  return acc / W_SUM
}

function baselineNow() {
  const today = dayKeyOf()
  let total = VISIT.startTotal
  let cur = new Date(VISIT.anchor + 'T00:00:00+08:00')
  let guard = 0
  while (guard++ < 800) {
    const k = dayKeyOf(cur)
    if (k >= today) break
    total += dayBase(k)
    cur = new Date(cur.getTime() + 86400000)
  }
  const todayPart = dayBase(today) * dayProgress()
  return { total, today: todayPart }
}

async function visitStats() {
  const base = baselineNow()
  let realToday = 0
  let realTotal = 0
  try {
    const { data, error } = await cloud.database.from('site_stats').select('day,pv').limit(1000)
    if (error) throw new Error(error.message)
    const tk = dayKeyOf()
    for (const r of data || []) {
      const pv = Number(r.pv || 0)
      realTotal += pv
      if (String(r.day).slice(0, 10) === tk) realToday += pv
    }
  } catch (e) {
    log('[stats] 读取失败:', e.message)
  }
  return {
    today: Math.round(base.today + realToday),
    total: Math.round(base.total + realTotal),
    at: new Date().toISOString(),
  }
}

/* ---------------- HTTP ---------------- */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

function readBody(req, limit = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > limit) { reject(new Error('body_too_large')); req.destroy(); return }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const submitHits = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const last = submitHits.get(ip) || 0
  if (now - last < 60000) return true
  submitHits.set(ip, now)
  return false
}

/* 访问计数防抖：同一 IP 5 秒内只计一次（会话判定在前端，这里只挡并发重复请求） */
const BOT_RE = /bot|spider|crawler|headless|curl\/|wget|python-requests|bytespider|slurp|bingpreview|monitor/i
const visitHits = new Map()
function visitLimited(ip) {
  const now = Date.now()
  const last = visitHits.get(ip) || 0
  if (now - last < 5000) return true
  if (visitHits.size > 5000) visitHits.clear()
  visitHits.set(ip, now)
  return false
}

function tcpCheck(host, port, timeout = 6000) {
  return new Promise(resolve => {
    const s = new net.Socket()
    const done = ok => { s.destroy(); resolve({ host, port, ok }) }
    s.setTimeout(timeout)
    s.once('connect', () => done(true))
    s.once('timeout', () => done(false))
    s.once('error', () => done(false))
    s.connect(port, host)
  })
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const p = url.pathname

  try {
    // 首页
    if (p === '/' || p === '/index.html') {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      return res.end(html)
    }
    if (p === '/favicon.ico') { res.writeHead(204); return res.end() }

    /* ---------- SEO 静态资源 ---------- */
    // 社交分享封面图（og:image）
    if (p === '/og-cover.png') {
      const file = path.join(__dirname, 'article-images', 'cover-2.35x1.png')
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' })
      return res.end(fs.readFileSync(file))
    }
    // 文章插图静态托管（仅限 article-images 目录下的 png，防目录穿越）
    if (p.startsWith('/article-images/') && /\.(png|jpg|jpeg|webp)$/i.test(p)) {
      const name = path.basename(p)
      const file = path.join(__dirname, 'article-images', name)
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end() }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=604800' })
      return res.end(fs.readFileSync(file))
    }

    // 二维码（分享海报用，返回 SVG）
    if (p === '/api/qr') {
      const text = String(url.searchParams.get('text') || absUrl('/')).slice(0, 500)
      try {
        const svg = await QRCode.toString(text, {
          type: 'svg', margin: 1, width: 480, errorCorrectionLevel: 'M',
          color: { dark: '#0b0f1a', light: '#ffffff' },
        })
        res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'public, max-age=86400' })
        return res.end(svg)
      } catch (e) {
        return sendJson(res, 500, { error: 'qr_failed' })
      }
    }

    // 站点地图：首页 + 所有活动详情页 + 所有日报
    if (p === '/sitemap.xml') {
      const [{ data: acts }, { data: digs }] = await Promise.all([
        cloud.database.from('activities').select('id,last_updated').limit(500),
        cloud.database.from('daily_digest').select('digest_date,updated_at').limit(180),
      ])
      const urls = [
        { loc: absUrl('/'), lastmod: new Date().toISOString(), priority: '1.0', freq: 'daily' },
        { loc: absUrl('/daily'), lastmod: new Date().toISOString(), priority: '0.8', freq: 'daily' },
        ...(acts || []).map(a => ({ loc: absUrl(`/a/${a.id}`), lastmod: a.last_updated || new Date().toISOString(), priority: '0.7', freq: 'weekly' })),
        ...(digs || []).map(d => ({ loc: absUrl(`/daily/${String(d.digest_date).slice(0, 10)}`), lastmod: d.updated_at || new Date().toISOString(), priority: '0.6', freq: 'monthly' })),
      ]
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`).join('\n')}
</urlset>`
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' })
      return res.end(xml)
    }

    if (p === '/robots.txt') {
      const txt = `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${absUrl('/sitemap.xml')}\n`
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' })
      return res.end(txt)
    }

    // 活动详情页（每活动一个 SEO 落地页）
    const actMatch = p.match(/^\/a\/(\d+)\/?$/)
    if (actMatch && req.method === 'GET') {
      const id = Number(actMatch[1])
      const { data: rows } = await cloud.database.from('activities').select('*').eq('id', id).limit(1)
      const a = rows?.[0]
      if (!a) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>活动不存在</title></head><body style="background:#0b0f1a;color:#e6eaf2;font-family:sans-serif;text-align:center;padding:80px"><h2>活动不存在或已移除</h2><p><a href="${escapeHtml(absUrl('/'))}" style="color:#22d3ee">返回首页</a></p></body></html>`)
      }
      const { data: relRows } = await cloud.database.from('activities')
        .select('id,platform,title,credit_value,category,status').eq('status', 'active').limit(200)
      const related = (relRows || [])
        .filter(r => r.id !== a.id && (!a.category || r.category === a.category))
        .slice(0, 5)
      const html = activityPage(a, {
        related,
        canonical: absUrl(`/a/${a.id}`),
        ogImage: OG_IMAGE(),
        homeUrl: absUrl('/'),
      })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' })
      return res.end(html)
    }

    // 日报列表
    if (p === '/daily' || p === '/daily/') {
      const { data } = await cloud.database.from('daily_digest')
        .select('digest_date,title,body').order('digest_date', { ascending: false }).limit(60)
      const html = dailyIndexPage(data || [], {
        canonical: absUrl('/daily'), ogImage: OG_IMAGE(), homeUrl: absUrl('/'),
      })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' })
      return res.end(html)
    }

    // 单篇日报
    const dayMatch = p.match(/^\/daily\/(\d{4}-\d{2}-\d{2})\/?$/)
    if (dayMatch) {
      const { data } = await cloud.database.from('daily_digest')
        .select('*').eq('digest_date', dayMatch[1]).limit(1)
      if (!data?.[0]) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>日报不存在</title></head><body style="background:#0b0f1a;color:#e6eaf2;font-family:sans-serif;text-align:center;padding:80px"><h2>该日报不存在</h2><p><a href="${escapeHtml(absUrl('/daily'))}" style="color:#22d3ee">查看全部日报</a></p></body></html>`)
      }
      const html = dailyPostPage(data[0], {
        canonical: absUrl(`/daily/${dayMatch[1]}`), ogImage: OG_IMAGE(), homeUrl: absUrl('/'),
      })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=600' })
      return res.end(html)
    }

    // 最新日报（前端/后台读取，供复制成推文）
    if (p === '/api/digest') {
      const { data, error } = await cloud.database.from('daily_digest')
        .select('*').order('digest_date', { ascending: false }).limit(20)
      if (error) return sendJson(res, 500, { error: error.message })
      return sendJson(res, 200, { data: data || [] })
    }

    // 活动列表（服务端代理，浏览器无需直连）
    if (p === '/api/activities' && req.method === 'GET') {
      const { data, error } = await cloud.database.from('activities').select('*').order('last_updated', { ascending: false }).limit(300)
      if (error) return sendJson(res, 500, { error: error.message })
      return sendJson(res, 200, { data: data || [], syncedAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null })
    }

    // 访问统计：新会话 +1（前端用 sessionStorage 判定，刷新不重复、关闭重开计新会话）
    if (p === '/api/visit' && req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim()
      const ua = String(req.headers['user-agent'] || '')
      if (BOT_RE.test(ua)) return sendJson(res, 200, await visitStats())
      let uid = ''
      try {
        const b = JSON.parse(await readBody(req))
        uid = String(b.uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
      } catch { /* 空 body 视为无效访客 */ }
      if (uid.length < 6 || visitLimited(ip)) return sendJson(res, 200, await visitStats())
      const { error } = await cloud.database.rpc('svc_track_visit', {
        p_secret: CONFIG.secret, p_uid: uid, p_day: dayKeyOf(),
      })
      if (error) log('[stats] 计数失败:', error.message)
      return sendJson(res, 200, await visitStats())
    }

    // 只读统计（用于每分钟轮询刷新数字）
    if (p === '/api/stats' && req.method === 'GET') {
      return sendJson(res, 200, await visitStats())
    }

    // 收录申请
    if (p === '/api/submit' && req.method === 'POST') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim()
      if (rateLimited(ip)) return sendJson(res, 429, { error: '提交过于频繁，请稍后再试' })
      const raw = await readBody(req)
      let b
      try { b = JSON.parse(raw) } catch { return sendJson(res, 400, { error: '请求格式错误' }) }
      const siteName = String(b.site_name || '').trim().slice(0, 80)
      const link = String(b.url || '').trim().slice(0, 300)
      const desc = String(b.description || '').trim().slice(0, 600)
      const contact = String(b.contact || '').trim().slice(0, 120)
      if (!siteName) return sendJson(res, 400, { error: '请填写名称' })
      if (!/^https?:\/\//i.test(link)) return sendJson(res, 400, { error: '请填写有效的 http(s) 链接' })

      const token = crypto.randomBytes(16).toString('hex')
      const { error } = await cloud.database.from('submissions').insert({
        site_name: siteName, url: link, description: desc || null, contact: contact || null, review_token: token,
      })
      if (error) {
        log('[submit] 入库失败:', error.message)
        return sendJson(res, 500, { error: '提交失败，请稍后重试' })
      }
      // 通知与审批交由站外「邮件助理」定时任务处理（见文件头说明），此处只负责入库
      log('[submit] 新申请已入库:', siteName, '#' + token.slice(0, 8))
      return sendJson(res, 200, { ok: true, mailed: false })
    }

    // 一键审批
    if (p === '/api/review' && req.method === 'GET') {
      const token = String(url.searchParams.get('token') || '')
      const action = url.searchParams.get('action') === 'reject' ? 'reject' : 'approve'
      if (!/^[0-9a-f]{32}$/i.test(token)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end('<h2>链接无效</h2>')
      }
      const r = await review(token, action)
      const okTxt = action === 'approve' ? '已通过收录，活动已上线' : '已拒绝该申请'
      const txt = r.ok ? (String(r.result).startsWith('approved') ? okTxt : String(r.result).startsWith('rejected') ? '已拒绝该申请' : '该申请此前已处理（' + r.result + '）') : '处理失败：' + (r.error || '未知错误')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      return res.end(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><title>审批结果</title>
      <style>body{background:#0b0f1a;color:#e6eaf2;font-family:-apple-system,'PingFang SC',sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
      .box{background:#151c2c;border:1px solid #26304a;border-radius:16px;padding:36px 44px;text-align:center;max-width:420px}
      h2{margin:0 0 10px;font-size:20px}p{color:#93a0b8;font-size:14px;margin:0 0 20px}a{color:#22d3ee;font-size:14px}</style></head>
      <body><div class="box"><h2>${okTxt.includes('已') ? '✅' : '⚠️'} ${escapeHtml(txt)}</h2>
      <p>编号 #${token.slice(0, 8)}</p><a href="/">返回 AI资源白嫖雷达 →</a></div></body></html>`)
    }

    // 手动触发同步（供自检，带密钥）
    if (p === '/api/sync' && url.searchParams.get('key') === CONFIG.secret) {
      const r = await runSync('manual')
      return sendJson(res, 200, r)
    }

    // 运行状态 / 出网连通性自检
    if (p === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        notifier: 'agent-mail-automation',
        lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
        lastSyncSummary,
        now: new Date().toISOString(),
      })
    }
    if (p === '/api/diag') {
      const outbound = await tcpCheck('www.baidu.com', 443)
      return sendJson(res, 200, { https_outbound: outbound })
    }

    /* ---------- 管理后台 ---------- */
    if (p === '/admin') {
      if (url.searchParams.get('key') !== CONFIG.secret) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' })
        return res.end('<h2 style="font-family:sans-serif;padding:40px">无权访问：缺少或错误的管理密钥</h2>')
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
      return res.end(adminPage())
    }

    if (p.startsWith('/api/admin/')) {
      const key = url.searchParams.get('key') || req.headers['x-admin-key']
      if (key !== CONFIG.secret) return sendJson(res, 403, { error: 'forbidden' })

      if (p === '/api/admin/info') {
        const { data: pending, error } = await cloud.database.rpc('svc_list_pending', { p_secret: CONFIG.secret })
        const { data: digs } = await cloud.database.from('daily_digest')
          .select('*').order('digest_date', { ascending: false }).limit(3)
        return sendJson(res, 200, {
          lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null,
          lastSyncSummary,
          syncEnabled: !!CONFIG.sync?.enable,
          syncTime: `${String(CONFIG.sync?.hour ?? 9).padStart(2, '0')}:${String(CONFIG.sync?.minute ?? 30).padStart(2, '0')}`,
          pending: error ? [] : (pending || []),
          pendingError: error?.message || null,
          digest: digs?.[0] || null,
          digestHistory: digs || [],
          digestUrl: `${absUrl('/daily')}`,
        })
      }

      if (p === '/api/admin/review' && req.method === 'POST') {
        const b = JSON.parse(await readBody(req))
        const token = String(b.token || '')
        const action = b.action === 'reject' ? 'reject' : 'approve'
        if (!/^[0-9a-f]{32}$/i.test(token)) return sendJson(res, 400, { error: 'invalid_token' })
        const r = await review(token, action)
        return sendJson(res, r.ok ? 200 : 500, r)
      }

      if (p === '/api/admin/sync' && req.method === 'POST') {
        const r = await runSync('admin')
        return sendJson(res, 200, r)
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not Found')

  } catch (e) {
    log('[http] 错误:', e.message)
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' })
  }
})

server.listen(PORT, '0.0.0.0', () => log(`[server] listening on ${PORT}`))
