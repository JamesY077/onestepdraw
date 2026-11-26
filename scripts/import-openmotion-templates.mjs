#!/usr/bin/env node
/**
 * 把本机 OpenMotion 安装的模板目录快照导出成 Stepframe 的内置目录。
 *
 * 用法：
 *   node scripts/import-openmotion-templates.mjs [openmotionAppDir]
 *
 * 默认读取 ~/.local/share/openmotion/apps/<最新版本>/ 与
 * ~/.local/share/openmotion/data/template-cache/<快照>/。
 * 只导出元数据与远程资源地址；封面、参考视频、motion.md 由本地服务按需下载缓存。
 * 署名与来源链接一并保留，参考素材的原始权利不因导出而改变。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const home = os.homedir()
const omRoot = path.join(home, '.local/share/openmotion')

function latestAppDir() {
  const apps = path.join(omRoot, 'apps')
  if (!fs.existsSync(apps)) return null
  const dirs = fs
    .readdirSync(apps)
    .map((name) => ({ name, mtime: fs.statSync(path.join(apps, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
  return dirs.length ? path.join(apps, dirs[0].name) : null
}

const appDir = process.argv[2] || latestAppDir()
if (!appDir) {
  console.error('未找到本机 OpenMotion 安装，请传入应用目录。')
  process.exit(1)
}

function readSnapshot() {
  const cacheRoot = path.join(omRoot, 'data/template-cache')
  const candidates = fs
    .readdirSync(cacheRoot)
    .map((dir) => path.join(cacheRoot, dir, 'hosted-snapshot.json'))
    .filter((file) => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  if (!candidates.length) throw new Error('未找到 hosted-snapshot.json')
  return JSON.parse(fs.readFileSync(candidates[0], 'utf8'))
}

const snapshot = readSnapshot()
const records = new Map()
for (const record of snapshot.records || []) {
  if (Array.isArray(record) && record.length === 2) records.set(record[0], record[1])
}

/** 内置（可编辑工程）模板不在 hosted 快照里，从仓库 catalog 补齐。 */
const catalogDir = path.join(appDir, 'library/templates/catalog')
if (fs.existsSync(catalogDir)) {
  for (const dir of fs.readdirSync(catalogDir)) {
    const file = path.join(catalogDir, dir, 'template.json')
    if (!fs.existsSync(file)) continue
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!records.has(dir)) records.set(dir, parsed)
  }
}

const str = (value) => (typeof value === 'string' ? value.trim() : '')
const num = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const templates = []
for (const [id, record] of records) {
  const entry = record?.entry || {}
  const original = entry.original || {}
  const name = str(original.templateName)
  if (!name) continue
  const files = Array.isArray(entry.files)
    ? entry.files
        .filter((file) => file && str(file.path) && str(file.url))
        .map((file) => ({ path: file.path, url: file.url, bytes: num(file.bytes) }))
    : []
  // 上游 pending 草稿可能已经有 index.html，却仍缺 motion.js 等必要文件的下载地址。
  // 只有所有运行文件都可获取时才标为「可编辑」；许可证文本不参与可运行性判断。
  const requiredFiles = Array.isArray(entry.files)
    ? entry.files.filter((file) => file && str(file.path) && !/(^|\/)GSAP-LICENSE\.txt$/i.test(file.path))
    : []
  const editable = Boolean(
    (str(entry.indexUrl) || files.some((file) => file.path === 'index.html')) &&
    requiredFiles.length > 0 &&
    requiredFiles.every((file) => str(file.url)),
  )
  templates.push({
    id,
    name,
    summary: str(original.summary),
    style: str(original.styleDescription),
    reviewFocus: str(original.reviewFocus),
    useCase: str(original.promotionalUseCases),
    presentation: str(original.visualPresentation),
    brand: str(original.brand || entry.brand),
    duration: Math.round(num(original.durationSeconds) * 1000) / 1000,
    width: num(entry.width) || 1280,
    height: num(entry.height) || 720,
    colors: Array.isArray(entry.colors) ? entry.colors.filter((color) => typeof color === 'string') : [],
    cover: str(entry.coverUrl || original.cover),
    video: str(entry.previewUrl || original.videoPreview),
    motionDoc: str(entry.motionDocumentUrl),
    motionGuide: str(entry.motionGuideUrl),
    sourceUrl: str(original.sourceUrl),
    editable,
    indexUrl: str(entry.indexUrl),
    files,
  })
}

templates.sort((a, b) => Number(b.editable) - Number(a.editable) || a.name.localeCompare(b.name, 'zh-CN'))

const tags = new Map()
for (const tpl of templates) {
  for (const value of [tpl.useCase, tpl.presentation]) {
    if (!value) continue
    tags.set(value, (tags.get(value) || 0) + 1)
  }
}

const header = `/**
 * OpenMotion 模板目录快照。
 *
 * 由 scripts/import-openmotion-templates.mjs 生成，请勿手改。
 * 来源：OpenMotion（https://github.com/nexu-io/openmotion，Apache-2.0）。
 * 参考视频、品牌、截图与字体的原始权利归各自作者，导出目录不代表重新授权；
 * 每条模板保留 sourceUrl 署名，复刻产物属于独立的再创作。
 * 生成时间：${new Date().toISOString().slice(0, 10)}，共 ${templates.length} 条。
 */
import type { OpenMotionTemplate } from './openmotionTypes'

export const OPENMOTION_TEMPLATES: OpenMotionTemplate[] = `

fs.writeFileSync(
  path.join(root, 'src/features/template/openmotionCatalog.ts'),
  `${header}${JSON.stringify(templates, null, 2)}\n`,
)

console.log(`导出 ${templates.length} 条模板（可编辑工程 ${templates.filter((t) => t.editable).length} 条）`)
console.log('标签分布：', Object.fromEntries([...tags.entries()].sort((a, b) => b[1] - a[1])))
