/**
 * 极简 ZIP 读取（stored / deflate），只用于解开 OpenMotion 的 motion 说明包。
 * 不引入第三方依赖：中央目录 → 本地文件头 → inflateRaw。
 * 防御：限制条目数、单文件与总体积，拒绝目录穿越与绝对路径。
 */
import zlib from 'node:zlib'

const EOCD_SIG = 0x06054b50
const CENTRAL_SIG = 0x02014b50
const LOCAL_SIG = 0x04034b50

const MAX_ENTRIES = 400
const MAX_FILE_BYTES = 30 * 1024 * 1024
const MAX_TOTAL_BYTES = 120 * 1024 * 1024

export function isZip(buffer) {
  return buffer.length > 4 && buffer.readUInt32LE(0) === LOCAL_SIG
}

function safeName(name) {
  const normalized = name.replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return ''
  if (normalized.split('/').some((part) => part === '..')) return ''
  return normalized
}

/** 返回 [{ name, data: Buffer }]，只包含普通文件。 */
export function readZipEntries(buffer) {
  let eocd = -1
  const lower = Math.max(0, buffer.length - 65557)
  for (let offset = buffer.length - 22; offset >= lower; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIG) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error('不是有效的 ZIP 包（找不到中央目录）')

  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw new Error(`ZIP 条目过多（${count}）`)

  const entries = []
  let total = 0
  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIG) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const size = buffer.readUInt32LE(offset + 24)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = safeName(buffer.toString('utf8', offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength

    if (!name || name.endsWith('/')) continue
    if (entries.length >= MAX_ENTRIES) break
    if (size > MAX_FILE_BYTES || total + size > MAX_TOTAL_BYTES) continue
    if (buffer.readUInt32LE(localOffset) !== LOCAL_SIG) continue

    const localNameLength = buffer.readUInt16LE(localOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localOffset + 28)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(start, start + compressedSize)

    let data
    if (method === 0) data = raw
    else if (method === 8) data = zlib.inflateRawSync(raw)
    else continue
    total += data.length
    entries.push({ name, data })
  }
  return entries
}

/** 在包里找 motion 创作文档：优先 motion.md / MOTION_DESIGN.md，其次任意 markdown。 */
export function findMotionDocument(entries) {
  const score = (name) => {
    const base = name.split('/').pop().toLowerCase()
    if (base === 'motion.md') return 0
    if (base === 'motion_design.md') return 1
    if (base === 'template.md') return 2
    if (base.endsWith('.md')) return 3
    return 9
  }
  const candidates = entries.filter((entry) => score(entry.name) < 9)
  candidates.sort((a, b) => score(a.name) - score(b.name) || a.name.length - b.name.length)
  return candidates[0] || null
}
