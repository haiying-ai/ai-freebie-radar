/**
 * 本地预览 EdgeOne 静态站（模拟边缘函数，不需要登录 EdgeOne）
 *   node scripts/preview-edgeone.mjs [port]
 * 访问 http://127.0.0.1:3114/
 */
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(path.resolve(__dirname, '..'), 'edgeone-dist')
const PORT = Number(process.argv[2] || 3114)

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

// —— 模拟 KV 计数 ——
const kv = new Map()
const visitHits = new Map()

const VISIT = {
  anchor: '2026-10-04', startTotal: 3500, dailyAvg: 260,
  weights: [0.40, 0.25, 0.15, 0.08, 0.06, 0.12, 0.30, 0.55, 0.85, 1.05, 1.15, 1.10,
    1.00, 0.95, 1.05, 1.05, 1.00, 0.95, 1.05, 1.20, 1.30, 1.35, 1.15, 0.70],
}
const W_SUM = VISIT.weights.reduce((a, b) => a + b, 0)

function parts(d = new Date()) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = t => Number((p.find(x => x.type === t) || {}).value || 0)
  let h = g('hour'); if (h === 24) h = 0
  return { y: g('year'), m: g('month'), d: g('day'), h, min: g('minute') }
}
const dayKey = (d) => { const p = parts(d); return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` }
const noise = k => { let h = 2166136261; for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619) } return 0.8 + ((h >>> 0) % 401) / 1000 }
const base = k => VISIT.dailyAvg * noise(k)
function progress() {
  const p = parts(); let acc = 0
  for (let i = 0; i < p.h; i++) acc += VISIT.weights[i]
  acc += VISIT.weights[p.h] * (p.min / 60)
  return acc / W_SUM
}
function stats() {
  const today = dayKey()
  let total = VISIT.startTotal
  let cur = new Date(VISIT.anchor + 'T00:00:00+08:00')
  let g = 0
  while (g++ < 900) { const k = dayKey(cur); if (k >= today) break; total += base(k); cur = new Date(cur.getTime() + 86400000) }
  return {
    today: Math.round(base(today) * progress() + Number(kv.get(`v:pv:${today}`) || 0)),
    total: Math.round(total + Number(kv.get('v:pv:total') || 0)),
    at: new Date().toISOString(),
  }
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname)
  let file = path.join(ROOT, rel)
  if (rel.endsWith('/')) file = path.join(file, 'index.html')
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const alt = path.join(ROOT, rel + '.html')
    const idx = path.join(ROOT, rel, 'index.html')
    if (fs.existsSync(alt)) file = alt
    else if (fs.existsSync(idx)) file = idx
    else { res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end('<h1>404</h1>') }
  }
  if (file.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end() }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' })
  res.end(fs.readFileSync(file))
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const p = url.pathname

  if (p === '/api/activities') {
    const snap = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'activities.json'), 'utf8'))
    return json(res, 200, snap)
  }

  if (p === '/api/stats') return json(res, 200, stats())

  if (p === '/api/visit' && req.method === 'POST') {
    let raw = ''
    req.on('data', c => raw += c)
    req.on('end', () => {
      let uid = ''
      try { uid = String(JSON.parse(raw).uid || '') } catch (e) { }
      const ip = req.socket.remoteAddress || ''
      const now = Date.now()
      const last = visitHits.get(ip) || 0
      if (uid.length >= 6 && now - last > 5000) {
        visitHits.set(ip, now)
        kv.set('v:pv:total', Number(kv.get('v:pv:total') || 0) + 1)
        kv.set(`v:pv:${dayKey()}`, Number(kv.get(`v:pv:${dayKey()}`) || 0) + 1)
      }
      json(res, 200, stats())
    })
    return
  }

  if (p === '/api/qr') {
    const svg = fs.readFileSync(path.join(ROOT, 'data', 'qr.svg'))
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' })
    return res.end(svg)
  }

  if (p === '/api/submit' && req.method === 'POST') return json(res, 200, { ok: true, mailed: false })

  return serveStatic(req, res, p)
}).listen(PORT, '127.0.0.1', () => console.log(`preview: http://127.0.0.1:${PORT}/`))
