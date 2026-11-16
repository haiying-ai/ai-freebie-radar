/**
 * EdgeOne Pages 一键部署
 *
 * 用法：
 *   EDGEONE_API_TOKEN=xxx node scripts/deploy-edgeone.mjs            # 部署现有 edgeone-dist
 *   EDGEONE_API_TOKEN=xxx node scripts/deploy-edgeone.mjs --build    # 先重新构建再部署
 *   node scripts/deploy-edgeone.mjs --token xxx --project ai-freebie-radar
 *
 * 说明：
 *   - 上传目录会剔除 .git，避免版本信息被当作静态资源暴露
 *   - 项目必须是「直接上传」类型（Git 导入类型不能走 CLI 更新）
 *   - 第一次部署后把返回的域名写进 EDGEONE_SITE_URL，再重新构建部署一次，
 *     canonical / OG / 二维码里的地址才会是新域名
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'edgeone-dist')
const UPLOAD = path.join(ROOT, 'edgeone-upload')

const argv = process.argv.slice(2)
const getArg = (name, dft) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dft
}

const PROJECT = getArg('project', 'ai-freebie-radar')
const AREA = getArg('area', 'global')
const TOKEN = getArg('token', process.env.EDGEONE_API_TOKEN || '')
const BUILD = argv.includes('--build')

const log = (...a) => console.log('[deploy]', ...a)

if (!TOKEN) {
  console.error('[deploy] 缺少 API Token：--token 或环境变量 EDGEONE_API_TOKEN')
  process.exit(2)
}

if (BUILD) {
  log('重新构建静态站…')
  execFileSync(process.execPath, [path.join(__dirname, 'build-edgeone.mjs')], {
    cwd: ROOT, stdio: 'inherit', env: process.env,
  })
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[deploy] edgeone-dist 缺少 index.html，先执行 npm run build:edgeone')
  process.exit(2)
}

/* 整理上传目录：排除 .git，保证 index.html 在根层 */
fs.rmSync(UPLOAD, { recursive: true, force: true })
fs.mkdirSync(UPLOAD, { recursive: true })
fs.cpSync(DIST, UPLOAD, {
  recursive: true,
  filter: src => !/[\\/]\.git([\\/]|$)/.test(src),
})
const size = execFileSync(process.execPath, ['-e',
  `const fs=require('fs'),p=require('path');let n=0;s=(d)=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,f.name);f.isDirectory()?s(q):n+=fs.statSync(q).size}return n};console.log((s(${JSON.stringify(UPLOAD)})/1048576).toFixed(2)+'MB, '+((c)=>{let t=0;const w=(d)=>{for(const f of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,f.name);f.isDirectory()?w(q):t++}};w(c);return t})(${JSON.stringify(UPLOAD)})+' files')`,
], { encoding: 'utf8' }).trim()
log(`上传包 ${size} → 项目 ${PROJECT} (${AREA})`)

/* 部署 */
let out = ''
try {
  out = execFileSync('npx', [
    '-y', 'edgeone@latest', 'makers', 'deploy', UPLOAD,
    '-n', PROJECT, '-t', TOKEN, '-a', AREA, '--json',
  ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 600000 })
} catch (e) {
  console.error('[deploy] 部署失败:', e.message)
  process.exit(1)
}

const line = String(out).split('\n').map(s => s.trim()).filter(s => s.startsWith('{')).pop()
if (!line) {
  console.log(out)
  console.error('[deploy] 未解析到 JSON 结果')
  process.exit(1)
}

let res = {}
try { res = JSON.parse(line) } catch (e) { console.error('[deploy] JSON 解析失败:', line); process.exit(1) }
console.log(JSON.stringify(res, null, 2))

const url = res.url || res.previewUrl || res.domain || res.productionUrl ||
  (res.data && (res.data.url || res.data.domain)) || ''
if (url) log('线上地址:', url)
else log('部署完成，请在控制台查看分配域名')
fs.writeFileSync(path.join(ROOT, '.edgeone-last-deploy.json'), JSON.stringify(res, null, 2))
