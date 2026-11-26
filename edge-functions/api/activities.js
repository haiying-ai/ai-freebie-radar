/**
 * GET /api/activities —— 活动列表（EdgeOne Edge Functions · V8 运行时）
 *
 * 数据是构建时导出的静态文件 /data/activities.json（每日自动同步后重新构建），
 * 因此这里不做任何数据库查询：命中 CDN 缓存即为 0 成本。
 * KV 兜底：若静态文件取不到（例如构建异常），尝试读 KV 里的快照。
 */

function json(obj, status = 200, maxAge = 300) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
    },
  })
}

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin

  // 1) 静态数据文件（构建产物）
  try {
    const r = await fetch(`${origin}/data/activities.json`, { headers: { 'Cache-Control': 'no-cache' } })
    if (r.ok) {
      const txt = await r.text()
      if (txt && txt.trim().startsWith('{')) return json(JSON.parse(txt))
    }
  } catch (e) { /* 落到 KV 兜底 */ }

  // 2) KV 快照兜底（全局变量 my_kv，控制台绑定的命名空间变量名）
  try {
    if (typeof my_kv !== 'undefined' && my_kv) {
      const snap = await my_kv.get('data:activities', 'json')
      if (snap) return json(snap, 200, 60)
    }
  } catch (e) { /* ignore */ }

  return json({ data: [], syncedAt: null }, 200, 30)
}

export async function onRequest({ request }) {
  return onRequestGet({ request })
}
