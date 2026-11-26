/**
 * OpenMotion 模板目录 + 动效工程的无付费回归。
 * 不访问任何真实生成接口；motion.md 用本地 mock fetch，渲染 CLI 不在本测试里触发。
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPinia, setActivePinia } from 'pinia'
import { createServer } from 'vite'
import { createMotionService } from '../server/local/motion.mjs'

const values = new Map()
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
}
globalThis.localStorage = storage
globalThis.sessionStorage = storage

setActivePinia(createPinia())
const vite = await createServer({ server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'error' })
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stepframe-motion-'))
const rootDir = process.cwd()

function makeRes() {
  return {
    status: 0,
    payload: null,
    headers: {},
    setHeader(key, value) { this.headers[key] = value },
    writeHead(status) { this.status = status },
    end() {},
  }
}

const sendJson = (res, status, payload) => {
  res.status = status
  res.payload = payload
}
const sendFile = (res, file) => {
  res.status = 200
  res.file = file
}

function request(service, url, body) {
  const req = {
    url,
    method: body === undefined ? 'GET' : 'POST',
    on(event, handler) {
      if (event === 'data' && body !== undefined) handler(JSON.stringify(body))
      if (event === 'end') handler()
    },
  }
  const res = makeRes()
  return service.handle(req, res).then(() => res)
}

try {
  const { OPENMOTION_TEMPLATES } = await vite.ssrLoadModule('/src/features/template/openmotionCatalog.ts')
  const {
    openMotionTags,
    buildOpenMotionHandoff,
    buildReferenceRemakePrompt,
  } = await vite.ssrLoadModule('/src/features/template/openmotionTypes.ts')
  const { parseMotionVariables } = await vite.ssrLoadModule('/src/stores/motionStore.ts')
  const { executeMotionTool } = await vite.ssrLoadModule('/src/features/agent/motionTools.ts')

  // 1. 目录快照完整、ID 唯一、可编辑工程带文件清单。
  assert.ok(OPENMOTION_TEMPLATES.length >= 280, `模板数量异常：${OPENMOTION_TEMPLATES.length}`)
  assert.equal(new Set(OPENMOTION_TEMPLATES.map((item) => item.id)).size, OPENMOTION_TEMPLATES.length)
  assert.ok(OPENMOTION_TEMPLATES.every((item) => item.name && item.id.startsWith('motion-')))
  const editable = OPENMOTION_TEMPLATES.filter((item) => item.editable)
  assert.ok(editable.length >= 4, '可编辑工程模板不应为空')
  assert.ok(editable.every((item) => item.files.length > 0))
  assert.ok(editable.every((item) => item.files.some((file) => file.path === 'index.html')))
  assert.ok(editable.every((item) => item.files.every((file) => file.url)))
  assert.equal(
    OPENMOTION_TEMPLATES.find((item) => item.id === 'motion-dac924da-010f-4445-baf3-a39cb033e48f')?.editable,
    false,
    '缺少 motion.js 下载地址的上游草稿必须按参考复刻处理',
  )

  // 2. 标签拆分与复刻交接提示词。
  const sample = OPENMOTION_TEMPLATES.find((item) => item.motionDoc) || OPENMOTION_TEMPLATES[0]
  assert.deepEqual(openMotionTags({ useCase: '产品发布', presentation: '图形动效, 实拍剪辑' }), ['产品发布', '图形动效', '实拍剪辑'])
  const handoff = buildOpenMotionHandoff(sample)
  assert.ok(handoff.includes(sample.id))
  assert.ok(handoff.includes('不承诺精确复刻'))
  assert.ok(handoff.includes(sample.motionDoc))
  assert.ok(handoff.endsWith('我的要求：'))
  assert.ok(buildReferenceRemakePrompt('https://example.com/a.mp4').includes('https://example.com/a.mp4'))

  // 3. 参数契约解析：类型、默认值、单引号与 &#39; 转义、坏 JSON 不炸。
  const parsed = parseMotionVariables(`<html data-composition-variables='[{"id":"title","type":"string","label":"标题","default":"It&#39;s ok"},{"id":"accent","type":"color","default":"#fff"},{"id":"count","type":"number","default":3},{"id":"mood","type":"enum","options":["a","b"]}]'>`)
  assert.equal(parsed.length, 4)
  assert.equal(parsed[0].default, "It's ok")
  assert.equal(parsed[1].type, 'color')
  assert.equal(parsed[3].options[1], 'b')
  assert.deepEqual(parseMotionVariables('<html data-composition-variables=\'{bad}\'>'), [])
  assert.deepEqual(parseMotionVariables('<html>'), [])

  // 4. 本地动效服务：建工程、参数写回 HTML、路径与来源白名单。
  const service = createMotionService({ dataDir, rootDir, sendJson, sendFile })
  const created = await request(service, '/local/motion/create', { name: '回归工程' })
  assert.equal(created.status, 200)
  const project = created.payload.project
  assert.ok(project.id.startsWith('motion_'))
  const dir = path.join(dataDir, 'motion-projects', project.id)
  assert.ok(fs.existsSync(path.join(dir, 'index.html')))
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'gsap.min.js')), 'GSAP 必须随工程落盘，预览不依赖外网')
  const starter = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  assert.ok(starter.includes('data-composition-id="main"'))
  assert.ok(starter.includes('window.__timelines'))

  const updated = await request(service, '/local/motion/update', { id: project.id, params: { title: '新标题', accent: '#123456' } })
  assert.equal(updated.status, 200)
  const afterParams = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  assert.ok(afterParams.includes('新标题'), '参数必须写回 HTML 默认值，预览与渲染才一致')
  assert.ok(afterParams.includes('#123456'))
  assert.equal(updated.payload.project.params.title, '新标题')

  const incompleteTemplate = OPENMOTION_TEMPLATES.find((item) => item.id === 'motion-dac924da-010f-4445-baf3-a39cb033e48f')
  const referenceDraft = await request(service, '/local/motion/create', {
    name: '参考复刻',
    template: { ...incompleteTemplate, motionDoc: '', motionGuide: '' },
  })
  const referenceIndex = await request(service, '/local/motion/read', { id: referenceDraft.payload.project.id, path: 'index.html' })
  assert.ok(referenceIndex.payload.content.includes('window.__timelines'), '参考型模板必须从完整空白工程开始')
  assert.ok(!referenceIndex.payload.content.includes('assets/motion.js'), '不得复制缺文件的上游草稿')

  const written = await request(service, '/local/motion/write', { id: project.id, path: 'notes.md', content: '# hi' })
  assert.equal(written.status, 200)
  const readBack = await request(service, '/local/motion/read', { id: project.id, path: 'notes.md' })
  assert.equal(readBack.payload.content, '# hi')
  const traversal = await request(service, '/local/motion/read', { id: project.id, path: '../../etc/passwd' }).catch((error) => ({ error }))
  assert.ok(traversal.error || !traversal.payload?.content, '目录穿越必须被拒绝')
  await assert.rejects(
    () => request(service, '/local/motion/asset?url=' + encodeURIComponent('https://evil.example.com/x.mp4')),
    /不允许的资源来源/,
  )
  await assert.rejects(
    () => request(service, '/local/motion/asset?url=' + encodeURIComponent('http://r.open-design.ai/x')),
    /不允许的资源来源|资源地址不合法/,
  )

  const served = await request(service, `/local/motion/file?id=${project.id}&path=index.html`)
  assert.equal(served.file, path.join(dir, 'index.html'))
  const listed = await request(service, '/local/motion/list')
  assert.ok(listed.payload.projects.some((item) => item.id === project.id))

  // 5. Agent 工具：检索、读取模板（mock motion.md）、未知模板报错。
  const found = await executeMotionTool({ name: 'list_motion_templates', args: { query: sample.name.slice(0, 4), limit: 3 } }, {}, {})
  assert.ok(found.templates.length >= 1)
  assert.ok(found.templates[0].id.startsWith('motion-'))
  assert.ok(!('files' in found.templates[0]), '检索结果不应带完整文件清单')

  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('# 动效说明\n镜头顺序与停留点', { status: 200 })
  const detail = await executeMotionTool({ name: 'read_motion_template', args: { templateId: sample.id } }, {}, {})
  assert.match(detail.motionDocument, /动效说明/)
  assert.ok(detail.template.reviewFocus !== undefined)
  assert.ok(detail.template.referenceVideo.includes('/local/motion/asset'))
  globalThis.fetch = originalFetch

  await assert.rejects(
    () => executeMotionTool({ name: 'read_motion_template', args: { templateId: 'motion-not-exist' } }, {}, {}),
    /目录里没有模板/,
  )
  await assert.rejects(
    () => executeMotionTool({ name: 'create_motion_project', args: { name: 'x' } }, {}, {}),
    /没有关联剪辑项目/,
  )

  console.log('✓ OpenMotion 目录、复刻提示词、参数契约、动效工程服务与 Agent 动效工具全部通过（无付费调用）')
} finally {
  await vite.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
