// 小红书每日分享图：1080×1440（3:4），无二维码、无链接、无引流字样
// 用法: node scripts/gen-xhs-card.mjs [YYYY-MM-DD] [--real]
//   默认只输出代称（描述）版，这是唯一发布口径（明文版实测被判「推广其它平台」限流）：
//     小红书分享/<日期>.png       ← 描述型定位（无品牌词），发布用
//     小红书分享/<日期>-对照表.txt ← 一行短格式「1智谱，2阶跃星辰，…」，放评论区回复用
//   加 --real 额外输出 小红书分享/<日期>-明文.png（真实平台名），仅供自己核对，不发布
import { createCanvas } from 'canvas'
import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const SHARECODE = 'RIOZLFZCRN'
const API = `https://ai-credit-hub-44763.app.workbuddy.host/api/activities?sharecode=${SHARECODE}`

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'xhs-card-gen' } }, res => {
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

function clip(s, n) {
  s = String(s || '')
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// 默认只出代称（描述）版；加 --real 才额外输出明文版（仅供自己核对，不发布）
let SHOW_REAL = false
const GEN_REAL = process.argv.includes('--real')

// 平台定位：不点名品牌，但用「这家是干什么的」说明白，不需要任何黑话背景就能读懂
// 顺序敏感，先匹配更具体的（如魔搭属于阿里生态，但要显示为社区）
const POS = [
  [/魔搭|ModelScope/, '开源模型社区'],
  [/Hugging\s*Face/i, '海外开源模型社区'],
  [/GitCode|启智|OpenI|Gitee/, '国产开源社区'],
  [/Kaggle/, '数据竞赛社区'],
  [/华为|CodeArts|码道/, '通信大厂 · 国产算力'],
  [/360|纳米/, '安全软件起家的AI办公'],
  [/小米|MiMo/, '手机厂旗下AI'],
  [/阿里|百炼|DashScope|通义|千问|Qwen|Qoder|云工开物|万相/, '头部云厂商 · 通义系'],
  [/腾讯|混元|TokenHub|ADP|Cloud\s*Studio|EdgeOne|元器|WorkBuddy|CodeBuddy|BuddyOne/, '社交巨头旗下云'],
  [/字节|豆包|即梦|Dreamina|火山|方舟|Seedance|Trae/, '短视频巨头旗下云'],
  [/智谱|GLM|AutoClaw|ZCode|BigModel/, '清华系大模型 · 编程强'],
  [/月之暗面|Kimi|Moonshot/, '长文本见长的大模型'],
  [/MiniMax|海螺|Hailuo/, '语音起家 · 多模态'],
  [/商汤|SenseNova|小浣熊/, '视觉AI四小龙之一'],
  [/讯飞|星火|AStudio/, '语音识别起家的AI'],
  [/百度|千帆|文心|ERNIE|飞桨/, '搜索巨头 · 文心系'],
  [/美团|LongCat/, '外卖巨头旗下大模型'],
  [/京东/, '电商巨头旗下大模型'],
  [/快手|可灵|Kling/, '短视频平台的视频模型'],
  [/七牛/, '云存储服务商'],
  [/移动云|MoMA|联通|电信|天翼/, '运营商云'],
  [/超算|SCNet/, '国家队超算平台'],
  [/硅基流动|SiliconFlow/, '模型聚合API站'],
  [/DeepSeek|深度求索/, '开源大模型 · 低价API'],
  [/英伟达|NVIDIA|NIM/, '显卡厂商的模型服务'],
  [/Oracle/, '海外老牌云'],
  [/云知声/, '语音云服务'],
  [/阶跃|StepFun|StepAudio/, '多模态大模型'],
  [/蚂蚁|百灵|Ling-|支付宝|PAYTHON/, '支付巨头旗下大模型'],
  [/微信|小程序/, '国民级社交App'],
  [/熙娱|xiyu/i, '第三方积分平台'],
  [/Cursor|Windsurf/, '海外AI编程IDE'],
  [/AutoDL|恒源云|智星云|趋动云|算力互联|蓝耘|揽睿/, 'GPU租用平台'],
  [/Coze|扣子/, '智能体搭建平台'],
]

// 兜底：没收录的平台按属性给一句人话
const TYPE_POS = {
  'AI编程客户端': 'AI编程工具',
  'AI助手·办公': 'AI办公助手',
  '大模型官方': '大模型厂商',
  '云厂商': '云厂商',
  '开发者社区': '开发者社区',
  'Agent平台': '智能体平台',
  '算力平台': '算力平台',
  'AI创作平台': 'AI创作平台',
  '第三方集成': '第三方集成平台',
}
function posOf(s) {
  const t = String(s || '')
  for (const [re, name] of POS) if (re.test(t)) return name
  return null
}
function maskPlatform(a) {
  if (SHOW_REAL) return { text: a.platform, real: a.platform }
  const text = posOf(a.platform) || posOf(a.title) || TYPE_POS[a.platform_type || ''] || 'AI平台'
  return { text, real: a.platform }
}

// 标题里的公司/平台品牌词替换为「该平台」；GLM、DeepSeek、混元、文心等公开模型名保留
const TITLE_BRANDS = ['WorkBuddy', 'CodeBuddy', 'BuddyOne', 'AutoClaw', 'ZCode', 'Trae', 'Qoder',
  'SenseNova', 'LongCat', 'DashScope', 'ModelScope', 'TokenHub', 'Seedance', 'Dreamina', 'Hailuo',
  '阿里云', '腾讯云', '火山方舟', '火山引擎', '火山', '方舟', '豆包', '即梦', '百炼', '魔搭', '通义',
  '千问', 'Qwen', '智谱', 'BigModel', '商汤', '小浣熊', '讯飞', '星火', 'AStudio', '纳米',
  '月之暗面', 'Kimi', 'MiniMax', '海螺', '可灵', 'Kling', '快手', '美团', '京东', '七牛',
  '移动云', '联通', '电信', '天翼', '硅基流动', 'SiliconFlow', '阶跃', 'StepFun', '蚂蚁', '百灵',
  '360', '小米', 'MiMo', '华为', 'CodeArts', '码道', '百度', '千帆', '文心', 'ERNIE', '飞桨',
  '字节', '腾讯', '阿里', 'Coze', '扣子', '元器', '超算', 'SCNet', 'Oracle', 'Kaggle',
  '英伟达', 'NVIDIA', 'Cursor', 'Windsurf', '熙娱', 'GitCode', '启智', 'Hugging Face']
function maskTitle(t) {
  if (SHOW_REAL) return t
  let s = String(t || '')
  for (const b of TITLE_BRANDS) s = s.split(b).join('该平台')
  // 「该平台/该平台」「该平台该平台」等重复去掉
  let prev = null
  while (prev !== s) {
    prev = s
    s = s.replace(/该平台\s*[/／·、]?\s*该平台/g, '该平台')
  }
  return s.replace(/\s{2,}/g, ' ')
    .replace(/^[\s·、/／-]+/, '')
    .replace(/（\s*）|\(\s*\)/g, '')
    .trim()
}

const data = await getJSON(API)
const activities = data.data || []
const liveStatus = a => a.status || 'active'
const actives = activities.filter(a => liveStatus(a) === 'active')
const platCnt = new Set(activities.map(a => a.platform)).size

// 日期（上海时区）；参数里的 --real 等 flag 不参与日期解析
const argDate = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a))
const now = argDate ? new Date(argDate + 'T09:30:00+08:00') : new Date(Date.now() + 8 * 3600e3)
const y = now.getUTCFullYear()
const m = now.getUTCMonth() + 1
const d = now.getUTCDate()
const week = ['日', '一', '二', '三', '四', '五', '六'][now.getUTCDay()]
const dateStr = `${String(y).slice(2)}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}`
const dateCn = `${m}月${d}日`
const outDir = '小红书分享'
fs.mkdirSync(outDir, { recursive: true })
const out = path.join(outDir, `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}.png`)

