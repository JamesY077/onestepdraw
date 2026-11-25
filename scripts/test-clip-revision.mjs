import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
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
      imageReference,
      '16:9',
      'minimax-h3',
    )
    assert.deepEqual(params, {
      prompt: '一只橘猫趴在窗台上晒太阳',
      model,
      size: '2720x1536',
      response_format: 'url',
    })
  }
  const portraitParams = await buildImageParams(
    '竖版海报', 'MiniMax-H3-Image-Highspeed', null, '9:16', 'minimax-h3',
  )
  assert.equal(portraitParams.size, '1536x2720')

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
  const { useEditProjectStore } = await server.ssrLoadModule('/src/stores/editProjectStore.ts')
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
