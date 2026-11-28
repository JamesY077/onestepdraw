import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const values = new Map()
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
}
globalThis.localStorage = storage
globalThis.sessionStorage = storage

const server = await createServer({
  server: { middlewareMode: true, watch: null },
  appType: 'custom',
  logLevel: 'error',
})

try {
  const revision = await server.ssrLoadModule('/src/features/agent/clipRevision.ts')
  const routing = await server.ssrLoadModule('/src/features/agent/conversationRouting.ts')
  const { buildImageParams, buildVideoParams } = await server.ssrLoadModule('/src/features/generate/buildParams.ts')
  const { aspectRatioToDimensions } = await server.ssrLoadModule('/src/features/generate/aspectRatio.ts')
  const { getDefaultVideoResolution, getModelCapability, PREFERRED_DEFAULT_MODEL_IDS } = await server.ssrLoadModule('/src/types/model.ts')
  const { buildSeedanceRequestBody } = await server.ssrLoadModule('/src/api/providers/video/seedanceShared.ts')
  const {
    buildMinimaxH3ImageRequestBody,
    getMinimaxH3ImageEndpoint,
  } = await server.ssrLoadModule('/src/api/providers/image/minimaxH3Shared.ts')
  const { getExpandTargetSize } = await server.ssrLoadModule('/src/features/generate/expand.ts')
  const { getCloneDemoModel } = await server.ssrLoadModule('/src/features/voice/models.ts')
  const {
    BUILTIN_AGENT_NAME,
    BUILTIN_ENGINE_ID,
    useLocalAgentStore,
  } = await server.ssrLoadModule('/src/stores/localAgentStore.ts')

  setActivePinia(createPinia())
  const localAgentStore = useLocalAgentStore()
  localAgentStore.select(BUILTIN_ENGINE_ID)
  assert.equal(BUILTIN_AGENT_NAME, 'Stepframe Agent')
  assert.equal(localAgentStore.selectedLabel, BUILTIN_AGENT_NAME)
  assert.equal(localAgentStore.isLocalEngine, false)

  for (const model of ['MiniMax-Speech-2.8-hd', 'speech-2.8-hd', 'unknown-voice-model']) {
    assert.equal(getCloneDemoModel(model), 'MiniMax-Speech-2.8-hd')
  }

  assert.equal(PREFERRED_DEFAULT_MODEL_IDS.image[0], 'Doubao-Seedream-5.0-lite')
  for (const model of ['MiniMax-H3-Image', 'MiniMax-H3-Image-Highspeed']) {
    const capability = getModelCapability(model)
    assert.deepEqual(capability?.imageResolutions, ['1K', '2K', '4K'])
    assert.deepEqual(capability?.inputs, ['text', 'image'])
    assert.deepEqual(capability?.localUploadInputs, ['image'])
    assert.equal(capability?.imageReferenceMode, 'multi')
    assert.equal(capability?.imageReferenceLimit, 16)
  }

  const base = {
    trackId: 'track-1',
    trackName: '轨道 1',
    trackKind: 'video',
    start: 2,
    duration: 6,
  }
  const image = { ...base, id: 'image-1', name: '原图', kind: 'image', url: 'https://img.local/original.png' }
  const video = { ...base, id: 'video-1', name: '原视频', kind: 'video', url: 'https://video.local/original.mp4' }
  const audio = { ...base, id: 'audio-1', name: '原音频', kind: 'audio', url: 'https://audio.local/original.mp3' }
  const animation = {
    ...base,
    id: 'animation-1',
    name: '标题动画',
    kind: 'animation',
    url: 'data:text/html,old',
    code: '<html><body>old</body></html>',
    codeLanguage: 'html',
  }

  assert.equal(revision.routeSelectedClips([image, video]), 'media')
  assert.equal(revision.routeSelectedClips([animation]), 'animation')
  assert.equal(revision.routeSelectedClips([image, animation]), 'mixed')
  assert.equal(revision.routeSelectedClips([audio]), 'audio')
  assert.equal(revision.routeSelectedClips([]), 'none')

  const attachmentImage = {
    id: 'attachment-image', kind: 'image', name: '上传原图.png', mime: 'image/png', size: 1,
    url: image.url, createdAt: Date.now(),
  }
  const attachmentVideo = {
    id: 'attachment-video', kind: 'video', name: '上传原视频.mp4', mime: 'video/mp4', size: 1,
    url: video.url, duration: 6, createdAt: Date.now(),
  }
  assert.equal(routing.routeConversationRequest({
    content: '把背景改成雨夜', attachments: [attachmentImage],
  }), 'attachment-media')
  assert.equal(routing.routeConversationRequest({
    content: '把原视频里的人物去掉', attachments: [attachmentVideo],
  }), 'attachment-media')
  assert.equal(routing.routeConversationRequest({
    content: '给我修改建议，不要修改', attachments: [attachmentImage],
  }), 'none')
  assert.equal(routing.routeConversationRequest({
    content: '参考这张图生成一个相似场景', attachments: [attachmentImage],
  }), 'none')
  assert.equal(routing.routeConversationRequest({
    content: '直接修改源码', clips: [animation], attachments: [attachmentImage],
  }), 'animation')
  assert.equal(routing.routeConversationRequest({
    content: '复刻 OpenMotion，替换为我的 Logo 与品牌', attachments: [attachmentImage], creativeEngine: 'animation',
  }), 'agent', '动画模式的 Logo 必须进入 Agent/HyperFrames，不得进入附件付费编辑')
  assert.equal(routing.routeConversationRequest({
    content: '把这张 Logo 的白色背景去掉', attachments: [attachmentImage], creativeEngine: 'aigc',
  }), 'attachment-media', 'AIGC 普通附件编辑保持原路线')

  const originalRequest = '保留人物，只把背景改成雨夜。'
  assert.equal(revision.selectedClipPrompt(originalRequest, image), originalRequest)
  assert.equal(
    revision.selectedClipPrompt(originalRequest, { ...image, note: '不要改变构图。' }),
    '不要改变构图。\n保留人物，只把背景改成雨夜。',
  )

  const imageReference = revision.mediaReferenceForClip(image)
  const videoReference = revision.mediaReferenceForClip(video)
  const imageParams = await buildImageParams(
    originalRequest,
    'Doubao-Seedream-5.0-lite',
    imageReference,
    '16:9',
    'seedream-5-lite',
    undefined,
    'multi',
  )
  assert.equal(imageParams.prompt, originalRequest)
  assert.deepEqual(imageParams.image, [image.url])

  for (const model of ['MiniMax-H3-Image', 'MiniMax-H3-Image-Highspeed']) {
    const params = await buildImageParams(
      '一只橘猫趴在窗台上晒太阳',
      model,
      null,
      '16:9',
      'minimax-h3',
    )
    assert.deepEqual(params, {
      prompt: '一只橘猫趴在窗台上晒太阳',
      model,
      size: '2720x1536',
      response_format: 'url',
    })
    assert.equal(getMinimaxH3ImageEndpoint(params), '/images/generations')

    const references = Array.from({ length: 16 }, (_, index) => ({
      ...imageReference,
      name: `参考图${index + 1}.png`,
      refLabel: `图片${index + 1}`,
      url: `https://img.local/reference-${index + 1}.png`,
    }))
    const editParams = await buildImageParams(
      '把 @图片1 的橘猫放进 @图片2 的房间，保留 @图片16 的光线',
      model,
      references,
      '16:9',
      'minimax-h3',
      undefined,
      'multi',
      '4K',
    )
    assert.equal(editParams.image.length, 16)
    assert.equal(getMinimaxH3ImageEndpoint(editParams), '/images/edits')
    const editBody = buildMinimaxH3ImageRequestBody(editParams, model)
    assert.equal(editBody.image, undefined)
    assert.equal(editBody.images.length, 16)
    assert.deepEqual(editBody.images[0], { image_url: references[0].url })
    assert.deepEqual(editBody.images[15], { image_url: references[15].url })
    assert.equal(editBody.size, '5472x3072')
    assert.throws(
      () => buildMinimaxH3ImageRequestBody({
        ...editParams,
        image: Array.from({ length: 17 }, (_, index) => `https://img.local/${index}.png`),
      }, model),
      /最多支持 16 张/,
    )
  }
  const portraitParams = await buildImageParams(
    '竖版海报', 'MiniMax-H3-Image-Highspeed', null, '9:16', 'minimax-h3',
  )
  assert.equal(portraitParams.size, '1536x2720')

  const minimax4KSizes = {
    '21:9': '6272x2688',
    '16:9': '5472x3072',
    '3:2': '5024x3360',
    '4:3': '4736x3552',
    '1:1': '4096x4096',
    '3:4': '3552x4736',
    '2:3': '3360x5024',
    '9:16': '3072x5472',
  }
  for (const [ratio, size] of Object.entries(minimax4KSizes)) {
    const params = await buildImageParams(
      '原生 4K 细节测试', 'MiniMax-H3-Image', imageReference, ratio, 'minimax-h3', undefined, undefined, '4K',
    )
    assert.equal(params.size, size)
    assert.equal(params.image, image.url)
    assert.equal(params.response_format, 'url')
    const { width, height } = aspectRatioToDimensions(ratio, 'minimax-h3', '4K')
    assert.equal(`${width}x${height}`, size)
    assert.ok(width * height >= 16000000 && width * height <= 20000000)
  }
  const minimax1KParams = await buildImageParams(
    '快速草稿', 'MiniMax-H3-Image-Highspeed', null, '1:1', 'minimax-h3', undefined, undefined, '1K',
  )
  assert.equal(minimax1KParams.size, '1024x1024')
  assert.deepEqual(getExpandTargetSize('16:9', 'minimax-h3', '4K'), {
    width: 5472,
    height: 3072,
    size: '5472x3072',
  })
  assert.deepEqual(getExpandTargetSize('16:9'), {
    width: 2848,
    height: 1600,
    size: '2848x1600',
  })

  // 图片档位只属于 MiniMax；默认 Seedream 的尺寸与参考图参数保持原样。
  const seedreamParams = await buildImageParams(
    '默认模型回归', PREFERRED_DEFAULT_MODEL_IDS.image[0], imageReference, '1:1', 'seedream-5-lite', undefined, 'multi', '4K',
  )
  assert.equal(seedreamParams.size, '2048x2048')
  assert.deepEqual(seedreamParams.image, [image.url])

  const seedanceResolutionCases = [
    { model: 'Doubao-Seedance-2.0', options: ['480p', '720p', '1080p', '4k'], selected: '4k' },
    { model: 'Doubao-Seedance-2.5', options: ['480p', '720p', '1080p', '4k'], selected: '1080p' },
    { model: 'Doubao-Seedance-2.0-fast', options: ['480p', '720p'], selected: '480p' },
    { model: 'Doubao-Seedance-2.0-mini', options: ['480p', '720p'], selected: '720p' },
  ]
  for (const { model, options, selected } of seedanceResolutionCases) {
    assert.deepEqual(getModelCapability(model)?.videoResolutions, options)
    assert.equal(getDefaultVideoResolution(model), '720p')
    const params = await buildVideoParams(
      '一朵云缓缓掠过雪山', model, null, '16:9', 5, 'seedance-2', 'off', selected, 'text2video',
    )
    assert.equal(params.resolution, selected)
    assert.equal(params.aspect_ratio, '16:9')
    const body = buildSeedanceRequestBody(params, model)
    assert.equal(body.resolution, selected)
    assert.equal(body.ratio, '16:9')
  }

  // 未传档位时保持 Seedance 官方默认 720p；Fast / Mini 不错误下发高分辨率。
  const seedanceDefaultParams = await buildVideoParams(
    '默认分辨率回归', 'Doubao-Seedance-2.0', null, '16:9', 5, 'seedance-2', 'off', null, 'text2video',
  )
  assert.equal(buildSeedanceRequestBody(seedanceDefaultParams, 'Doubao-Seedance-2.0').resolution, '720p')
  assert.equal(buildSeedanceRequestBody({
    ...seedanceDefaultParams,
    model: 'Doubao-Seedance-2.0-fast',
    resolution: '4k',
  }, 'Doubao-Seedance-2.0-fast').resolution, '720p')

  const videoParams = await buildVideoParams(
    originalRequest,
    'MiniMax-H3',
    videoReference,
    '16:9',
    6,
    'minimax-h3',
    'off',
    '768P',
    'editVideo',
  )
  assert.equal(videoParams.prompt, originalRequest)
  assert.deepEqual(videoParams.reference_videos, [video.url])
  assert.equal(videoParams.first_frame_image, undefined)
  assert.equal(videoParams.img_url, undefined)

  const generated = revision.createMediaRevisionGeneration(video, originalRequest, {
    aspectRatio: '16:9',
    resolution: '768P',
    expectedRevision: 7,
  })
  assert.equal(generated.intent, 'edit')
  assert.equal(generated.targetClipId, video.id)
  assert.equal(generated.targetSourceUrl, video.url)
  assert.equal(generated.targetRevision, 7)
  assert.equal(generated.prompt, originalRequest)

  const attachmentGeneration = routing.createAttachmentMediaGeneration(
    attachmentVideo,
    originalRequest,
    { aspectRatio: '16:9', resolution: '768P' },
  )
  assert.equal(attachmentGeneration.intent, 'edit')
  assert.equal(attachmentGeneration.targetClipId, undefined)
  assert.equal(attachmentGeneration.targetSourceUrl, attachmentVideo.url)
  assert.equal(attachmentGeneration.prompt, originalRequest)
  assert.equal(attachmentGeneration.duration, 6)
  assert.equal(
    routing.attachmentReferenceForGeneration([attachmentImage, attachmentVideo], 'video').url,
    attachmentVideo.url,
  )
  assert.equal(
    routing.attachmentReferenceForGeneration([attachmentImage, attachmentVideo], 'image').url,
    attachmentImage.url,
  )

  const nextHtml = '<html><body><h1>new</h1></body></html>'
  const patch = `\`\`\`onestep-animation\n${JSON.stringify({ edits: [{ clipId: animation.id, sourceType: 'html', code: nextHtml }] })}\n\`\`\``
  const validPatch = revision.animationEditsForSelection(patch, [animation])
  assert.equal(validPatch.error, undefined)
  assert.equal(validPatch.edits[0].code, nextHtml)
  assert.equal(
    revision.extractAgentAnimationEdits(patch)[0].sourceType,
    'html',
  )
  assert.ok(revision.animationEditsForSelection(patch.replaceAll(animation.id, 'unselected'), [animation]).error)
  assert.ok(revision.animationEditsForSelection('模型误返回 generate_video', [animation]).error)

  setActivePinia(createPinia())
  const {
    useEditProjectStore,
    projectDuration,
    motionIdFromRenderUrl,
    motionEntryUrl,
    restoreLiveMotionClip,
  } = await server.ssrLoadModule('/src/stores/editProjectStore.ts')
  // 旧版渲染把动效片段替换成 MP4：加载时必须恢复 live 工程，避免空白旧产物占住轨道。
  const renderedUrl = '/generated/motion_6752d6053e33458f-1795759896026.mp4'
  assert.equal(motionIdFromRenderUrl(renderedUrl), 'motion_6752d6053e33458f')
  const restoredClip = restoreLiveMotionClip({
    id: 'restored', kind: 'video', name: 'S02', start: 5, duration: 5, url: renderedUrl,
  })
  assert.equal(restoredClip.kind, 'motion')
  assert.equal(restoredClip.motionId, 'motion_6752d6053e33458f')
  assert.equal(restoredClip.url, motionEntryUrl('motion_6752d6053e33458f'))
  const userVideo = restoreLiveMotionClip({
    id: 'user-video', kind: 'video', name: '用户替换视频', start: 0, duration: 4,
    url: 'https://video.local/original.mp4', motionId: 'motion_keep',
  })
  assert.equal(userVideo.kind, 'video', '用户主动替换的普通视频不得被改回动效工程')
  assert.equal(userVideo.url, 'https://video.local/original.mp4')
  const store = useEditProjectStore()
  const project = store.createProject('片段回写测试')
  const imageClip = store.appendAsset(project.id, {
    name: '图片', kind: 'image', url: image.url, source: 'library',
  }, { at: 3, duration: 6 })
  const videoClip = store.appendAsset(project.id, {
    name: '视频', kind: 'video', url: video.url, duration: 6, source: 'library',
  }, { at: 12, duration: 6 })
  const untouched = store.appendAsset(project.id, {
    name: '未选择', kind: 'image', url: 'https://img.local/untouched.png', source: 'library',
  }, { at: 30, duration: 4 })
  assert.ok(imageClip && videoClip && untouched)
  const initial = {
    image: { start: imageClip.start, duration: imageClip.duration, trimStart: imageClip.trimStart, opacity: imageClip.opacity },
    video: { start: videoClip.start, duration: videoClip.duration, trimStart: videoClip.trimStart },
  }
  const mediaRevision = project.revision || 0
  const mediaResult = store.replaceClipAssets(project.id, [
    {
      clipId: imageClip.id,
      expectedUrl: image.url,
      input: { kind: 'image', url: 'https://img.local/edited.png' },
    },
    {
      clipId: videoClip.id,
      expectedUrl: video.url,
      input: { kind: 'video', url: 'https://video.local/edited.mp4', duration: 6 },
    },
  ], mediaRevision)
  assert.equal(mediaResult.status, 'applied')
  assert.equal(imageClip.url, 'https://img.local/edited.png')
  assert.equal(videoClip.url, 'https://video.local/edited.mp4')
  assert.deepEqual(
    { start: imageClip.start, duration: imageClip.duration, trimStart: imageClip.trimStart, opacity: imageClip.opacity },
    initial.image,
  )
  assert.deepEqual(
    { start: videoClip.start, duration: videoClip.duration, trimStart: videoClip.trimStart },
    initial.video,
  )
  assert.equal(untouched.url, 'https://img.local/untouched.png')
  assert.equal(project.revision, mediaRevision + 1)
  assert.equal(store.undo(project.id), true)
  const restoredImage = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === imageClip.id)
  const restoredVideo = project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === videoClip.id)
  assert.equal(restoredImage.url, image.url)
  assert.equal(restoredVideo.url, video.url)

  const staleRevision = project.revision || 0
  store.updateClip(project.id, untouched.id, { name: '用户已改动' })
  const stale = store.replaceClipAssets(project.id, [{
    clipId: imageClip.id,
    expectedUrl: image.url,
    input: { kind: 'image', url: 'https://img.local/should-not-write.png' },
  }], staleRevision)
  assert.equal(stale.status, 'stale')
  assert.equal(restoredImage.url, image.url)

  const animationClip = store.appendAsset(project.id, {
    name: '动画', kind: 'animation', url: animation.url, code: animation.code,
    codeLanguage: 'html', duration: 5, source: 'upload',
  }, { at: 40, duration: 5 })
  assert.ok(animationClip)
  const animationStart = animationClip.start
  const animationRevision = project.revision || 0
  const animationResult = store.replaceAnimationSources(project.id, [{
    clipId: animationClip.id,
    code: nextHtml,
    codeLanguage: 'html',
    expectedUrl: animation.url,
    expectedCode: animation.code,
  }], animationRevision)
  assert.equal(animationResult.status, 'applied')
  assert.equal(animationClip.code, nextHtml)
  assert.equal(animationClip.start, animationStart)
  assert.equal(animationClip.duration, 5)
  assert.equal(project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === untouched.id)?.name, '用户已改动')
  assert.equal(store.undo(project.id), true)
  assert.equal(project.tracks.flatMap((track) => track.clips).find((clip) => clip.id === animationClip.id)?.code, animation.code)

  // OpenMotion 封面只用于模板浏览：任何入口入轨都不能变成 motion poster，渲染替换后也不能残留。
  const motionProject = store.createProject('OpenMotion 封面隔离测试')
  const motionClip = store.appendAsset(motionProject.id, {
    name: '模板动效', kind: 'motion', url: '/local/motion/view/mock/index.html', motionId: 'mock',
    thumbnail: '/local/motion/asset?url=template-cover.jpg', source: 'library',
  }, { at: 0, duration: 5 })
  assert.ok(motionClip)
  assert.equal(motionClip.thumbnail, undefined)
  assert.equal(motionProject.assets.find((asset) => asset.id === motionClip.assetId)?.thumbnail, undefined)
  const ordinaryVideo = store.appendAsset(motionProject.id, {
    name: '合法视频封面', kind: 'video', url: 'https://video.local/poster.mp4',
    thumbnail: 'https://video.local/poster.jpg', source: 'library',
  }, { at: 6, duration: 4 })
  assert.equal(ordinaryVideo.thumbnail, 'https://video.local/poster.jpg')
  motionClip.thumbnail = '/local/motion/asset?url=legacy-cover.jpg'
  assert.equal(store.replaceMotionClipWithVideo(motionProject.id, motionClip.id, { url: '/generated/mock.mp4', duration: 5 }), true)
  assert.equal(motionClip.kind, 'video')
  assert.equal(motionClip.thumbnail, undefined)
  const studioPreviewSource = readFileSync(new URL('../src/components/edit/StudioPreview.vue', import.meta.url), 'utf8')
  const composerSource = readFileSync(new URL('../src/components/agent/AgentComposer.vue', import.meta.url), 'utf8')
  const studioChatSource = readFileSync(new URL('../src/components/edit/StudioChat.vue', import.meta.url), 'utf8')
  assert.match(composerSource, /if \(!accepted\) return/, '未受理时不得清空 Composer 草稿')
  assert.doesNotMatch(composerSource, /emit\('send', payload\)\s*text\.value = ''/, '发送事件后不得无条件清空')
  assert.match(studioChatSource, /\.then\(\(accepted\) => \{[\s\S]*?acknowledge\(accepted\)[\s\S]*?if \(!accepted\) return[\s\S]*?emit\('consume-pending'\)/, '待发送批次只能在 store 受理后消费')
  assert.match(studioChatSource, /onAccepted: \(\) => acknowledge\(true\)/, 'store 受理后必须立刻清空输入框，不等整轮任务结束')
  assert.match(studioChatSource, /onMounted\(scrollToLatest\)/, '重新进入项目必须直接停在最新消息')
  assert.match(studioChatSource, /watch\(\(\) => props\.conversationId, scrollToLatest\)/, '切换会话也要定位到最新消息')
  const motionPlayer = studioPreviewSource.match(/<hyperframes-player[\s\S]*?\/>/)?.[0] || ''
  assert.ok(motionPlayer, '主画面必须保留 HyperFrames Player')
  assert.ok(!motionPlayer.includes(':poster='), '所有 motion 模板的主画面都不得绑定封面 poster')
  assert.equal((studioPreviewSource.match(/@seeked="syncMedia"/g) || []).length, 2, '视频与音频在异步 seek 完成后都必须按最新播放头再定位')
  assert.match(studioPreviewSource, /@timeupdate="syncMotion\(item\.clip\)"/, 'HyperFrames 异步 state 回写后也必须按最新播放头校正')
  assert.match(studioPreviewSource, /Math\.abs\(el\.currentTime - target\) > 0\.24 && !el\.seeking/)
  assert.match(studioPreviewSource, /\$\{track\.id\}-\$\{clip\.id\}-v\$\{sourceVersion\}/, 'motion 写回必须重建主 Player，而非只刷新检查器')
  assert.match(studioPreviewSource, /播放头正好停在片段末尾时继续显示最后一帧/, '片尾（工程总长）必须保留最后一帧，不能变黑屏')
  assert.match(studioPreviewSource, /clip\.duration - frame/, 'Player 在精确 duration 会渲染空白，定位需回退一帧')

  // 主画面元素定位、框选去祖先、多元素上下文与 iframe 坐标换算。
  const {
    motionElementKey,
    motionElementSelector,
    collapseMotionAncestors,
    snapshotMotionElement,
  } = await server.ssrLoadModule('/src/features/edit/motionElements.ts')
  const fakeElement = (tagName, options = {}) => ({
    tagName,
    id: options.id || '',
    parentElement: options.parent || null,
    children: options.children || [],
    textContent: options.text || '',
    getAttribute: (name) => name === 'data-hf-id' ? options.hfId || null : name === 'src' ? options.src || null : null,
    getBoundingClientRect: () => options.rect || { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 },
    contains(other) {
      return this.children.includes(other) || this.children.some((child) => child.contains(other))
    },
  })
  const body = fakeElement('BODY')
  const section = fakeElement('SECTION', { parent: body })
  const title = fakeElement('H1', { parent: section, hfId: 'hero title', text: '  主标题  ', rect: { left: 20, top: 30, width: 200, height: 50, right: 220, bottom: 80 } })
  const sibling = fakeElement('H1', { parent: section })
  section.children = [title, sibling]
  body.children = [section]
  assert.equal(motionElementSelector(title), '[data-hf-id="hero\\ title"]')
  assert.equal(motionElementSelector(sibling), 'section:nth-of-type(1) > h1:nth-of-type(2)')
  assert.deepEqual(collapseMotionAncestors([section, title, sibling]), [title, sibling])
  assert.equal(motionElementKey({ selector: '#x', hfId: 'hero' }), 'hf:hero')
  const snapshot = snapshotMotionElement(
    title,
    { left: 100, top: 50, width: 640, height: 360 },
    { left: 20, top: 10, width: 640, height: 360 },
    1.25,
    { width: 1280, height: 720 },
  )
  assert.deepEqual(snapshot.boundingBox, { x: 90, y: 55, width: 100, height: 25 })
  assert.equal(snapshot.textContent, '主标题')
  assert.equal(snapshot.role, '文字')
  assert.equal(snapshot.region, '左上方')
  assert.equal(snapshot.sectionLabel, '当前画面')
  const { describeClipContext } = await server.ssrLoadModule('/src/features/agent/clipContext.ts')
  const titleElement = {
    ...snapshot,
    sourceFile: 'index.html',
    sectionId: 's02',
    sectionLabel: 'S02 · 产品演示',
    sectionSelector: 'section#s02.clip',
    moduleLabel: '文案区',
    moduleSelector: 'div.copy',
    modulePath: 'div.copy',
    parentPath: 'div.copy',
    region: '画面中央',
    role: '文字',
  }
  const logoElement = {
    selector: '#logo', id: 'logo', label: 'Logo', tagName: 'img', src: 'assets/logo.svg',
    sourceFile: 'index.html', selectedAtMotionTime: 1.25,
    boundingBox: { x: 1, y: 2, width: 3, height: 4 },
    sectionId: 's02', sectionLabel: 'S02 · 产品演示', sectionSelector: 'section#s02.clip',
    moduleLabel: 'header.brand', moduleSelector: 'header.brand', modulePath: 'header.brand',
    parentPath: 'header.brand', region: '左上方', role: 'Logo',
  }
  const motionContext = describeClipContext([{
    id: 'motion-clip', name: '品牌动画', kind: 'motion', trackId: 'track', trackName: '轨道 1', trackKind: 'video',
    start: 0, duration: 4, url: '/local/motion/view/m1/index.html', motionId: 'm1',
    motionElements: [titleElement, logoElement],
    motionElementEdits: [
      { note: '主标题改成「全天候持续评测」', elements: [titleElement] },
      { note: 'Logo 放大 10%，保持原色', elements: [logoElement] },
    ],
  }])
  assert.match(motionContext, /主画面选中 2 个元素/)
  assert.match(motionContext, /选中元素 1：/)
  assert.match(motionContext, /选中元素 2：Logo/)
  assert.match(motionContext, /assets\/logo\.svg/)
  assert.match(motionContext, /所属镜头：S02 · 产品演示/)
  assert.match(motionContext, /所属模块：文案区/)
  assert.match(motionContext, /所属模块：header\.brand/)
  assert.match(motionContext, /画面位置：画面中央/)
  assert.match(motionContext, /本轮要求：主标题改成「全天候持续评测」/)
  assert.match(motionContext, /本轮要求：Logo 放大 10%，保持原色/)
  assert.match(motionContext, /禁止全局替换/)
  assert.ok(
    motionContext.indexOf('本轮要求：主标题改成') < motionContext.indexOf('本轮要求：Logo 放大 10%'),
    '元素意见必须按各自元素顺序绑定，不能串到另一个元素上',
  )

  // 预览框直接操作：选中后可以删除 / 改字 / 拖动，写回只替换目标元素那一段源码。
  assert.match(studioPreviewSource, /emit\('edit-motion-element'/, '预览框必须把元素操作交给宿主写回')
  assert.match(studioPreviewSource, /确认删除/, '删除必须是两步确认，避免误点')
  assert.match(studioPreviewSource, /beginTextEdit/, '选中的文字元素要能直接改字')
  assert.match(studioPreviewSource, /action: 'move'/, '拖动画框要按位移写回源码')
  const editStudioSource = readFileSync(new URL('../src/views/EditStudio.vue', import.meta.url), 'utf8')
  assert.match(editStudioSource, /@edit-motion-element="handleMotionElementEdit"/)
  assert.match(editStudioSource, /removeMotionElement\(/, '删除必须按元素源码位置做最小替换')
  assert.doesNotMatch(editStudioSource, /本轮只改这个元素/, '选择元素时不再提示“本轮只改这个元素”')

  const {
    locateMotionElement,
    removeMotionElement,
    renameMotionElementText,
    nudgeMotionElement,
  } = await server.ssrLoadModule('/src/features/edit/motionSourceEdit.ts')
  const editableSource = [
    '<!doctype html>',
    '<html><body>',
    '  <section id="s02" class="clip">',
    '    <div class="copy">',
    '      <h1 data-hf-id="hero title">全天候持续评测</h1>',
    '      <p class="sub">同名文案</p><p class="sub">同名文案</p>',
    '    </div>',
    '    <img id="logo" src="assets/logo.svg">',
    '  </section>',
    '</body></html>',
  ].join('\n')
  const located = locateMotionElement(editableSource, { hfId: 'hero title', tagName: 'h1' })
  assert.ok(located, '按 data-hf-id 必须能定位元素')
  assert.equal(located.line, 5)
  assert.match(located.snippet, /全天候持续评测/)
  const removed = removeMotionElement(editableSource, located)
  assert.doesNotMatch(removed, /全天候持续评测/, '删除只移除目标元素')
  assert.match(removed, /id="logo"/, '删除不能误伤其他元素')
  assert.match(removed, /section id="s02"/, '删除不能破坏镜头结构')
  const renamed = renameMotionElementText(editableSource, located, '全天候持续评测', '全天候实时评测')
  assert.match(renamed, /全天候实时评测/)
  assert.doesNotMatch(renamed, /全天候持续评测/)
  assert.throws(
    () => renameMotionElementText(editableSource, located, '同名文案', '新文案'),
    /不唯一/,
    '元素内文字不唯一时必须拒绝替换',
  )
  const moved = nudgeMotionElement(editableSource, located, 12, -8)
  assert.match(moved, /style="translate: 12px -8px;"/)
  const movedAgain = nudgeMotionElement(moved, locateMotionElement(moved, { hfId: 'hero title' }), 3, 4)
  assert.match(movedAgain, /translate: 15px -4px/, '连续拖动要累加而不是覆盖')
  assert.match(movedAgain, /data-hf-id="hero title"/, '微调位置不能丢属性')

  // 没有 id / data-hf-id 的元素只能靠 selector 链定位；必须逐级下钻，
  // 不能把同名元素的改动写到第一个同标签元素（例如 #root）上。
  const chainSource = [
    '<!doctype html>',
    '<html><body>',
    '<div id="root">',
    '  <div id="scene">',
    '    <div class="first"></div>',
    '    <div class="notes">',
    '      <div class="note-line">第一行</div>',
    '      <div class="note-line">第二行</div>',
    '    </div>',
    '  </div>',
    '</div>',
    '</body></html>',
  ].join('\n')
  const chainSelector = 'div:nth-of-type(1) > div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2)'
  const chainLocated = locateMotionElement(chainSource, { selector: chainSelector, tagName: 'div' })
  assert.ok(chainLocated, 'selector 链必须能定位无 id 元素')
  assert.match(chainLocated.snippet, /第二行/)
  assert.doesNotMatch(chainLocated.snippet, /第一行/, '不能命中同级的第一个同名元素')
  const chainMoved = nudgeMotionElement(chainSource, chainLocated, 9, 6)
  assert.match(chainMoved, /<div class="note-line" style="translate: 9px 6px;">第二行<\/div>/)
  assert.doesNotMatch(chainMoved, /id="root"[^>]*translate/, '位移不能落到外层容器上')

  // 模板页往返只合并提示词；文字、附件和上传中的计数按会话/项目隔离。
  const { useComposerDraftStore } = await server.ssrLoadModule('/src/stores/composerDraftStore.ts')
  const { mergeComposerPrompt } = await server.ssrLoadModule('/src/features/template/navigation.ts')
  const drafts = useComposerDraftStore()
  drafts.stateOf('chat:a').text = '保留我的原始需求'
  drafts.stateOf('chat:a').attachments = [attachmentImage]
  drafts.stateOf('chat:a').pendingCount = 1
  drafts.stateOf('edit:b').text = '另一个项目'
  assert.equal(drafts.stateOf('edit:b').attachments.length, 0)
  assert.equal(mergeComposerPrompt('模板说明\n我的要求：', drafts.stateOf('chat:a').text), '模板说明\n我的要求：\n保留我的原始需求')
  assert.match(mergeComposerPrompt('模板说明', '原始需求'), /模板说明\n\n我的原需求：\n原始需求/)
  assert.deepEqual(drafts.stateOf('chat:a').attachments[0], attachmentImage)
  assert.equal(drafts.stateOf('chat:a').pendingCount, 1)
  drafts.clear('chat:a')
  assert.equal(drafts.stateOf('chat:a').text, '')
  assert.equal(drafts.stateOf('chat:a').attachments.length, 0)
  assert.equal(drafts.stateOf('edit:b').text, '另一个项目')

  const { clipOpacityAt, clipVolumeAt } = await server.ssrLoadModule('/src/features/edit/keyframes.ts')
  const studio = store.createProject('字幕关键帧与版本测试')
  const curveClip = store.appendAsset(studio.id, {
    name: '曲线图片', kind: 'image', url: 'https://img.local/curve.png', source: 'library',
  }, { at: 0, duration: 4 })
  assert.ok(curveClip)
  const keyframes = [
    { id: 'a', time: 0, value: 0, easing: 'linear' },
    { id: 'b', time: 2, value: 1, easing: 'ease-in-out' },
    { id: 'c', time: 4, value: 0.5, easing: 'linear' },
  ]
  store.updateClipKeyframes(studio.id, curveClip.id, 'opacity', keyframes)
  store.updateClipKeyframes(studio.id, curveClip.id, 'volume', keyframes)
  assert.equal(clipOpacityAt(curveClip, 1), 0.5)
  assert.equal(clipVolumeAt(curveClip, 3), 0.75)
  assert.equal(clipOpacityAt(curveClip, -1), 0)
  assert.equal(clipOpacityAt(curveClip, 5), 0.5)
  const cue = store.addCaption(studio.id, { text: '第一句字幕', start: 6, duration: 2 })
  assert.ok(cue)
  assert.equal(projectDuration(studio), 8)
  const saved = store.saveVersion(studio.id, '修改前')
  assert.ok(saved)
  store.updateCaption(studio.id, cue.id, { text: '改后的字幕', start: 8 })
  store.updateClip(studio.id, curveClip.id, { start: 3, opacity: 0.2 })
  assert.equal(projectDuration(studio), 10)
  assert.equal(store.restoreVersion(studio.id, saved.id), true)
  const restoredCurve = studio.tracks.flatMap((track) => track.clips).find((clip) => clip.id === curveClip.id)
  assert.equal(restoredCurve.start, 0)
  assert.equal(restoredCurve.opacityKeyframes.length, 3)
  assert.equal(studio.captions[0].text, '第一句字幕')
  assert.equal(studio.captions[0].start, 6)
  assert.equal(studio.versions.length, 1)
  assert.equal(store.undo(studio.id), true)
  assert.equal(studio.captions[0].text, '改后的字幕')

  const secondCurve = store.appendAsset(studio.id, {
    name: '跨轨图片', kind: 'image', url: 'https://img.local/track.png', source: 'library',
  }, { at: 3, duration: 2 })
  assert.ok(secondCurve)
  const sourceTrack = studio.tracks.find((track) => track.clips.some((clip) => clip.id === secondCurve.id))
  const targetTrack = studio.tracks.find((track) => track.clips.some((clip) => clip.id === curveClip.id))
  assert.ok(sourceTrack && targetTrack && sourceTrack.id !== targetTrack.id)
  assert.equal(store.moveClip(studio.id, secondCurve.id, 12, targetTrack.id), true)
  assert.ok(targetTrack.clips.some((clip) => clip.id === secondCurve.id))
  assert.ok(!studio.tracks.some((track) => track.id === sourceTrack.id))
  assert.equal(store.undo(studio.id), true)
  assert.ok(studio.tracks.some((track) => track.id === sourceTrack.id))

  const { verifyExport } = await server.ssrLoadModule('/src/features/edit/exportVerification.ts')
  const checkProject = store.createProject('导出校验测试')
  const checkClip = store.appendAsset(checkProject.id, {
    name: '校验视频', kind: 'video', url: video.url, source: 'library',
  }, { at: 0, duration: 4 })
  assert.ok(checkClip)
  assert.equal(projectDuration(checkProject), 5)
  assert.deepEqual(verifyExport(checkProject, { width: 1280, height: 720, duration: 5, hasAudio: false, bytes: 10240 }, { width: 1280, height: 720, duration: 5, hasAudio: true }), [])
  const withCaption = store.addCaption(checkProject.id, { text: '校验字幕', start: 3, duration: 2.5 })
  assert.ok(withCaption)
  assert.equal(projectDuration(checkProject), 5.5)
  const drift = verifyExport(checkProject, { width: 1280, height: 720, duration: 5.5, hasAudio: false, bytes: 10240 }, { width: 1280, height: 720, duration: 4, hasAudio: false })
  assert.ok(drift.some((issue) => issue.code === 'duration-drift'))
  assert.ok(drift.some((issue) => issue.code === 'audio-missing'))

  const { GIF_FACTORY_CATEGORIES, GIF_FACTORY_TEMPLATES } = await server.ssrLoadModule('/src/features/template/gifFactory.ts')
  const { BUILTIN_TEMPLATES } = await server.ssrLoadModule('/src/features/template/builtin.ts')
  assert.equal(GIF_FACTORY_CATEGORIES.length, 9)
  assert.equal(GIF_FACTORY_TEMPLATES.length, 21)
  assert.equal(new Set(GIF_FACTORY_TEMPLATES.map((item) => item.id)).size, 21)
  assert.equal(BUILTIN_TEMPLATES.filter((item) => item.id.startsWith('gf-')).length, 21)
  assert.ok(BUILTIN_TEMPLATES.some((item) => item.id === 'ws-explainer'))
  for (const template of GIF_FACTORY_TEMPLATES) {
    assert.match(template.guide, /## 素材输入/)
    assert.match(template.guide, /GIF 工厂/)
    assert.match(template.guide, /用户附件始终是内容主体/)
    assert.ok(template.poster.endsWith('.jpg'))
    assert.ok(existsSync(new URL(`../public${template.poster}`, import.meta.url)))
    if (template.animatedPreview) {
      assert.ok(template.animatedPreview.endsWith('.gif'))
      assert.ok(existsSync(new URL(`../public${template.animatedPreview}`, import.meta.url)))
    }
    if (template.previewKind === 'schematic') assert.match(template.guide, /中性方法示意/)
  }

  const { useTemplateStore } = await server.ssrLoadModule('/src/stores/templateStore.ts')
  const { collectAttachmentImages, describeTemplates } = await server.ssrLoadModule('/src/features/agent/attachments.ts')
  const templateStore = useTemplateStore()
  templateStore.clearApplied()
  const pixelTemplate = GIF_FACTORY_TEMPLATES.find((item) => item.id === 'gf-pixel-light')
  templateStore.applyBuiltin(pixelTemplate)
  templateStore.applyBuiltin(pixelTemplate)
  assert.equal(templateStore.applied.length, 1)
  assert.deepEqual(templateStore.applied[0].images, [`${pixelTemplate.poster}?v=4`])
  assert.ok(!templateStore.applied[0].images[0].endsWith('.gif?v=4'))
  const referenceImages = collectAttachmentImages([attachmentImage], templateStore.applied)
  assert.equal(referenceImages[0], attachmentImage.url)
  assert.equal(referenceImages[1], `${pixelTemplate.poster}?v=4`)
  assert.match(describeTemplates(templateStore.applied), /## 素材输入/)
  templateStore.applyBuiltin(GIF_FACTORY_TEMPLATES.find((item) => item.id === 'gf-lenticular'))
  assert.equal(templateStore.applied.length, 2)
  assert.match(templateStore.applied[1].guide, /不包含原仓库的第三方角色/)
  templateStore.clearApplied()

  const { BUILTIN_DISTILLED_SKILLS } = await server.ssrLoadModule('/src/features/skill/library/builtin.ts')
  const { MAX_ACTIVE_SKILLS } = await server.ssrLoadModule('/src/stores/skillStore.ts')
  const gifSkills = BUILTIN_DISTILLED_SKILLS.filter((skill) => skill.id.startsWith('gif-'))
  assert.equal(gifSkills.length, 6)
  assert.equal(MAX_ACTIVE_SKILLS, 3)
  for (const skill of gifSkills) {
    assert.match(skill.content, /# Stepframe 接入说明/)
    assert.match(skill.content, /不自动调用|不得声称自动调用/)
    assert.match(skill.origin, /WoYun520\/gif-factory/)
    assert.match(skill.license, /素材|字体|外部/)
  }

  console.log('✓ 对话路由、固定目标回写、GIF 工厂模板/预览/Skill 与原素材优先级测试通过')
} finally {
  await server.close()
}