const W = 1080, H = 1440
function render(showReal) {
SHOW_REAL = showReal
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')
const FF = '"Microsoft YaHei","PingFang SC",sans-serif'
const F = (size, weight = '400') => `${weight} ${size}px ${FF}`

// 背景（小红书版用更亮的深蓝渐变，突出「情报」感）
const bg = ctx.createLinearGradient(0, 0, W, H)
bg.addColorStop(0, '#101828')
bg.addColorStop(.5, '#16213b')
bg.addColorStop(1, '#0b1224')
ctx.fillStyle = bg
ctx.fillRect(0, 0, W, H)

// 光晕
const glow = ctx.createRadialGradient(W * .8, 130, 30, W * .8, 130, 560)
glow.addColorStop(0, 'rgba(255,94,140,.22)')
glow.addColorStop(1, 'rgba(255,94,140,0)')
ctx.fillStyle = glow
ctx.fillRect(0, 0, W, 760)

// 雷达波纹（左上角装饰）
ctx.strokeStyle = 'rgba(255,94,140,.22)'
ctx.lineWidth = 2
for (let i = 1; i <= 4; i++) {
  ctx.beginPath()
  ctx.arc(96, 132, 36 * i, 0, Math.PI * 2)
  ctx.stroke()
}
ctx.fillStyle = '#ff5e8c'
ctx.beginPath(); ctx.arc(96, 132, 12, 0, Math.PI * 2); ctx.fill()

// 标语（不写日期，避免长尾分发时显得过期）+ 标题
ctx.fillStyle = '#ff5e8c'
ctx.font = F(34, '800')
ctx.fillText('每天早上更新 · 全网免费额度', 82, 208)
ctx.fillStyle = '#ffffff'
ctx.font = F(76, '800')
ctx.fillText('今日AI白嫖情报', 82, 296)
ctx.fillStyle = '#8b98b8'
ctx.font = F(30)
ctx.fillText('全部免费 · 官方活动 · 领完为止', 82, 352)

// 数据条
ctx.fillStyle = 'rgba(255,94,140,.13)'
roundRect(ctx, 82, 396, 916, 112, 18); ctx.fill()
const stats = [['进行中活动', actives.length], ['覆盖平台', platCnt], ['收录总数', activities.length]]
stats.forEach(([label, val], i) => {
  const x = 82 + 36 + i * 300
  ctx.fillStyle = '#ffffff'
  ctx.font = F(44, '800')
  ctx.fillText(String(val), x, 458)
  ctx.fillStyle = '#8b98b8'
  ctx.font = F(23)
  ctx.fillText(label, x, 490)
})

// 「今天值得领」6 条
ctx.fillStyle = '#ff5e8c'
roundRect(ctx, 82, 552, 10, 36, 5); ctx.fill()
ctx.fillStyle = '#ffffff'
ctx.font = F(32, '700')
ctx.fillText('今天值得领的', 106, 580)
// 同平台只保留最新一条，避免一张图出现两个同名平台
const pickedPlat = new Set()
const picks = [...actives]
  .sort((a, b) => new Date(b.last_updated) - new Date(a.last_updated))
  .filter((a) => {
    const k = String(a.platform || '')
    if (pickedPlat.has(k)) return false
    pickedPlat.add(k)
    return true
  })
  .slice(0, 6)
// 按像素宽度截断（中英混排比按字数更准）
function clipW(ctx, s, maxW) {
  s = String(s || '')
  if (ctx.measureText(s).width <= maxW) return s
  let out = s
  while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1)
  return out + '…'
}

