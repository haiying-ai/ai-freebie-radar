/**
 * GET /api/stats —— 访问量展示值（EdgeOne Edge Functions · V8 运行时）
 *
 * 展示值 = 历史基线（按 24 小时作息曲线随时间推进） + KV 里的真实计数
 * 真实计数由 /api/visit 写入，KV 中 key：
 *   v:pv:total      累计 PV
 *   v:pv:YYYY-MM-DD 当日 PV
 */

const VISIT = {
  anchor: '2026-10-04',
  startTotal: 3500,
  dailyAvg: 260,
  weights: [0.40, 0.25, 0.15, 0.08, 0.06, 0.12, 0.30, 0.55, 0.85, 1.05, 1.15, 1.10,
    1.00, 0.95, 1.05, 1.05, 1.00, 0.95, 1.05, 1.20, 1.30, 1.35, 1.15, 0.70],
}
const W_SUM = VISIT.weights.reduce((a, b) => a + b, 0)

export function shanghaiParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const g = t => Number((parts.find(p => p.type === t) || {}).value || 0)
  let h = g('hour')
  if (h === 24) h = 0
  return { y: g('year'), m: g('month'), d: g('day'), h, min: g('minute') }
}

export function dayKeyOf(d = new Date()) {
  const p = shanghaiParts(d)
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

function dayNoise(key) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) }
  return 0.8 + ((h >>> 0) % 401) / 1000
}

function dayBase(key) { return VISIT.dailyAvg * dayNoise(key) }

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
  while (guard++ < 900) {
    const k = dayKeyOf(cur)
    if (k >= today) break
    total += dayBase(k)
    cur = new Date(cur.getTime() + 86400000)
  }
  return { total, today: dayBase(today) * dayProgress() }
}

export async function readStats() {
  const base = baselineNow()
  let realToday = 0
  let realTotal = 0
  try {
    if (typeof my_kv !== 'undefined' && my_kv) {
      const tk = dayKeyOf()
      const [t, d] = await Promise.all([
        my_kv.get('v:pv:total'),
        my_kv.get(`v:pv:${tk}`),
      ])
      realTotal = Number(t || 0) || 0
      realToday = Number(d || 0) || 0
    }
  } catch (e) { /* KV 未绑定则只展示基线 */ }
  return {
    today: Math.round(base.today + realToday),
    total: Math.round(base.total + realTotal),
    at: new Date().toISOString(),
  }
}

export async function onRequestGet() {
  const body = JSON.stringify(await readStats())
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequest({ request }) {
  return onRequestGet({ request })
}
