#!/usr/bin/env node
/**
 * 数据对齐脚本：数据库被隔离期间，用本地快照 + 权威信息对齐活动状态
 * 规则（与 server.js runSync 一致）：
 *   1) 到期判断：expires_at < 今天 → expired（除非有权威信息证明仍在进行中）
 *   2) 链接巡检：active 且无到期日 → 检查 url（404/结束标记 → offline）
 * 权威修正（来自 2026-11-16 早推送，用户已确认）：
 *   - AutoClaw 延期至 11-22 23:59，额度 1 亿 Tokens
 *   - ZCode 每日卡 11-17 12:00 收官
 *   - 新增 讯飞 Loomy
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const SRC = path.join(ROOT, 'edgeone-dist/data/activities.json')
const OUT = path.join(ROOT, 'data/activities.json')

const TODAY = '2026-11-16'
const EXPIRED_MARKERS = ['活动已结束', '活动已下线', '本活动已结束', '该活动已结束', '活动已到期']
const nowIso = () => new Date().toISOString()

async function checkLink(url) {
  if (!url) return { alive: true, note: 'no-url' }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 12000)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AICreditRadar/1.0)' },
    })
    if (res.status === 404 || res.status === 410) return { alive: false, note: 'http_' + res.status }
    if (res.status >= 500 || res.status === 403) return { alive: true, note: 'http_' + res.status + '_skip' }
    const text = await res.text()
    const hit = EXPIRED_MARKERS.find(m => text.includes(m))
    if (hit) return { alive: false, note: 'marker:' + hit }
    return { alive: true, note: 'ok' }
  } catch {
    return { alive: true, note: 'fetch_error' } // 网络异常不判失败，避免误下架
  } finally {
    clearTimeout(timer)
  }
}

// ---- 权威修正表（来自 2026-11-16 推送，id → 修正内容）----
const FIXES = {
  // AutoClaw：推送确认仍在进行，11-22 23:59 统一清零，额度 1 亿
  59: a => {
    a.status = 'active'
    a.expires_at = '2026-11-22T23:59:00+08:00'
    a.title = '双11每周福利 · 登录领1亿 Tokens（11-22 23:59 统一清零）'
    a.credit_value = '1亿 Tokens（约10000积分，11-22 23:59 统一清零）'
    a.rules = (a.rules || '') + '\n11-16 更新：本期延期至 11-22 23:59 统一清零，额度为 1 亿 Tokens。'
    a.last_updated = nowIso()
    a.checked_at = nowIso()
    return '延期至11-22'
  },
  // ZCode 每日卡：推送确认仍在进行，11-17 中午收官
  45: a => {
    a.status = 'active'
    a.expires_at = '2026-11-17T12:00:00+08:00'
    a.rules = (a.rules || '') + '\n11-16 更新：本期 11-17 12:00 收官。'
    a.last_updated = nowIso()
    a.checked_at = nowIso()
    return '延期至11-17中午'
  },
  // ZCode 周末卡：今早 09:00 已到期
  73: a => {
    a.status = 'expired'
    a.last_updated = nowIso()
    return '到期下线'
  },
  // 腾讯混元 Hy4：11-15 到期，推送未提及，判过期
  46: null, // 占位，实际按平台+标题匹配，见下面 PEXPIRED
}
const FORCE_EXPIRE = [
  { match: a => a.platform.includes('腾讯混元') && a.title.includes('Hy4'), why: '11-15到期且推送未提及' },
]

// 新增讯飞 Loomy（官方页 https://loomy.xunfei.cn/）
function loomyEntry(maxId) {
  const t = nowIso()
  return {
    id: maxId + 1,
    platform: '讯飞 Loomy',
    title: '桌面AI办公搭子 · 注册5000永久积分 + 每日登录5000 + 新手任务1万',
    credit_value: '注册 5000 永久积分 + 每日 5000（刷新不累积）+ 新手任务 1 万',
    summary: '科大讯飞官方桌面 AI 办公智能体 Loomy，网页版免安装、浏览器直接用，新用户注册送永久积分，每日登录再送 5000 积分。',
    rules: '官网 loomy.xunfei.cn 下载客户端或直接用网页版，手机号登录自动注册；新用户完成新手任务可得 1 万积分，每日登录送 5000 积分（当天有效、不累积）；永久积分不清零；具体以官方页面为准。',
    url: 'https://loomy.xunfei.cn/',
    source: '讯飞官方公告 + 公开报道（2026-11-16）',
    status: 'active',
    expires_at: null,
    last_updated: t,
    created_at: t,
    checked_at: t,
    category: 'Agent积分',
    platform_type: '桌面 AI 助理',
  }
}

async function main() {
  const snap = JSON.parse(readFileSync(SRC, 'utf8'))
  const rows = snap.data.map(a => ({ ...a }))
  const report = { fixed: [], expired: [], offline: [], added: [], checked: 0 }

  for (const a of rows) {
    if (a.status !== 'active') continue
    // 1) 权威修正
    if (FIXES[a.id]) {
      const why = FIXES[a.id](a)
      report.fixed.push(`${a.platform}(${a.id}) ${why}`)
      continue
    }
    // 2) 强制过期
    const fe = FORCE_EXPIRE.find(f => f.match(a))
    if (fe && a.expires_at && String(a.expires_at).slice(0, 10) < TODAY) {
      a.status = 'expired'
      a.last_updated = nowIso()
      report.expired.push(`${a.platform}(${a.id}) ${fe.why}`)
      continue
    }
    // 3) 到期判断
    if (a.expires_at && String(a.expires_at).slice(0, 10) < TODAY) {
      a.status = 'expired'
      a.last_updated = nowIso()
      report.expired.push(`${a.platform}(${a.id}) 到期${String(a.expires_at).slice(0, 10)}`)
      continue
    }
    // 4) 链接巡检（与 runSync 相同规则）
    const r = await checkLink(a.url)
    report.checked++
    if (!r.alive) {
      a.status = 'offline'
      a.last_updated = nowIso()
      report.offline.push(`${a.platform}(${a.id}) ${a.title.slice(0, 24)} ← ${r.note}`)
    } else {
      a.checked_at = nowIso()
    }
  }

  // 5) 新增 Loomy
  const maxId = Math.max(...rows.map(a => a.id))
  if (!rows.some(a => a.platform.includes('Loomy'))) {
    rows.push(loomyEntry(maxId))
    report.added.push(`讯飞 Loomy(id=${maxId + 1})`)
  }

  rows.sort((x, y) => x.id - y.id)
  const out = {
    data: rows,
    syncedAt: nowIso(),
    snapshotNote: '数据库额度隔离期间的本地对齐快照（2026-11-16）',
    alignReport: report,
  }
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(out))
  console.log('总数', rows.length, '| active', rows.filter(a => a.status === 'active').length,
    '| expired', rows.filter(a => a.status === 'expired').length, '| offline', rows.filter(a => a.status === 'offline').length)
  console.log('修正:', report.fixed.join(' / ') || '无')
  console.log('过期下线:', report.expired.join(' / ') || '无')
  console.log('巡检死链下架:', report.offline.join(' / ') || '无')
  console.log('新增:', report.added.join(' / ') || '无')
  console.log('巡检条数:', report.checked)
}
main()
