// 小红书首篇封面：1080×1440（3:4），基于熙娱AI生成的科技背景图 + 品牌叠字
// 用法: node scripts/gen-xhs-cover.mjs [背景图路径]
// 输出: 小红书分享/封面-自我介绍.png
import { createCanvas, loadImage } from 'canvas'
import fs from 'node:fs'
import path from 'node:path'

const BG = process.argv[2] || 'xiyu-output/img_b62e18e2-6519-494c-aa88-af9cf47d5391_01.png'
const W = 1080, H = 1440

const FF = '"Microsoft YaHei","PingFang SC",sans-serif'
const F = (size, weight = '400') => `${weight} ${size}px ${FF}`

const img = await loadImage(path.resolve(BG))

const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// 背景：等比放大铺满并居中裁切
const scale = Math.max(W / img.width, H / img.height)
const dw = img.width * scale, dh = img.height * scale
ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)

// 暗色遮罩：保证文字可读，同时保留光效氛围
const veil = ctx.createLinearGradient(0, 0, 0, H)
veil.addColorStop(0, 'rgba(8,12,26,.55)')
veil.addColorStop(.45, 'rgba(8,12,26,.72)')
veil.addColorStop(1, 'rgba(8,12,26,.88)')
ctx.fillStyle = veil
ctx.fillRect(0, 0, W, H)

// 雷达波纹（左上角品牌元素）
ctx.strokeStyle = 'rgba(255,94,140,.30)'
ctx.lineWidth = 2
for (let i = 1; i <= 4; i++) {
  ctx.beginPath()
  ctx.arc(96, 132, 36 * i, 0, Math.PI * 2)
  ctx.stroke()
}
ctx.fillStyle = '#ff5e8c'
ctx.beginPath(); ctx.arc(96, 132, 12, 0, Math.PI * 2); ctx.fill()

// 顶部小标签
ctx.fillStyle = '#ff5e8c'
ctx.font = F(34, '800')
ctx.fillText('第 1 篇 · 自我介绍', 82, 330)

// 主标题三行
ctx.fillStyle = 'rgba(255,255,255,.85)'
ctx.font = F(88, '800')
ctx.fillText('十年码农', 82, 480)

ctx.fillStyle = '#ffffff'
ctx.font = F(88, '800')
ctx.fillText('弃码从文', 82, 600)

// 「白嫖AI搞事情」最大、品牌粉
ctx.font = F(118, '900')
// 荧光描边效果
ctx.shadowColor = 'rgba(255,94,140,.55)'
ctx.shadowBlur = 26
ctx.fillStyle = '#ff5e8c'
ctx.fillText('白嫖AI', 82, 780)
ctx.fillText('搞事情', 82, 920)
ctx.shadowBlur = 0

// 分隔线
ctx.strokeStyle = 'rgba(255,255,255,.28)'
ctx.lineWidth = 2
ctx.beginPath(); ctx.moveTo(86, 1010); ctx.lineTo(994, 1010); ctx.stroke()

// 三个卖点
const feats = ['🤖 短剧智能体 / 跨境电商 Skill / 自动化助手', '📦 造过的东西全部开源，源码免费拿', '💬 想做不会做？私信我，我来帮你实现']
feats.forEach((t, i) => {
  ctx.fillStyle = '#e6eaf2'
  ctx.font = F(38, '600')
  ctx.fillText(t, 86, 1090 + i * 78)
})

// 底部引导条
ctx.fillStyle = 'rgba(255,94,140,.16)'
ctx.beginPath()
ctx.moveTo(82, 1330); ctx.arcTo(998, 1330, 998, 1400, 24)
ctx.arcTo(998, 1400, 82, 1400, 24); ctx.arcTo(82, 1400, 82, 1330, 24)
ctx.arcTo(82, 1330, 998, 1330, 24); ctx.closePath()
ctx.fill()
ctx.fillStyle = '#ff8fb0'
ctx.font = F(36, '800')
ctx.fillText('关注我 · 每天 AI 白嫖情报 + 折腾成果', 120, 1380)

const outDir = '小红书分享'
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, '封面-自我介绍.png')
fs.writeFileSync(out, canvas.toBuffer('image/png'))
console.log('已生成:', out)
