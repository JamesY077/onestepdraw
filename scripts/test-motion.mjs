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
import { createMotionService, motionRenderEnvironment, bundledBrowserPath, bundledToolPath, motionRenderRuntime, resolveRenderWorkers, buildRenderArgs, parseRenderProgress, compositionDuration, markMotionShot, motionRootComposition, motionSourceReady, validateMotionCompositionSource } from '../server/local/motion.mjs'

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
  const { executeMotionTool, motionDimensions, motionSourceHasAsset } = await vite.ssrLoadModule('/src/features/agent/motionTools.ts')
  const { useEditProjectStore } = await vite.ssrLoadModule('/src/stores/editProjectStore.ts')
  assert.deepEqual(motionDimensions({ aspectRatio: '9:16', resolution: '768P' }), { width: 720, height: 1280 })
  assert.deepEqual(motionDimensions({ aspectRatio: '9:16', resolution: '2K' }), { width: 1440, height: 2560 })
  assert.ok(motionSourceHasAsset('<!-- <img src="assets/uploads/fake.svg"> --><script>const fake="assets/uploads/fake.svg"</script><img src="assets/uploads/brand%20logo.svg">', 'assets/uploads/brand logo.svg'))
  assert.ok(!motionSourceHasAsset('<!-- <img src="assets/uploads/fake.svg"> --><script>const fake="assets/uploads/fake.svg"</script>', 'assets/uploads/fake.svg'))
  const { routeConversationRequest } = await vite.ssrLoadModule('/src/features/agent/conversationRouting.ts')
  const { flashComposerPrompt, consumeComposerPromptContext } = await vite.ssrLoadModule('/src/features/template/navigation.ts')

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
  const logo = {
    id: 'logo', kind: 'image', name: 'Logo.png', mime: 'image/png', size: 3,
    url: '/generated/uploads/logo.png', createdAt: Date.now(),
  }
  assert.equal(routeConversationRequest({
    content: `${handoff}\n替换 Logo 并修改文案`, attachments: [logo], creativeEngine: 'animation',
  }), 'agent', '真实 OpenMotion 交接 + Logo 必须绕过旧附件编辑')
  assert.equal(routeConversationRequest({
    content: '把 Logo 白色背景去掉', attachments: [logo], creativeEngine: 'aigc',
  }), 'attachment-media')
  flashComposerPrompt(handoff, 'animation')
  assert.deepEqual(consumeComposerPromptContext(), { prompt: handoff, creativeEngine: 'animation' })

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
  const renderEnv = motionRenderEnvironment({ PATH: '/mock/bin', HYPERFRAMES_FFMPEG_PATH: '/mock/ffmpeg' })
  assert.equal(renderEnv.ELECTRON_RUN_AS_NODE, '1', 'Electron 启动 HyperFrames CLI 及 reaper 时必须强制使用 Node 模式')
  assert.equal(renderEnv.HYPERFRAMES_NO_TELEMETRY, '1')
  assert.equal(renderEnv.HYPERFRAMES_FFMPEG_PATH, '/mock/ffmpeg', '显式 ffmpeg 配置不应被覆盖')
  assert.equal(renderEnv.PATH, '/mock/bin')

  // 渲染用的 Chromium 必须随 App 分发：优先 Resources，其次开发态 .runtime，
  // 不能等到首次渲染再下载，也不能依赖用户装 Chrome。
  const binaryName = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell'
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'stepframe-browser-'))
  const devRuntime = path.join(runtimeRoot, '.runtime', 'chrome-headless-shell')
  fs.mkdirSync(devRuntime, { recursive: true })
  fs.writeFileSync(path.join(devRuntime, binaryName), '')
  assert.equal(bundledBrowserPath({ rootDir: runtimeRoot, resourcesPath: '' }), path.join(devRuntime, binaryName))
  const packedRoot = path.join(runtimeRoot, 'resources', 'chrome-headless-shell')
  fs.mkdirSync(packedRoot, { recursive: true })
  fs.writeFileSync(path.join(packedRoot, binaryName), '')
  assert.equal(
    bundledBrowserPath({ rootDir: runtimeRoot, resourcesPath: path.join(runtimeRoot, 'resources') }),
    path.join(packedRoot, binaryName),
    '打包后必须优先使用 App 内自带的 Chromium',
  )
  assert.equal(bundledBrowserPath({ rootDir: runtimeRoot, resourcesPath: path.join(runtimeRoot, 'missing') }), path.join(devRuntime, binaryName))
  const bundledEnv = motionRenderEnvironment({ PATH: '/mock/bin' }, { rootDir: runtimeRoot, resourcesPath: '' })
  assert.equal(bundledEnv.HYPERFRAMES_BROWSER_PATH, path.join(devRuntime, binaryName), '渲染前必须把内置 Chromium 指给 HyperFrames')
  const explicitEnv = motionRenderEnvironment(
    { HYPERFRAMES_BROWSER_PATH: '/custom/chrome' },
    { rootDir: runtimeRoot, resourcesPath: '' },
  )
  assert.equal(explicitEnv.HYPERFRAMES_BROWSER_PATH, '/custom/chrome', '显式指定浏览器时不要覆盖')
  // FFmpeg 也支持随包分发；没有内置时仍按 Homebrew / PATH 回退。
  const ffmpegRuntime = path.join(runtimeRoot, '.runtime', 'ffmpeg')
  fs.mkdirSync(ffmpegRuntime, { recursive: true })
  const ffmpegName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
  const ffprobeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  fs.writeFileSync(path.join(ffmpegRuntime, ffmpegName), '')
  fs.writeFileSync(path.join(ffmpegRuntime, ffprobeName), '')
  assert.equal(bundledToolPath('ffmpeg', { rootDir: runtimeRoot, resourcesPath: '' }), path.join(ffmpegRuntime, ffmpegName))
  const bundledFfmpegEnv = motionRenderEnvironment({ PATH: '/mock/bin' }, { rootDir: runtimeRoot, resourcesPath: '' })
  assert.equal(bundledFfmpegEnv.HYPERFRAMES_FFMPEG_PATH, path.join(ffmpegRuntime, ffmpegName))
  assert.equal(bundledFfmpegEnv.HYPERFRAMES_FFPROBE_PATH, path.join(ffmpegRuntime, ffprobeName))
  const missingRuntime = motionRenderRuntime({ rootDir: runtimeRoot, resourcesPath: path.join(runtimeRoot, 'missing') })
  assert.equal(missingRuntime.cliReady, false)
  assert.equal(missingRuntime.ready, false)
  fs.rmSync(runtimeRoot, { recursive: true, force: true })

  // 导出慢的根因回归：auto worker 会关掉 drawElement 快速捕获，短片必须固定 1 个 worker。
  assert.equal(resolveRenderWorkers({ durationSeconds: 6, fps: 30 }), 1)
  assert.equal(resolveRenderWorkers({ durationSeconds: 30, fps: 30 }), 1)
  assert.equal(resolveRenderWorkers({ durationSeconds: 31, fps: 30 }), 2)
  assert.equal(resolveRenderWorkers({ durationSeconds: 120, fps: 30 }), 4)
  assert.equal(resolveRenderWorkers({}), 1, '读不到时长时保守用 1 个 worker，保证快速捕获可用')
  const shortArgs = buildRenderArgs({
    cli: '/cli.mjs', dir: '/proj', output: '/out.mp4', fps: 30, duration: 6,
    params: { title: '新标题' },
  })
  assert.equal(shortArgs.workers, 1)
  assert.equal(shortArgs.args[shortArgs.args.indexOf('--workers') + 1], '1')
  assert.equal(shortArgs.args[shortArgs.args.indexOf('--format') + 1], 'mp4')
  assert.equal(shortArgs.args[shortArgs.args.indexOf('-f') + 1], '30')
  assert.deepEqual(shortArgs.args.slice(-2), ['--variables', JSON.stringify({ title: '新标题' })])
  const longArgs = buildRenderArgs({ cli: '/cli.mjs', dir: '/proj', output: '/out.mp4', fps: 30, duration: 45 })
  assert.equal(longArgs.workers, 2)
  assert.ok(!longArgs.args.includes('--variables'), '没有参数时不要传空 --variables')
  // 时间轴只用前 4 秒：传 --end 截断，避免 48s 模板整段出片。
  const trimmedArgs = buildRenderArgs({ cli: '/cli.mjs', dir: '/proj', output: '/out.mp4', fps: 30, duration: 48, end: 4 })
  assert.equal(trimmedArgs.args[trimmedArgs.args.indexOf('--end') + 1], '4')
  assert.equal(trimmedArgs.workers, 1, 'worker 数按实际渲染区间而不是整段时长计算')
  const wholeArgs = buildRenderArgs({ cli: '/cli.mjs', dir: '/proj', output: '/out.mp4', fps: 30, duration: 4.8, end: 4.8 })
  assert.ok(!wholeArgs.args.includes('--end'), '需要的区间等于整段时不要截断')

  // 进度取最后一条完整的 @hf-progress；被 chunk 截断的半行 JSON 不能污染进度。
  assert.deepEqual(
    parseRenderProgress('@hf-progress {"code":"compile","pct":5}\n@hf-progress {"code":"capture","done":90,"total":180,"pct":52}\n@hf-progress {"code":"capture","done":1'),
    { pct: 52, code: 'capture', label: '渲染画面', done: 90, total: 180 },
  )
  assert.equal(parseRenderProgress('没有进度'), null)
  assert.equal(parseRenderProgress(''), null)

  const created = await request(service, '/local/motion/create', { name: '回归工程' })
  assert.equal(created.status, 200)
  const project = created.payload.project
  assert.ok(project.id.startsWith('motion_'))
  const dir = path.join(dataDir, 'motion-projects', project.id)
  assert.ok(fs.existsSync(path.join(dir, 'index.html')))
  assert.ok(fs.existsSync(path.join(dir, 'assets', 'gsap.min.js')), 'GSAP 必须随工程落盘，预览不依赖外网')
  assert.equal(compositionDuration(dir), 6, '根合成时长必须从 data-composition-id 那一行读取，用于成片校验')

  // 4.0 最近渲染产物：短于时间轴需要的旧切片不能复用，否则后半段黑场。
  const generatedDir = path.join(dataDir, 'generated')
  const stamp = Date.now()
  const fullRender = path.join(generatedDir, `${project.id}-${stamp - 20000}.mp4`)
  const shortRender = path.join(generatedDir, `${project.id}-${stamp - 10000}-e4000.mp4`)
  fs.writeFileSync(fullRender, '')
  fs.writeFileSync(shortRender, '')
  fs.utimesSync(path.join(dir, 'index.html'), new Date(stamp - 60000), new Date(stamp - 60000))
  fs.utimesSync(fullRender, new Date(stamp - 20000), new Date(stamp - 20000))
  fs.utimesSync(shortRender, new Date(stamp - 10000), new Date(stamp - 10000))
  const needThree = await request(service, `/local/motion/render/latest?id=${project.id}&end=3`)
  assert.equal(path.basename(needThree.payload.url), path.basename(shortRender), '够长的切片优先复用')
  assert.equal(needThree.payload.stale, false)
  const needFive = await request(service, `/local/motion/render/latest?id=${project.id}&end=5`)
  assert.equal(path.basename(needFive.payload.url), path.basename(fullRender), '4s 切片不够 5s 时必须退回完整渲染')
  const fullOnly = await request(service, `/local/motion/render/latest?id=${project.id}`)
  assert.equal(path.basename(fullOnly.payload.url), path.basename(fullRender), '不传 end 只复用完整渲染')
  fs.rmSync(fullRender, { force: true })
  fs.rmSync(shortRender, { force: true })
  const starter = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
  assert.ok(starter.includes('data-composition-id="main"'))
  assert.ok(starter.includes('window.__timelines'))
  const portrait = await request(service, '/local/motion/create', { name: '竖屏工程', width: 720, height: 1280 })
  assert.equal(portrait.status, 200)
  assert.equal(portrait.payload.project.width, 720)
  assert.equal(portrait.payload.project.height, 1280)
  const portraitStarter = fs.readFileSync(path.join(dataDir, 'motion-projects', portrait.payload.project.id, 'index.html'), 'utf8')
  assert.ok(portraitStarter.includes('data-width="720" data-height="1280"'))
  const discarded = await request(service, '/local/motion/discard', { id: portrait.payload.project.id })
  assert.equal(discarded.status, 200)
  assert.ok(!fs.existsSync(path.join(dataDir, 'motion-projects', portrait.payload.project.id)), '回滚必须删除整个孤儿工程目录')
  await assert.rejects(() => request(service, '/local/motion/discard', { id: '../../outside' }), /不存在|不合法/)
  await assert.rejects(
    () => request(service, '/local/motion/write', { id: project.id, content: '<html><body>只有场景，没有合成轨道</body></html>' }),
    /HyperFrames 合成结构不完整/,
    '非法源码必须写回失败，不能成功保存后只显示播放器占位页',
  )
  assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), starter, '校验失败不得覆盖上一份可用工程')
  assert.equal((await request(service, '/local/motion/write', { id: project.id, content: starter })).status, 200)

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

  // 4.1 可编辑模板：保留模板原画幅（预览/导出统一 contain），注入镜号后即可直接使用。
  const portraitTemplateHtml = [
    '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="assets/styles.css"></head><body>',
    '<main id="root" data-composition-id="google-salsa-089" data-start="0" data-duration="4.8" data-width="406" data-height="720">',
    '<section class="scene"><h1>Vertical</h1></section></main>',
    '</body></html>',
  ].join('')
  const templateRoot = motionRootComposition(portraitTemplateHtml)
  assert.equal(templateRoot?.id, 'google-salsa-089', '根合成不能只认 main')
  assert.equal(motionRootComposition('<html><body><div data-composition-id="main" data-width="1280" data-height="720"></div></body></html>')?.width, 1280)
  const markedTemplate = markMotionShot(portraitTemplateHtml, 'S01')
  assert.ok(markedTemplate.startsWith('<!doctype html><html data-stepframe-shot="S01">'))
  assert.ok(motionSourceReady(markedTemplate, { width: 406, height: 720, shotId: 'S01' }))
  assert.ok(!motionSourceReady(markedTemplate, { width: 1280, height: 720 }), '工程真实画幅必须匹配')
  assert.ok(!motionSourceReady(markedTemplate, { width: 406, height: 720, shotId: 'S02' }), '缺镜号不能算完成')
  // 官方模板可以没有 class="clip"/data-track-index；只要有 clip 才强制轨道字段。
  assert.equal(validateMotionCompositionSource(portraitTemplateHtml), true)
  assert.throws(
    () => validateMotionCompositionSource('<div data-composition-id="x" data-duration="4" data-start="0"><section class="clip" data-start="0"></section></div>'),
    /轨道 data-track-index/,
  )

  const originalTemplateFetch = globalThis.fetch
  const templateFiles = {
    'https://r.open-design.ai/files/portrait-index': portraitTemplateHtml,
    'https://r.open-design.ai/files/portrait-style': 'html,body{margin:0;background:#111}',
  }
  globalThis.fetch = async (url) => {
    const body = templateFiles[String(url)]
    if (body === undefined) throw new Error(`未 mock 的模板资源：${url}`)
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } })
  }
  try {
    const templateProject = await request(service, '/local/motion/create', {
      name: '模板适配回归',
      width: 1280,
      height: 720,
      shotId: 'S01',
      template: {
        id: 'motion-fake', editable: true, width: 406, height: 720,
        files: [
          { path: 'index.html', url: 'https://r.open-design.ai/files/portrait-index' },
          { path: 'assets/styles.css', url: 'https://r.open-design.ai/files/portrait-style' },
        ],
      },
    })
    assert.equal(templateProject.status, 200)
    assert.equal(templateProject.payload.project.sourceReady, true, '完整模板副本应直接可用')
    assert.equal(templateProject.payload.project.width, 406, '工程画幅必须记录模板真实画幅')
    assert.equal(templateProject.payload.project.height, 720)
    const templateDir = path.join(dataDir, 'motion-projects', templateProject.payload.project.id)
    const templateIndex = fs.readFileSync(path.join(templateDir, 'index.html'), 'utf8')
    const keptRoot = motionRootComposition(templateIndex)
    assert.equal(keptRoot.width, 406, '不得改写模板根画幅')
    assert.equal(keptRoot.height, 720)
    assert.ok(!/style="[^"]*transform:/.test(keptRoot.tag), '不得给模板根元素塞缩放 transform')
    assert.ok(templateIndex.includes('data-stepframe-shot="S01"'), '模板副本必须带镜号，宿主才能确认归属')
    assert.equal(compositionDuration(templateDir), 4.8, '注入镜号不能改动时长')
    const templateWrite = await request(service, '/local/motion/write', {
      id: templateProject.payload.project.id,
      content: templateIndex,
    })
    assert.equal(templateWrite.status, 200, '官方模板源码写回不能被轨道校验误拦')
  } finally {
    globalThis.fetch = originalTemplateFetch
  }

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

  const uploadDir = path.join(dataDir, 'generated', 'uploads')
  fs.mkdirSync(uploadDir, { recursive: true })
  fs.writeFileSync(path.join(uploadDir, 'brand logo.png'), Buffer.from([1, 2, 3]))
  const imported = await request(service, '/local/motion/import', {
    id: project.id,
    source: '/generated/uploads/brand%20logo.png',
    fileName: '品牌 Logo.png',
  })
  assert.equal(imported.status, 200)
  assert.match(imported.payload.path, /^assets\/uploads\/[a-f0-9]{8}-品牌 Logo\.png$/)
  assert.deepEqual(fs.readFileSync(path.join(dir, imported.payload.path)), Buffer.from([1, 2, 3]))
  await assert.rejects(
    () => request(service, '/local/motion/import', { id: project.id, source: path.join(dir, 'index.html') }),
    /只允许导入本机/,
  )
  await assert.rejects(
    () => request(service, '/local/motion/import', { id: project.id, source: '/generated/uploads/../../secret' }),
    /只允许导入本机|不存在或路径不合法/,
  )

  const served = await request(service, `/local/motion/view/${project.id}/index.html`)
  assert.equal(served.file, path.join(dir, 'index.html'))
  // 目录式预览必须让 index.html 里的 assets/... 相对路径直接可访问，否则 Logo/照片会 404。
  const servedAsset = await request(service, `/local/motion/view/${project.id}/${imported.payload.path}`)
  assert.equal(servedAsset.file, path.join(dir, imported.payload.path))
  const listed = await request(service, '/local/motion/list')
  assert.ok(listed.payload.projects.some((item) => item.id === project.id))
  assert.match(project.entryUrl, new RegExp(`/local/motion/view/${project.id}/index\\.html$`))

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

  // 5.1 逐镜创建：shotId 必须下传；模板副本返回 sourceReady 时，只 create 不 write 也算可用。
  const editProjects = useEditProjectStore()
  const toolProject = editProjects.createProject('动效工具回归')
  const salsa = OPENMOTION_TEMPLATES.find((item) => item.id === 'motion-5eb6929e-d9f3-4a49-a69e-0363e45884dc')
  const toolShot = {
    id: 'S01', prompt: '竖屏模板', duration: 4, timelineStart: 0, status: 'running',
    requiredAssetSources: [], requiredAssetPaths: [],
  }
  const toolConversation = {
    id: 'conv_motion_tool',
    projectId: toolProject.id,
    production: {
      id: 'prod_motion_tool', engine: 'animation', status: 'running',
      aspectRatio: '16:9', resolution: '768P', shots: [toolShot],
    },
  }
  const createBodies = []
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url)
    if (href.includes('/local/motion/create')) {
      const body = JSON.parse(init.body)
      createBodies.push(body)
      return new Response(JSON.stringify({
        project: {
          id: 'motion_ready', name: body.name, entry: 'index.html',
          entryUrl: '/local/motion/view/motion_ready/index.html', templateId: salsa.id,
          sourceUrl: '', width: 406, height: 720, fps: 30,
          createdAt: Date.now(), updatedAt: Date.now(), params: {}, missingFiles: [],
          sourceReady: true,
        },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    throw new Error(`未拦截的请求：${href}`)
  }
  try {
    const createdByTool = await executeMotionTool(
      { name: 'create_motion_project', args: { name: salsa.name, templateId: salsa.id, at: 0, duration: 4 } },
      toolConversation,
      {},
    )
    assert.equal(createdByTool.ok, true)
    assert.equal(createBodies.length, 1)
    assert.equal(createBodies[0].shotId, 'S01', '逐镜创建必须把镜号传给服务端')
    assert.equal(createBodies[0].width, 1280)
    assert.equal(createBodies[0].height, 720)
    assert.equal(toolShot.motionWidth, 406, '必须记住模板真实画幅，写回时才能校验')
    assert.equal(toolShot.motionHeight, 720)
    assert.equal(toolShot.motionSourceReady, true, '完整模板副本无需再 write 也能记为可用')
    assert.ok(toolShot.clipId)
    const toolClip = editProjects.getProject(toolProject.id)?.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === toolShot.clipId)
    assert.ok(toolClip)
    assert.equal(toolClip.url, '/local/motion/view/motion_ready/index.html')
  } finally {
    globalThis.fetch = originalFetch
  }

  console.log('✓ OpenMotion 目录、复刻提示词、参数契约、动效工程服务与 Agent 动效工具全部通过（无付费调用）')
} finally {
  await vite.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
}
