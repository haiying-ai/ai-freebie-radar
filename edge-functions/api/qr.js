/**
 * GET /api/qr —— 分享海报二维码（EdgeOne 版本）
 *
 * 站点地址在部署后固定，二维码在构建时用 qrcode 库预生成为 /data/qr.svg，
 * 这里直接返回该文件，运行期不做任何计算。
 */

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin
  try {
    const r = await fetch(`${origin}/data/qr.svg`)
    if (r.ok) {
      const svg = await r.text()
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=86400',
        },
      })
    }
  } catch (e) { /* ignore */ }

  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="#fff"/><text x="120" y="130" font-size="18" text-anchor="middle" fill="#0b0f1a">扫码打开</text></svg>',
    { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } }
  )
}

export async function onRequest(context) {
  return onRequestGet(context)
}