picks.forEach((a, i) => {
  const yy = 612 + i * 104
  ctx.fillStyle = 'rgba(255,255,255,.05)'
  roundRect(ctx, 82, yy, 916, 86, 14); ctx.fill()
  // 序号角标
  ctx.fillStyle = 'rgba(255,94,140,.9)'
  roundRect(ctx, 102, yy + 24, 38, 38, 10); ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = F(24, '800')
  ctx.fillText(String(i + 1), 112, yy + 51)
  // 平台定位 + 标题
  const pl = maskPlatform(a)
  ctx.fillStyle = '#a5b4fc'
  ctx.font = F(24, '700')
  ctx.fillText(clipW(ctx, pl.text, 460), 158, yy + 35)
  ctx.fillStyle = '#e6eaf2'
  ctx.font = F(26)
  ctx.fillText(clipW(ctx, maskTitle(a.title), 470), 158, yy + 70)
  // 额度（右侧按像素宽度自动折行，最多 3 行，尽量完整显示）
  const credit = String(a.credit_value || '免费').replace(/\s+/g, ' ').trim()
  const CW = 330
  ctx.textAlign = 'right'
  ctx.font = F(22, '700')
  if (ctx.measureText(credit).width <= CW) {
    ctx.fillText(credit, 976, yy + 53)
  } else {
    const lines = []
    let rest = credit
    while (rest && lines.length < 3) {
      if (ctx.measureText(rest).width <= CW) { lines.push(rest); rest = ''; break }
      let cut = rest.length
      let w = 0
      const isAl = c => /[A-Za-z0-9]/.test(c)
      for (let j = 0; j < rest.length; j++) {
        w += ctx.measureText(rest[j]).width
        if (w > CW) { cut = j; break }
      }
      // 断点落在英文单词/数字中间时，回退到词首
      if (cut > 0 && cut < rest.length && isAl(rest[cut]) && isAl(rest[cut - 1])) {
        let k = cut - 1
        while (k > 0 && isAl(rest[k - 1])) k--
        if (k > 0) cut = k
      }
      // 在断点附近优先找标点回退
      let p = -1
      for (let j = cut; j > Math.max(0, cut - 8); j--) {
        if ('·，；：（( +/'.includes(rest[j])) { p = j + 1; break }
      }
      if (p > 0) cut = p
      lines.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    if (rest && lines.length === 3) lines[2] = clipW(ctx, (lines[2] + ' ' + rest).trim(), CW)
    ctx.font = F(20, '700')
    if (lines.length === 2) {
      ctx.fillText(clipW(ctx, lines[0], CW), 976, yy + 40)
      ctx.fillText(clipW(ctx, lines[1], CW), 976, yy + 67)
    } else {
      ctx.font = F(19, '700')
      ctx.fillText(clipW(ctx, lines[0], CW), 976, yy + 32)
      ctx.fillText(clipW(ctx, lines[1], CW), 976, yy + 55)
      ctx.fillText(clipW(ctx, lines[2], CW), 976, yy + 78)
    }
  }
  ctx.textAlign = 'left'
})

// 底部卡片：关注引导 + 互动钩子（无链接、无二维码）
const fy = 1276
ctx.fillStyle = 'rgba(255,94,140,.10)'
roundRect(ctx, 82, fy, 916, 112, 18); ctx.fill()
ctx.strokeStyle = 'rgba(255,94,140,.35)'
ctx.lineWidth = 2
roundRect(ctx, 82, fy, 916, 112, 18); ctx.stroke()
ctx.fillStyle = '#ffffff'
ctx.font = F(27, '700')
ctx.fillText('🔔 每天早上更新，关注我不迷路', 122, fy + 44)
ctx.fillStyle = '#ffb3c8'
ctx.font = F(24)
ctx.fillText(showReal ? '💬 有问题评论区问，看到就回' : '💬 想知道是哪家？评论区问编号，看到就回', 122, fy + 84)

// 免责（无链接）+ 自有开源项目水印（不写平台外链，仅署名）
ctx.fillStyle = '#5b6780'
ctx.font = F(20)
ctx.fillText('仅收录各平台官方公开免费活动 · 规则以官方页面为准', 82, 1424)
ctx.textAlign = 'right'
ctx.fillStyle = '#5b6780'
ctx.font = F(18)
ctx.fillText('开源同步 · ai-freebie-radar', 998, 1424)
ctx.textAlign = 'left'

return { buf: canvas.toBuffer('image/png'), picks }
}

