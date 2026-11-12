/** 管理后台页面（服务端渲染，仅管理密钥可访问） */
export function adminPage() {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>管理后台 · AI资源白嫖雷达</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0b0f1a;color:#e6eaf2;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.6;padding:32px 18px}
.wrap{max-width:860px;margin:0 auto}
h1{font-size:22px;margin-bottom:4px}
.sub{color:#93a0b8;font-size:13px;margin-bottom:24px}
.card{background:#151c2c;border:1px solid #26304a;border-radius:14px;padding:20px;margin-bottom:16px}
.card h2{font-size:15px;margin-bottom:12px}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:13.5px;color:#93a0b8;margin-bottom:6px}
button{border:none;cursor:pointer;border-radius:8px;padding:9px 16px;font-size:13.5px;font-weight:600}
.primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff}
.ghost{background:#1c2436;color:#c7d2fe;border:1px solid #2f3b58}
.green{background:#16a34a;color:#fff}
.gray{background:#2a3446;color:#93a0b8}
.sub-item{border:1px solid #26304a;border-radius:10px;padding:14px;margin-bottom:10px;font-size:13.5px}
.sub-item b{font-size:14.5px}
.sub-item .meta{color:#93a0b8;font-size:12.5px;margin:4px 0 10px;word-break:break-all}
.empty{color:#93a0b8;font-size:13.5px;padding:14px 0}
.hint{font-size:12.5px;color:#6f7d96;margin-top:10px;line-height:1.9}
.digest{background:#0f1522;border:1px solid #26304a;border-radius:10px;padding:14px 16px;font-size:13.5px;color:#c7d2fe;white-space:pre-line;line-height:1.85;max-height:280px;overflow:auto}
.digest b{font-size:14.5px;color:#e6eaf2;display:block;margin-bottom:8px;white-space:normal}
#msg{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:#1f2937;border:1px solid #26304a;padding:11px 20px;border-radius:10px;font-size:13.5px;opacity:0;transition:.3s;pointer-events:none}
#msg.show{opacity:1}
</style></head><body><div class="wrap">
<h1>管理后台</h1>
<p class="sub">AI资源白嫖雷达 · 服务端定时同步与收录审批</p>

<div class="card">
  <h2>运行状态</h2>
  <div class="row">定时同步：<span id="syncTime">-</span>（服务端运行，不依赖本地电脑）</div>
  <div class="row">上次同步：<span id="lastSync">-</span><span id="syncDetail"></span></div>
  <div style="margin-top:12px"><button class="ghost" onclick="doSync()">立即同步一次</button></div>
</div>

<div class="card">
  <h2>今日推文（日报）</h2>
  <div class="row"><span id="digestDate">-</span><span id="digestTag"></span></div>
  <div id="digestBox" class="digest"><div class="empty">加载中…</div></div>
  <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
    <button class="primary" onclick="copyDigest()">复制全文（发公众号）</button>
    <button class="ghost" onclick="doSync()">立即同步并重新生成</button>
    <a class="ghost" id="digestLink" href="#" target="_blank" style="text-decoration:none;padding:9px 16px;border-radius:8px;font-size:13.5px;font-weight:600">查看日报页</a>
  </div>
  <p class="hint">每日 09:30 同步后自动生成：包含今日新增、即将截止、资源分布与巡检结果。直接复制到公众号编辑器即可发布；需配图可点上方「查看日报页」截图。</p>
</div>

<div class="card">
  <h2>收录申请通知</h2>
  <div class="row">通知方式：邮件助理自动发送至服务端配置的管理员邮箱（环境变量 <code>ALERT_EMAIL</code>）</div>
  <p class="hint">流程：用户提交申请 → 邮件助理把申请详情发到你的邮箱 → 你直接回复「同意」或「拒绝」，或点邮件里的按钮，审批即刻生效。<br>
  如果暂时没收到邮件，也可以直接在下方列表里审批。</p>
</div>

<div class="card">
  <h2>待审批收录申请 <span id="pendingCount" style="color:#93a0b8;font-size:13px;font-weight:400"></span></h2>
  <div id="pendingList"><div class="empty">加载中…</div></div>
</div>
</div>
<div id="msg"></div>
<script>
const KEY = new URLSearchParams(location.search).get('key') || ''
const SC = new URLSearchParams(location.search).get('sharecode') || ''
const A = p => p + (SC ? '&sharecode=' + encodeURIComponent(SC) : '')
function toast(t){const m=document.getElementById('msg');m.textContent=t;m.className='show';setTimeout(()=>m.className='',2600)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ago(iso){if(!iso)return '-';const d=new Date(iso),m=Math.floor((Date.now()-d)/60000);if(m<1)return'刚刚';if(m<60)return m+' 分钟前';const h=Math.floor(m/60);if(h<24)return h+' 小时前';return Math.floor(h/24)+' 天前'}

async function load(){
  const r = await fetch(A('/api/admin/info?key='+encodeURIComponent(KEY)))
  if(!r.ok){document.getElementById('pendingList').innerHTML='<div class="empty">管理密钥无效</div>';return}
  const j = await r.json()
  document.getElementById('syncTime').textContent = j.syncEnabled ? '每日 '+j.syncTime : '已关闭'
  document.getElementById('lastSync').textContent = ago(j.lastSyncAt)
  document.getElementById('syncDetail').textContent = j.lastSyncSummary ? '（巡检 '+j.lastSyncSummary.checked+' 条，到期 '+j.lastSyncSummary.expired+'，下架 '+j.lastSyncSummary.offline+'）' : ''
  renderDigest(j.digest, j.digestUrl)
  const list = j.pending || []
  document.getElementById('pendingCount').textContent = list.length ? '· '+list.length+' 条待处理' : ''
  const box = document.getElementById('pendingList')
  if(!list.length){box.innerHTML='<div class="empty">暂无待审批申请</div>';return}
  box.innerHTML = list.map(s=>'<div class="sub-item"><b>'+esc(s.site_name)+'</b> <span style="color:#6f7d96;font-size:12px">#'+esc(String(s.review_token||'').slice(0,8))+'</span>'
    +'<div class="meta">'+esc(s.url)+'<br>'+esc(s.description||'无简介')+' · 联系方式：'+esc(s.contact||'未留')+' · '+ago(s.created_at)+'</div>'
    +'<button class="green" onclick="review(\\''+s.review_token+'\\',\\'approve\\',this)">同意收录</button> '
    +'<button class="gray" onclick="review(\\''+s.review_token+'\\',\\'reject\\',this)">拒绝</button></div>').join('')
}

async function review(token, action, btn){
  btn.disabled = true
  const r = await fetch(A('/api/admin/review?key='+encodeURIComponent(KEY)),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,action})})
  const j = await r.json()
  if(r.ok){toast(action==='approve'?'已通过，活动已上线':'已拒绝');load()}
  else{btn.disabled=false;toast('操作失败：'+(j.error||'未知错误'))}
}

let currentDigest = null
function renderDigest(d, url){
  const box = document.getElementById('digestBox')
  const link = document.getElementById('digestLink')
  if(url) link.href = url + (SC ? (url.includes('?') ? '&' : '?') + 'sharecode=' + encodeURIComponent(SC) : '')
  if(!d){
    currentDigest = null
    document.getElementById('digestDate').textContent = '暂无日报'
    document.getElementById('digestTag').textContent = ''
    box.innerHTML = '<div class="empty">还没有生成日报，点「立即同步并重新生成」即可</div>'
    return
  }
  currentDigest = d
  document.getElementById('digestDate').textContent = '日期：' + String(d.digest_date).slice(0,10)
  document.getElementById('digestTag').textContent = d.auto_generated ? '（系统自动生成）' : '（已由自动化补充文案）'
  box.innerHTML = '<b>' + esc(d.title) + '</b>' + esc(d.body || '')
}

function copyDigest(){
  if(!currentDigest) return toast('暂无日报可复制')
  const text = currentDigest.title + '\n\n' + currentDigest.body
  const done = () => toast('已复制，去公众号粘贴吧 ✅')
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(done).catch(()=>fallbackCopy(text, done))
  } else fallbackCopy(text, done)
}
function fallbackCopy(text, cb){
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0'
  document.body.appendChild(ta); ta.select()
  try{ document.execCommand('copy'); cb() }catch(e){ toast('复制失败，请手动选择文本') }
  document.body.removeChild(ta)
}

async function doSync(){
  toast('正在同步…')
  const r = await fetch(A('/api/admin/sync?key='+encodeURIComponent(KEY)),{method:'POST'})
  const j = await r.json()
  toast('完成：巡检 '+j.checked+' 条，到期 '+j.expired+'，下架 '+j.offline)
  load()
}
load()
</script></body></html>`
}
