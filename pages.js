/**
 * 服务端渲染页面：活动详情页 / 日报列表 / 日报正文
 * 目的：为每个活动、每篇日报生成带完整 meta 的独立页面，承接搜索引擎长尾流量
 */

const SITE = 'AI资源白嫖雷达'

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

const STATUS_TXT = { active: '进行中', expired: '已到期', offline: '已下架' }
const STATUS_CLS = { active: 'ok', expired: 'exp', offline: 'off' }

function fmtDate(v, withTime = false) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d)) return '—'
  const s = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(d)
  return s.replace(/\//g, '-')
}

function head({ title, desc, canonical, ogImage, homeUrl = '/', extra = '' }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
<meta name="keywords" content="AI免费额度,免费算力,免费服务器,免费API,白嫖AI,AI资源攻略">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(desc)}">
<meta property="og:url" content="${escapeHtml(canonical)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(desc)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
${extra}
<style>
  :root{--bg:#0b0f1a;--card:#151c2c;--border:#26304a;--text:#e6eaf2;--dim:#93a0b8;--accent:#6366f1;--cyan:#22d3ee;--green:#34d399;--orange:#fbbf24;--red:#f87171}
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:var(--bg);color:var(--text);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.75;min-height:100vh}
  a{color:var(--cyan);text-decoration:none}
  .wrap{max-width:820px;margin:0 auto;padding:0 20px}
  header{border-bottom:1px solid var(--border);padding:14px 0;position:sticky;top:0;background:rgba(11,15,26,.9);backdrop-filter:blur(10px);z-index:10}
  .nav{display:flex;align-items:center;justify-content:space-between;gap:12px}
  .logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:var(--text)}
  .logo span.r{font-size:18px}
  .nav a.btn{border:1px solid var(--border);border-radius:8px;padding:6px 14px;font-size:13px;color:var(--text);background:#151c2c}
  main{padding:28px 0 60px}
  .crumb{font-size:12.5px;color:var(--dim);margin-bottom:14px}
  .crumb a{color:var(--dim)}
  h1{font-size:26px;line-height:1.4;margin-bottom:12px;letter-spacing:-.3px}
  .tags{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:18px}
  .tag{font-size:12px;padding:3px 10px;border-radius:999px;background:rgba(34,211,238,.12);color:#67e8f9;border:1px solid rgba(34,211,238,.25)}
  .tag.plat{background:rgba(99,102,241,.14);color:#a5b4fc;border-color:rgba(99,102,241,.3)}
  .tag.ok{background:rgba(52,211,153,.12);color:#6ee7b7;border-color:rgba(52,211,153,.3)}
  .tag.exp,.tag.off{background:rgba(248,113,113,.12);color:#fca5a5;border-color:rgba(248,113,113,.28)}
  .value{font-size:30px;font-weight:800;color:var(--green);margin:6px 0 16px;letter-spacing:-.5px}
  .card{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:20px 22px;margin-bottom:16px}
  .card h2{font-size:15px;margin-bottom:10px;color:var(--text)}
  .card p{font-size:14.5px;color:#c3cbdb}
  .rules{white-space:pre-line;font-size:14px;color:#c3cbdb}
  .meta{display:flex;gap:20px;flex-wrap:wrap;font-size:12.5px;color:var(--dim);margin-top:14px}
  .cta{display:block;text-align:center;background:linear-gradient(135deg,#6366f1,#22d3ee);color:#06121f;font-weight:800;padding:14px;border-radius:12px;font-size:15px;margin:20px 0 8px}
  .cta.disabled{background:#26304a;color:#6b7793;pointer-events:none}
  .note{font-size:12px;color:var(--dim);text-align:center;margin-bottom:22px}
  .rel{list-style:none}
  .rel li{padding:11px 0;border-bottom:1px solid #1e2740;font-size:14px;display:flex;justify-content:space-between;gap:12px}
  .rel li:last-child{border-bottom:none}
  .rel b{font-weight:600;color:var(--text)}
  .rel em{font-style:normal;color:var(--green);font-size:13px;white-space:nowrap}
  footer{border-top:1px solid var(--border);padding:22px 0;font-size:12.5px;color:var(--dim);text-align:center}
  .digest-item{display:block;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:12px;transition:.2s}
  .digest-item:hover{border-color:#3a4566}
  .digest-item date{display:block;font-size:12px;color:var(--dim);margin-bottom:6px}
  .digest-item b{display:block;font-size:16px;color:var(--text);margin-bottom:6px;line-height:1.5}
  .digest-item p{font-size:13.5px;color:var(--dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .body{white-space:pre-line;font-size:15px;color:#cfd6e4}
  .body b{color:var(--text)}
  @media(max-width:640px){h1{font-size:21px}.value{font-size:25px}.wrap{padding:0 16px}}
</style>
</head>
<body>
<header><div class="wrap nav">
  <a class="logo" href="${escapeHtml(homeUrl)}"><span class="r">📡</span>${SITE}</a>
  <a class="btn" href="${escapeHtml(homeUrl)}">返回首页</a>
</div></header>
<main><div class="wrap">`
}

export function activityPage(a, { related = [], canonical, ogImage, homeUrl }) {
  const status = a.status || 'active'
  const title = `${a.platform}「${a.title}」免费领取攻略（${a.credit_value || '免费额度'}）｜${SITE}`
  const desc = String(a.summary || a.rules || '').slice(0, 110).replace(/\s+/g, ' ')
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: desc,
    datePublished: a.created_at || undefined,
    dateModified: a.last_updated || undefined,
    author: { '@type': 'Organization', name: SITE },
    publisher: { '@type': 'Organization', name: SITE },
    mainEntityOfPage: canonical,
  }
  const body = `
    <div class="crumb"><a href="/">首页</a> / <a href="/?category=${encodeURIComponent(a.category || '')}">${escapeHtml(a.category || '全部资源')}</a> / ${escapeHtml(a.platform)}</div>
    <h1>${escapeHtml(a.title)}</h1>
    <div class="tags">
      <span class="tag plat">${escapeHtml(a.platform)}</span>
      ${a.category ? `<span class="tag">${escapeHtml(a.category)}</span>` : ''}
      ${a.platform_type ? `<span class="tag">${escapeHtml(a.platform_type)}</span>` : ''}
      <span class="tag ${STATUS_CLS[status] || 'ok'}">${STATUS_TXT[status] || status}</span>
    </div>
    <div class="value">${escapeHtml(a.credit_value || '免费额度')}</div>
    ${a.summary ? `<div class="card"><h2>活动简介</h2><p>${escapeHtml(a.summary)}</p></div>` : ''}
    ${a.rules ? `<div class="card"><h2>活动规则与领取方式</h2><div class="rules">${escapeHtml(a.rules)}</div></div>` : ''}
    <div class="meta">
      <span>最近更新：${fmtDate(a.last_updated, true)}</span>
      ${a.expires_at ? `<span>活动截止：${fmtDate(a.expires_at)}</span>` : '<span>长期有效</span>'}
      ${a.source ? `<span>信息来源：${escapeHtml(a.source)}</span>` : ''}
    </div>
    ${status === 'active'
      ? `<a class="cta" href="${escapeHtml(a.url || '#')}" target="_blank" rel="noopener">前往官方领取 →</a>`
      : `<div class="cta disabled">该活动${STATUS_TXT[status] || '已失效'}，暂不可领取</div>`}
    <p class="note">领取均在官方页面完成，本站不售卖账号、不代充；规则与额度以官方最新页面为准。</p>
    ${related.length ? `<div class="card"><h2>同类免费活动</h2><ul class="rel">
      ${related.map(r => `<li><a href="/a/${r.id}"><b>${escapeHtml(r.platform)} · ${escapeHtml(r.title)}</b></a><em>${escapeHtml(r.credit_value || '')}</em></li>`).join('')}
    </ul></div>` : ''}
    <div class="card"><h2>关于本站</h2><p>${SITE}每日自动巡检 25+ 平台的免费 AI 资源（算力、服务器、模型 API 额度、对话积分、视频生图等），活动到期或下架会自动同步状态。<a href="${escapeHtml(homeUrl)}">回首页查看全部 →</a></p></div>
  `
  return head({ title, desc, canonical, ogImage, homeUrl, extra: `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` })
    + body + '</div></main>' + footer()
}

export function dailyIndexPage(list, { canonical, ogImage, homeUrl }) {
  const title = `AI 资源日报 · 每日免费额度与白嫖活动汇总｜${SITE}`
  const desc = '每日更新 AI 免费资源日报：新增了哪些白嫖活动、哪些即将到期、哪些规则有变化，一篇看完。'
  const items = list.map(d => `
    <a class="digest-item" href="/daily/${d.digest_date}">
      <date>${escapeHtml(String(d.digest_date).slice(0, 10))}</date>
      <b>${escapeHtml(d.title)}</b>
      <p>${escapeHtml(String(d.body || '').replace(/[\n#*>]/g, ' ').slice(0, 90))}…</p>
    </a>`).join('')
  return head({ title, desc, canonical, ogImage, homeUrl })
    + `<div class="crumb"><a href="/">首页</a> / 日报</div>
       <h1>AI 资源日报</h1>
       <p style="color:var(--dim);font-size:14px;margin-bottom:20px">每天一篇，看完就知道今天又能白嫖什么。历史日报长期留存。</p>
       ${items || '<div class="card"><p>暂无日报，每日 09:30 自动生成。</p></div>'}
       <p style="margin-top:20px"><a href="${escapeHtml(homeUrl)}">← 查看全部免费活动</a></p>`
    + '</div></main>' + footer()
}

export function dailyPostPage(d, { canonical, ogImage, homeUrl }) {
  const dateStr = String(d.digest_date).slice(0, 10)
  const title = d.title || `AI 资源日报 ${dateStr}`
  const desc = String(d.body || '').replace(/[#*\n]/g, ' ').slice(0, 110)
  return head({ title: `${title}｜${SITE}`, desc, canonical, ogImage, homeUrl })
    + `<div class="crumb"><a href="/">首页</a> / <a href="/daily">日报</a> / ${dateStr}</div>
       <h1>${escapeHtml(title)}</h1>
       <div class="meta" style="margin-bottom:18px"><span>${dateStr}</span><span>${SITE}</span></div>
       <div class="card"><div class="body">${escapeHtml(d.body || '')}</div></div>
       <a class="cta" href="${escapeHtml(homeUrl)}">打开站点，领取今天的免费资源 →</a>
       <p style="margin:18px 0"><a href="/daily">← 查看历史日报</a></p>`
    + '</div></main>' + footer()
}

function footer() {
  return `<footer><div class="wrap">${SITE} · 仅聚合官方公开的免费活动，不售卖账号、不代充 · 活动规则以官方页面为准</div></footer>`
}

export { fmtDate, SITE }
