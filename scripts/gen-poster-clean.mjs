// 生成「抖音版」干净海报：1080×1440，无二维码、无链接
// 用法: node scripts/gen-poster-clean.mjs
import { createCanvas, registerFont } from 'canvas'
import fs from 'node:fs'
import https from 'node:https'

const SHARECODE = 'RIOZLFZCRN'
const API = `https://ai-credit-hub-44763.app.workbuddy.host/api/activities?sharecode=${SHARECODE}`

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'poster-gen' } }, res => {
      let buf = ''
      res.on('data', d => (buf += d))
      res.on('end', () => {
        try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
      })
    }).on('error', reject)
  })
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 简单的中文按字符截断（canvas 无 ellipsis，手动处理）
function clip(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

const data = await getJSON(API)
const activities = data.data || []
const liveStatus = a => a.status || 'active'
const activeCnt = activities.filter(a => liveStatus(a) === 'active').length
const platCnt = new Set(activities.map(a => a.platform)).size

const W = 1080, H = 1440
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')
const FF = '"Microsoft YaHei","PingFang SC",sans-serif'
const F = (size, weight = '400') => `${weight} ${size}px ${FF}`

// 背景
const bg = ctx.createLinearGradient(0, 0, W, H)
bg.addColorStop(0, '#0b0f1a')
bg.addColorStop(.55, '#111a2e')
bg.addColorStop(1, '#0b0f1a')
ctx.fillStyle = bg
ctx.fillRect(0, 0, W, H)

// 顶部光晕
const glow = ctx.createRadialGradient(W * .82, 90, 30, W * .82, 90, 520)
glow.addColorStop(0, 'rgba(34,211,238,.30)')
glow.addColorStop(1, 'rgba(34,211,238,0)')
ctx.fillStyle = glow
ctx.fillRect(0, 0, W, 700)

// 雷达波纹
ctx.strokeStyle = 'rgba(34,211,238,.18)'
ctx.lineWidth = 2
for (let i = 1; i <= 4; i++) {
  ctx.beginPath()
  ctx.arc(110, 150, 42 * i, 0, Math.PI * 2)
  ctx.stroke()
}

// 标题
ctx.fillStyle = '#e6eaf2'
ctx.font = F(58, '800')
ctx.fillText('AI 资源白嫖雷达', 82, 300)
ctx.fillStyle = '#22d3ee'
ctx.font = F(40, '700')
ctx.fillText('专业白嫖 AI 资源，收藏这一个就够了', 82, 366)

// 数据条
ctx.fillStyle = 'rgba(52,211,153,.14)'
roundRect(ctx, 82, 410, 916, 118, 18); ctx.fill()
const stats = [['收录活动', activities.length], ['进行中', activeCnt], ['覆盖平台', platCnt]]
stats.forEach(([label, val], i) => {
  const x = 82 + 30 + i * 300
  ctx.fillStyle = '#34d399'
  ctx.font = F(46, '800')
  ctx.fillText(String(val), x, 476)
  ctx.fillStyle = '#93a0b8'
  ctx.font = F(24)
  ctx.fillText(label, x, 508)
})

// 今日可领
ctx.fillStyle = '#e6eaf2'
ctx.font = F(30, '700')
ctx.fillText('今天就能领的', 82, 596)
const picks = activities
  .filter(a => liveStatus(a) === 'active')
  .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))
  .slice(0, 4)
picks.forEach((a, i) => {
  const y = 630 + i * 118
  ctx.fillStyle = 'rgba(255,255,255,.045)'
  roundRect(ctx, 82, y, 916, 98, 14); ctx.fill()
  ctx.fillStyle = '#a5b4fc'
  ctx.font = F(26, '700')
  ctx.fillText(clip(a.platform, 15), 108, y + 40)
  ctx.fillStyle = '#e6eaf2'
  ctx.font = F(27)
  ctx.fillText(clip(a.title, 22), 108, y + 78)
  ctx.fillStyle = '#34d399'
  ctx.font = F(24, '700')
  ctx.textAlign = 'right'
  ctx.fillText(clip(a.credit_value || '免费', 17), 972, y + 60)
  ctx.textAlign = 'left'
})

// —— 无二维码版本：功能亮点卡片（替代二维码区域）——
const fy = 1130
ctx.fillStyle = 'rgba(34,211,238,.10)'
roundRect(ctx, 82, fy, 916, 240, 20); ctx.fill()
ctx.strokeStyle = 'rgba(34,211,238,.35)'
ctx.lineWidth = 2
roundRect(ctx, 82, fy, 916, 240, 20); ctx.stroke()

const feats = [
  '✅ 全部免费 · 只收录官方公开活动',
  '🔄 每天 09:30 自动更新 · 到期自动下架',
  '🤖 算力 / API / 工具一站看全 · 新手友好',
]
feats.forEach((t, i) => {
  ctx.fillStyle = '#e6eaf2'
  ctx.font = F(30, '700')
  ctx.fillText(t, 122, fy + 66 + i * 62)
})

// 底部免责声明（无链接）
ctx.fillStyle = '#5b6780'
ctx.font = F(22)
ctx.fillText('仅收录各平台官方公开的免费活动 · 不售卖账号、不代充', 82, 1410)

const out = '海报-抖音版-AI资源白嫖雷达.png'
fs.writeFileSync(out, canvas.toBuffer('image/png'))
console.log('OK ->', out, `(${activities.length} 活动, ${activeCnt} 进行中, ${platCnt} 平台)`)
