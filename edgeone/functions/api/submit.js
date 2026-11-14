/**
 * POST /api/submit —— 收录申请（EdgeOne 版本）
 *
 * EdgeOne 侧没有数据库，这里把申请原样转发给仍在运行的 WorkBuddy 服务端入库，
 * 保持「入库 → 邮件助理通知 → 回复审批」这条既有链路不变。
 * 转发失败时退回 KV 暂存，避免用户提交丢失。
 */

const BACKEND = 'https://ai-credit-hub-44763.app.workbuddy.host'
const SHARE = 'RIOZLFZCRN'

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

export async function onRequestPost({ request }) {
  let body
  try {
    body = await request.json()
  } catch (e) {
    return json({ error: '请求格式错误' }, 400)
  }

  const siteName = String(body.site_name || '').trim().slice(0, 80)
  const link = String(body.url || '').trim().slice(0, 300)
  if (!siteName) return json({ error: '请填写名称' }, 400)
  if (!/^https?:\/\//i.test(link)) return json({ error: '请填写有效的 http(s) 链接' }, 400)

  // 1) 转发到主服务端（保留邮件审批链路）
  try {
    const r = await fetch(`${BACKEND}/api/submit?sharecode=${SHARE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const txt = await r.text()
    if (r.ok) {
      return new Response(txt, {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
      })
    }
  } catch (e) { /* 落到 KV 暂存 */ }

  // 2) KV 暂存兜底
  try {
    if (typeof my_kv !== 'undefined' && my_kv) {
      const id = `submission:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      await my_kv.put(id, JSON.stringify({
        site_name: siteName,
        url: link,
        description: String(body.description || '').trim().slice(0, 600),
        contact: String(body.contact || '').trim().slice(0, 120),
        ts: new Date().toISOString(),
        forwarded: false,
      }))
      return json({ ok: true, mailed: false, queued: true })
    }
  } catch (e) { /* ignore */ }

  return json({ error: '提交失败，请稍后重试' }, 500)
}

export async function onRequest(context) {
  return onRequestPost(context)
}