const dateTag = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const outReal = path.join(outDir, `${dateTag}-明文.png`)

// ① 明文版（真实平台名）：默认不生成，仅 --real 时输出，供自己核对，不用于发布
if (GEN_REAL) {
  const r = render(true)
  fs.writeFileSync(outReal, r.buf)
  console.log('OK(明文版·仅供参考) ->', outReal, `(${r.picks.length} 条精选 / ${actives.length} 进行中 / ${platCnt} 平台)`)
}

// ② 描述版（无品牌词，唯一发布口径）
const m2 = render(false)
fs.writeFileSync(out, m2.buf)
console.log('OK(描述版) ->', out, `(${m2.picks.length} 条精选 / ${actives.length} 进行中 / ${platCnt} 平台)`)

// 对照表：只给自己在评论区回复用，不随图发布
// 格式刻意压成一行「1智谱，2阶跃星辰，…」，方便直接复制粘贴到评论区
SHOW_REAL = false
{
  const short = (p) => String(p || '').trim().split(/\s+/)[0]
  const line = m2.picks.map((a, i) => `${i + 1}${/^\d/.test(short(a.platform)) ? ' ' : ''}${short(a.platform)}`).join('，')
  const side = path.join(outDir, `${dateTag}-对照表.txt`)
  fs.writeFileSync(side, line + '\n', 'utf8')
  console.log('对照表 ->', side)
  console.log('  ' + line)
}
