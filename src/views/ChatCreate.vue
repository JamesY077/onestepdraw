<template>
  <div class="video-page" :style="{ height: appHeight, '--app-height': appHeight, '--studio-accent': 'var(--sf-ink)' }">
    <StudioIsland v-show="!paramsOpen" />
    <div class="video-shell">
      <StudioHeader
        kicker="Video Studio"
        title="视频生成"
        subtitle="写好一句镜头描述，选好时长与比例，一次生成一组可以横向比较的视频"
        accent="var(--sf-ink)"
      >
        <template #actions>
          <button class="header-action" type="button" @click="openHistory">
            历史
            <span v-if="videoBatches.length" class="header-action-count">{{ videoBatches.length }}</span>
          </button>
        </template>
      </StudioHeader>

      <div class="video-body">
        <section class="workbench">
          <!-- 结果画廊 -->
          <div class="gallery-area" :class="{ 'has-result': !!currentVideoBatch }">
            <div v-if="!videoBatches.length" class="gallery-empty">
              <span class="empty-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2.6" y="5.4" width="12.6" height="13.2" rx="3" />
                  <path d="m15.2 10.6 4.9-3a.8.8 0 0 1 1.2.7v7.4a.8.8 0 0 1-1.2.7l-4.9-3" />
                  <path d="M9 10v4.4L12.4 12z" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <h2>写好一句镜头描述，出第一条视频。</h2>
              <p>说清主体、动作、运镜、节奏与氛围。生成后可以在这里播放、比较、下载或重生成。</p>
              <div class="starters">
                <button
                  v-for="item in quickStarts"
                  :key="item.title"
                  class="starter"
                  type="button"
                  @click="applyQuickPrompt(item.prompt)"
                >
                  <span class="starter-title">{{ item.title }}</span>
                  <span class="starter-desc">{{ item.desc }}</span>
                </button>
              </div>
            </div>

            <template v-else-if="currentVideoBatch">
              <header class="batch-bar">
                <div class="batch-copy">
                  <p class="batch-prompt">{{ currentVideoBatch.prompt || '视频生成' }}</p>
                  <div class="batch-meta">
                    <span>{{ currentVideoBatch.model || selectedModelLabel }}</span>
                    <span v-if="currentVideoBatch.aspectRatio">{{ currentVideoBatch.aspectRatio }}</span>
                    <span v-if="currentVideoBatch.duration">{{ currentVideoBatch.duration }}s</span>
                    <span v-if="currentVideoBatch.results.length">{{ currentVideoBatch.results.length }} 条</span>
                    <span>{{ formatTime(currentVideoBatch.createdAt) }}</span>
                  </div>
                </div>
                <div class="batch-actions">
                  <button class="ghost-pill" type="button" :disabled="activeSessionGenerating" @click="regenerateBatch(currentVideoBatch)">
                    重生成
                  </button>
                  <button class="ghost-pill" type="button" @click="reusePrompt(currentVideoBatch)">
                    用这段提示词
                  </button>
                </div>
              </header>

              <div v-if="currentVideoBatch.partialError" class="batch-warning">
                {{ currentVideoBatch.partialError }}
              </div>

              <div v-if="currentVideoBatch.status === 'failed'" class="batch-error">
                <p>{{ currentVideoBatch.error || '这一轮生成失败了。' }}</p>
                <button class="ghost-pill" type="button" :disabled="activeSessionGenerating" @click="regenerateBatch(currentVideoBatch)">
                  再试一次
                </button>
              </div>

              <div
                class="video-grid"
                :class="{ 'is-single': gridColumns === 1 }"
                :style="{ '--cols': gridColumns }"
              >
                <figure
                  v-for="(result, index) in currentVideoBatch.results"
                  :key="result.url"
                  class="video-tile"
                  @click="openVideoPreview(index)"
                >
                  <video
                    :src="result.url"
                    :poster="result.thumbnail || undefined"
                    preload="metadata"
                    muted
                    playsinline
                  />
                  <span class="tile-index">{{ index + 1 }}</span>
                  <span class="tile-play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 6.4v11.2l9.2-5.6z" /></svg>
                  </span>
                  <figcaption class="tile-overlay">
                    <div class="tile-tools">
                      <button class="tile-btn" type="button" @click.stop="openVideoPreview(index)">播放</button>
                      <button class="tile-btn" type="button" @click.stop="downloadVideoResult(result)">下载</button>
                      <AddToProjectButton
                        :asset="videoInboxAsset(result, index)"
                        compact
                      />
                      <button class="tile-btn" type="button" @click.stop="regenerateBatch(currentVideoBatch)">重生成</button>
                    </div>
                    <span class="tile-size">{{ videoMetaLabel(result) }}</span>
                  </figcaption>
                </figure>

                <div v-for="n in pendingCount" :key="`pending-${n}`" class="video-tile tile-pending">
                  <span class="tile-shimmer" aria-hidden="true" />
                  <span class="tile-pending-text">
                    {{ currentVideoBatch.progress ? `生成中 ${currentVideoBatch.progress}%` : '排队中' }}
                  </span>
                </div>
              </div>
            </template>
          </div>

          <!-- 底部提示词条 -->
          <div class="prompt-card">
            <div v-if="referencedMentions.length" class="referenced-mentions" aria-label="已引用素材">
              <span class="referenced-mentions-label">已引用</span>
              <span
                v-for="item in referencedMentions"
                :key="item.url"
                class="referenced-chip"
                :class="`referenced-chip-${mentionKind(item)}`"
              >
                <span class="referenced-chip-dot" aria-hidden="true" />
                {{ item.refLabel }}
              </span>
            </div>

            <div class="prompt-field">
              <div
                v-if="showMentionMenu && mentionableAssets.length"
                ref="mentionMenuRef"
                class="mention-menu"
                :style="mentionMenuStyle"
                role="listbox"
                aria-label="选择参考素材"
              >
                <button
                  v-for="(item, index) in mentionableAssets"
                  :key="item.url"
                  type="button"
                  class="mention-item"
                  :class="{ active: index === activeMentionIndex }"
                  @mousedown.prevent="insertMentionReference(item)"
                  @mouseenter="activeMentionIndex = index"
                >
                  <span class="mention-item-tag">{{ item.refLabel }}</span>
                  <span class="mention-item-name">{{ item.name }}</span>
                </button>
              </div>

              <textarea
                ref="promptInputRef"
                v-model="inputText"
                class="prompt-input"
                :placeholder="inputPlaceholder"
                rows="1"
                @input="handlePromptInput"
                @keyup="handlePromptInput"
                @click="handlePromptInput"
                @keydown="handleComposerKeydown"
              />

              <div class="prompt-buttons">
                <button
                  class="ghost-pill"
                  type="button"
                  :disabled="isPolishing || activeSessionGenerating || !hasPromptPolishModelConfigured"
                  :title="polishButtonTitle"
                  @click="handlePolishPrompt"
                >
                  {{ isPolishing ? '润色中…' : 'AI 润色' }}
                </button>
                <button
                  class="generate-btn"
                  type="button"
                  :disabled="!canSend || activeSessionGenerating"
                  @click="handleSend"
                >
                  <template v-if="activeSessionGenerating">
                    <span class="generate-spinner" aria-hidden="true" />
                    {{ generatingProgress }}%
                  </template>
                  <template v-else>
                    <svg class="generate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 3.6 13.9 9.4 19.7 11.3 13.9 13.2 12 19 10.1 13.2 4.3 11.3 10.1 9.4z" />
                    </svg>
                    <span>生成</span>
                    <span class="generate-kbd">⌘↵</span>
                  </template>
                </button>
              </div>
            </div>

            <div class="prompt-chips">
              <span class="pchip pchip-model">{{ selectedModelLabel }}</span>
              <span class="pchip">{{ activeGenerateModeLabel }}</span>
              <span class="pchip">{{ settingsStore.aspectRatio }}</span>
              <span class="pchip">{{ selectedVideoDurationLabel }}</span>
              <span v-if="showsVideoResolution" class="pchip">{{ formattedVideoResolution }}</span>
              <span class="pchip">{{ settingsStore.batchSize }} 个</span>
              <span v-if="materialSummaryLabel" class="pchip" :class="{ 'pchip-warn': needsMaterialAttention }">
                {{ materialSummaryLabel }}
              </span>
              <button class="pchip pchip-action" type="button" @click="paramsOpen = true">参数</button>
            </div>
          </div>
        </section>

        <!-- 右侧参数栏 -->
        <aside class="param-rail" :class="{ 'is-open': paramsOpen }">
          <div class="rail-head">
            <span class="rail-title">参数</span>
            <button class="rail-close" type="button" aria-label="收起参数" @click="paramsOpen = false">✕</button>
          </div>

          <div class="rail-scroll">
            <section class="rail-card">
              <span class="rail-label">模型</span>
              <ModelSelector
                key="video-model"
                v-model="settingsStore.selectedModel"
                media-type="video"
                compact
                @update:model-value="settingsStore.saveToStorage()"
              />
            </section>

            <section class="rail-card">
              <span class="rail-label">生成方式</span>
              <div class="chip-row">
                <button
                  v-for="option in activeVideoModeOptions"
                  :key="option.value"
                  class="chip"
                  :class="{ active: videoMode === option.value }"
                  type="button"
                  @click="setVideoMode(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </section>

            <section class="rail-card">
              <span class="rail-label">比例</span>
              <div class="ratio-grid">
                <button
                  v-for="option in aspectRatioOptions"
                  :key="option.value"
                  class="ratio-chip"
                  :class="{ active: settingsStore.aspectRatio === option.value }"
                  type="button"
                  :disabled="isFrameRatioLocked || isEditVideoMode || isReferenceVideoRatioLocked"
                  @click="selectAspectRatio(option.value)"
                >
                  <span class="ratio-box" :style="{ width: `${option.boxWidth}px`, height: `${option.boxHeight}px` }" />
                  <span class="ratio-text">{{ option.label }}</span>
                </button>
              </div>
              <p v-if="isFrameRatioLocked" class="rail-hint">图生 / 尾帧 / 首尾帧模式下，视频比例由上传图片决定。</p>
              <p v-if="isEditVideoMode" class="rail-hint">编辑视频模式下，输出比例与时长跟随被编辑的原视频。</p>
              <p v-if="isReferenceVideoRatioLocked" class="rail-hint">带参考视频时，输出比例跟随参考视频。</p>
            </section>

            <section v-if="videoResolutionOptions.length" class="rail-card">
              <span class="rail-label">分辨率</span>
              <div class="chip-row">
                <button
                  v-for="option in videoResolutionOptions"
                  :key="option"
                  class="chip"
                  :class="{ active: settingsStore.videoResolution === option }"
                  type="button"
                  :disabled="videoResolutionOptions.length === 1"
                  @click="selectVideoResolution(option)"
                >
                  {{ formatVideoResolution(option) }}
                </button>
              </div>
              <p v-if="videoResolutionOptions.length === 1" class="rail-hint">
                当前模型固定使用 {{ formatVideoResolution(videoResolutionOptions[0]) }} 输出。
              </p>
            </section>

            <section class="rail-card">
              <span class="rail-label">时长</span>
              <div class="chip-row">
                <button
                  v-for="option in videoDurationOptions"
                  :key="option.value"
                  class="chip"
                  :class="{ active: settingsStore.videoDuration === option.value }"
                  type="button"
                  :disabled="isEditVideoMode"
                  @click="selectVideoDuration(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <p v-if="isEditVideoMode" class="rail-hint">输出时长跟随被编辑的原视频。</p>
            </section>

            <section class="rail-card">
              <span class="rail-label">单轮数量</span>
              <div class="chip-row">
                <button
                  v-for="size in [1, 2, 4, 5]"
                  :key="size"
                  class="chip chip-count"
                  :class="{ active: settingsStore.batchSize === size }"
                  type="button"
                  @click="selectVideoBatchSize(size)"
                >
                  {{ size }}
                </button>
              </div>
              <p class="rail-hint">每个任务独立计时，整体上限 60 分钟。</p>
            </section>

            <section v-if="showCameraGuide" class="rail-card">
              <span class="rail-label">运镜指令</span>
              <CameraMovementGuide compact @insert="insertCameraCommand" />
            </section>

            <section v-if="showReferenceField" class="rail-card rail-card-upload">
              <span class="rail-label">素材</span>

              <template v-if="usesViduLikeVideoMode">

                <div v-if="videoMode === 'image2video' || videoMode === 'endFrame2video'" class="upload-mini-row upload-card-row" :class="{ 'has-file': !!uploadedFile }">
                  <input
                    ref="fileInput"
                    type="file"
                    :accept="IMAGE_FILE_ACCEPT"
                    class="file-input"
                    @change="handleFileChange"
                  />
                  <button class="upload-btn upload-icon-btn" type="button" :aria-label="videoMode === 'endFrame2video' ? '上传尾帧图' : '上传参考图'" @click="fileInput?.click()">
                    +
                  </button>
                  <div class="upload-copy">
                    <span class="upload-label">{{ videoMode === 'endFrame2video' ? '尾帧图' : '参考图' }}</span>
                    <span class="upload-hint">{{ videoMode === 'endFrame2video' ? '作为视频结尾画面（MiniMax-H3），支持 PNG / JPG / WebP 等格式' : '用于图生视频，支持 PNG / JPG / WebP 等格式' }}</span>
                  </div>
                  <img v-if="uploadedFile" class="upload-thumb" :src="uploadedFile.url" alt="已上传素材" />
                  <span v-if="uploadedFile" class="pill-filename">{{ uploadedFile.name }}</span>
                  <button v-if="uploadedFile" class="text-btn" type="button" @click="() => removeUploadedFile()">移除</button>
                </div>

                <div v-else-if="videoMode === 'motionControl2video'" class="motion-control-panel">
                  <p class="motion-control-note">动作控制 <small>用于通过参考图像和参考视频生成视频，使生成视频中的人物动作与参考视频一致。</small></p>
                  <div class="motion-control-options">
                    <label class="motion-control-option">
                      <span class="motion-control-option-label">保留原声</span>
                      <select v-model="motionControlKeepOriginalSound" class="motion-control-select" aria-label="是否保留原声">
                        <option value="yes">保留</option>
                        <option value="no">不保留</option>
                      </select>
                    </label>
                    <label class="motion-control-option">
                      <span class="motion-control-option-label">人物朝向</span>
                      <select v-model="motionControlCharacterOrientation" class="motion-control-select" aria-label="人物朝向">
                        <option value="image">参考图像</option>
                        <option value="video">参考视频</option>
                      </select>
                    </label>
                  </div>
                  <div class="frame-upload-grid">
                    <div class="upload-mini-row upload-card-row frame-upload-card" :class="{ 'has-file': !!motionControlImage }">
                      <input
                        ref="motionControlImageInput"
                        type="file"
                        :accept="IMAGE_FILE_ACCEPT"
                        class="file-input"
                        @change="handleMotionControlFileChange($event, 'image')"
                      />
                      <button class="upload-btn upload-icon-btn" type="button" aria-label="上传动作控制参考图" @click="motionControlImageInput?.click()">
                        +
                      </button>
                      <div class="upload-copy">
                        <span class="upload-label">参考图像</span>
                        <span class="upload-hint">作为生成视频的人物外观参考，支持 PNG / JPG / WebP 等格式</span>
                      </div>
                      <span v-if="motionControlImage" class="pill-filename">{{ motionControlImage.name }}</span>
                      <button v-if="motionControlImage" class="text-btn" type="button" @click="removeMotionControlFile('image')">移除</button>
                    </div>

                    <div class="upload-mini-row upload-card-row frame-upload-card" :class="{ 'has-file': !!motionControlVideo }">
                      <input
                        ref="motionControlVideoInput"
                        type="file"
                        :accept="VIDEO_FILE_ACCEPT"
                        class="file-input"
                        @change="handleMotionControlFileChange($event, 'video')"
                      />
                      <button class="upload-btn upload-icon-btn" type="button" aria-label="上传动作控制参考视频" @click="motionControlVideoInput?.click()">
                        +
                      </button>
                      <div class="upload-copy">
                        <span class="upload-label">参考视频</span>
                        <span class="upload-hint">用于对齐人物动作，支持 MP4 / MOV / WebM 等格式</span>
                      </div>
                      <span v-if="motionControlVideo" class="pill-filename">{{ motionControlVideo.name }}</span>
                      <button v-if="motionControlVideo" class="text-btn" type="button" @click="removeMotionControlFile('video')">移除</button>
                    </div>
                  </div>
                </div>

                <div v-else-if="videoMode === 'startEnd2video'" class="frame-upload-grid">
                  <div class="upload-mini-row upload-card-row frame-upload-card" :class="{ 'has-file': !!viduStartFrame }">
                    <input
                      ref="viduStartInput"
                      type="file"
                      :accept="IMAGE_FILE_ACCEPT"
                      class="file-input"
                      @change="handleViduFrameChange($event, 'start')"
                    />
                    <button class="upload-btn upload-icon-btn" type="button" aria-label="上传首帧" @click="viduStartInput?.click()">
                      +
                    </button>
                    <div class="upload-copy">
                      <span class="upload-label">首帧</span>
                      <span class="upload-hint">视频开始画面，支持 PNG / JPG / WebP 等格式</span>
                    </div>
                    <span v-if="viduStartFrame" class="pill-filename">{{ viduStartFrame.name }}</span>
                    <button v-if="viduStartFrame" class="text-btn" type="button" @click="removeViduFrame('start')">移除</button>
                  </div>

                  <div class="upload-mini-row upload-card-row frame-upload-card" :class="{ 'has-file': !!viduEndFrame }">
                    <input
                      ref="viduEndInput"
                      type="file"
                      :accept="IMAGE_FILE_ACCEPT"
                      class="file-input"
                      @change="handleViduFrameChange($event, 'end')"
                    />
                    <button class="upload-btn upload-icon-btn" type="button" aria-label="上传尾帧" @click="viduEndInput?.click()">
                      +
                    </button>
                    <div class="upload-copy">
                      <span class="upload-label">尾帧（可选）</span>
                      <span class="upload-hint">视频结束画面，支持 PNG / JPG / WebP 等格式</span>

                    </div>
                    <span v-if="viduEndFrame" class="pill-filename">{{ viduEndFrame.name }}</span>
                    <button v-if="viduEndFrame" class="text-btn" type="button" @click="removeViduFrame('end')">移除</button>
                  </div>
                </div>

                <div v-else-if="videoMode === 'referenceImage2video'" class="multimodal-panel">
                  <p class="multimodal-note">
                    参考生视频
                    <small>上传参考图片（多图主体，最多 {{ klingReferenceImageLimit }} 张），模型会参考图中的主体生成视频。上传后可在文本中输入 <b>@</b> 精确指定素材位置，例如「让 @图片1 中的角色走进 @图片2 的场景」。支持常见格式：图片 PNG / JPG / WebP。</small>
                  </p>
                  <div class="multimodal-group">
                    <div class="multimodal-group-head">
                      <span class="multimodal-group-title">参考图片</span>
                      <span class="multimodal-group-count">{{ multimodalImages.length }}/{{ klingReferenceImageLimit }}</span>
                    </div>
                    <div class="multimodal-thumb-row">
                      <div v-for="item in multimodalImages" :key="item.url" class="multimodal-thumb">
                        <img :src="item.url" :alt="item.refLabel" loading="lazy" decoding="async" />
                        <span class="multimodal-thumb-tag">{{ item.refLabel }}</span>
                        <button class="multimodal-thumb-remove" type="button" aria-label="移除" @click="removeMultimodalAsset('image', item)">×</button>
                      </div>
                      <button
                        v-if="multimodalImages.length < klingReferenceImageLimit"
                        class="multimodal-add-btn"
                        type="button"
                        aria-label="添加参考图"
                        @click="multimodalImageInput?.click()"
                      >+</button>
                    </div>
                    <input ref="multimodalImageInput" type="file" :accept="IMAGE_FILE_ACCEPT" multiple class="file-input" @change="handleMultimodalFileChange($event, 'image')" />
                  </div>
                </div>


                <div v-else-if="videoMode === 'subjectReference2video'" class="subject-reference-card" :class="{ 'has-file': !!uploadedFile }">

                  <input
                    ref="fileInput"
                    type="file"
                    :accept="IMAGE_FILE_ACCEPT"
                    class="file-input"
                    @change="handleFileChange"
                  />
                  <button class="subject-upload-btn" type="button" @click="fileInput?.click()">
                    <span class="subject-upload-icon">+</span>
                    上传主体图
                  </button>
                  <div class="subject-reference-copy">
                    <span class="upload-label">主体参考</span>
                    <span class="upload-hint">上传人物主体图片生成 S2V 视频，支持 PNG / JPG / WebP 等格式</span>
                  </div>
                  <img v-if="uploadedFile" class="upload-thumb" :src="uploadedFile.url" alt="已上传素材" />
                  <span v-if="uploadedFile" class="pill-filename">{{ uploadedFile.name }}</span>
                  <button v-if="uploadedFile" class="text-btn" type="button" @click="() => removeUploadedFile()">移除</button>
                </div>


                <div v-else-if="videoMode === 'editVideo'" class="multimodal-panel edit-video-panel">
                  <p class="multimodal-note">
                    编辑视频
                    <small>提供「待编辑视频 + 参考图片 + 提示词」，完成替换主体、对象增删改、局部重绘/修复等编辑；仅需 1 个视频 + 1 张图片。可在文本中输入 <b>@</b> 精确指定素材位置，例如「将 @视频1 礼盒中的香水替换成 @图片1 中的面霜，运镜不变」。支持常见格式：图片 PNG / JPG / WebP，视频 MP4 / MOV / WebM。</small>
                  </p>
                  <div class="frame-upload-grid">
                    <div class="upload-mini-row upload-card-row frame-upload-card" :class="{ 'has-file': !!editVideoFile }">
                      <input
                        ref="editVideoInput"
                        type="file"
                        :accept="VIDEO_FILE_ACCEPT"
                        class="file-input"
                        @change="handleEditFileChange($event, 'video')"
                      />
                      <button class="upload-btn upload-icon-btn" type="button" aria-label="上传待编辑视频" @click="editVideoInput?.click()">
                        +
                      </button>
                      <div class="upload-copy">
                        <span class="upload-label">视频1</span>
                        <span class="upload-hint">请上传需要修改的视频，支持 MP4 / MOV / WebM 等格式</span>
                      </div>
                      <span v-if="editVideoFile" class="pill-filename">{{ editVideoFile.name }}</span>
                      <button v-if="editVideoFile" class="text-btn" type="button" @click="removeEditFile('video')">移除</button>
                    </div>

                    <div class="upload-mini-row upload-card-row frame-upload-card" :class="{ 'has-file': !!editImageFile }">
                      <input
                        ref="editImageInput"
                        type="file"
                        :accept="IMAGE_FILE_ACCEPT"
                        class="file-input"
                        @change="handleEditFileChange($event, 'image')"
                      />
                      <button class="upload-btn upload-icon-btn" type="button" aria-label="上传替换图片" @click="editImageInput?.click()">
                        +
                      </button>
                      <div class="upload-copy">
                        <span class="upload-label">图片1</span>
                        <span class="upload-hint">请上传想要替换成的图片，支持 PNG / JPG / WebP 等格式</span>
                      </div>
                      <span v-if="editImageFile" class="pill-filename">{{ editImageFile.name }}</span>
                      <button v-if="editImageFile" class="text-btn" type="button" @click="removeEditFile('image')">移除</button>
                    </div>
                  </div>
                </div>

                <div v-else-if="isMultimodalReferenceMode" class="multimodal-panel">
                  <p class="multimodal-note">
                    多模态参考
                    <small>可任意组合图片（0~9）、视频（0~3）、音频（0~3）作为参考；不支持「纯音频」或「文本+音频」。上传后可在文本中输入 <b>@</b> 精确指定素材位置。支持常见格式：图片 PNG / JPG / WebP，视频 MP4 / MOV / WebM。</small>
                  </p>


                  <div class="multimodal-groups">

                    <div class="multimodal-group">
                      <div class="multimodal-group-head">
                        <span class="multimodal-group-title">图片</span>
                        <span class="multimodal-group-count">{{ multimodalImages.length }}/{{ MULTIMODAL_LIMITS.image }}</span>
                      </div>
                      <div class="multimodal-thumb-row">
                        <div v-for="item in multimodalImages" :key="item.url" class="multimodal-thumb">
                          <img :src="item.url" :alt="item.refLabel" loading="lazy" decoding="async" />
                          <span class="multimodal-thumb-tag">{{ item.refLabel }}</span>
                          <button class="multimodal-thumb-remove" type="button" aria-label="移除" @click="removeMultimodalAsset('image', item)">×</button>
                        </div>
                        <button
                          v-if="multimodalImages.length < MULTIMODAL_LIMITS.image"
                          class="multimodal-add-btn"
                          type="button"
                          aria-label="添加图片"
                          @click="multimodalImageInput?.click()"
                        >+</button>
                      </div>
                      <input ref="multimodalImageInput" type="file" :accept="IMAGE_FILE_ACCEPT" multiple class="file-input" @change="handleMultimodalFileChange($event, 'image')" />
                    </div>

                    <div class="multimodal-group">
                      <div class="multimodal-group-head">
                        <span class="multimodal-group-title">视频</span>
                        <span class="multimodal-group-count">{{ multimodalVideos.length }}/{{ MULTIMODAL_LIMITS.video }}</span>
                      </div>
                      <div class="multimodal-thumb-row">
                        <div v-for="item in multimodalVideos" :key="item.url" class="multimodal-thumb multimodal-thumb-file">
                          <span class="multimodal-file-icon">🎬</span>
                          <span class="multimodal-thumb-tag">{{ item.refLabel }}</span>
                          <button class="multimodal-thumb-remove" type="button" aria-label="移除" @click="removeMultimodalAsset('video', item)">×</button>
                        </div>
                        <button
                          v-if="multimodalVideos.length < MULTIMODAL_LIMITS.video"
                          class="multimodal-add-btn"
                          type="button"
                          aria-label="添加视频"
                          @click="multimodalVideoInput?.click()"
                        >+</button>
                      </div>
                      <input ref="multimodalVideoInput" type="file" :accept="VIDEO_FILE_ACCEPT" multiple class="file-input" @change="handleMultimodalFileChange($event, 'video')" />
                    </div>

                    <div class="multimodal-group">
                      <div class="multimodal-group-head">
                        <span class="multimodal-group-title">音频</span>
                        <span class="multimodal-group-count">{{ multimodalAudios.length }}/{{ MULTIMODAL_LIMITS.audio }}</span>
                      </div>
                      <div class="multimodal-thumb-row">
                        <div v-for="item in multimodalAudios" :key="item.url" class="multimodal-thumb multimodal-thumb-file">
                          <span class="multimodal-file-icon">🎵</span>
                          <span class="multimodal-thumb-tag">{{ item.refLabel }}</span>
                          <button class="multimodal-thumb-remove" type="button" aria-label="移除" @click="removeMultimodalAsset('audio', item)">×</button>
                        </div>
                        <button
                          v-if="multimodalAudios.length < MULTIMODAL_LIMITS.audio"
                          class="multimodal-add-btn"
                          type="button"
                          aria-label="添加音频"
                          @click="openAudioPicker"
                        >+</button>
                      </div>
                      <input ref="multimodalAudioInput" type="file" accept="audio/*" multiple class="file-input" @change="handleMultimodalFileChange($event, 'audio')" />
                    </div>
                  </div>
                </div>
              </template>

              <div v-else-if="isImageMultiReferenceMode" class="multimodal-panel image-multimodal-panel">
                <p class="multimodal-note">
                  多图参考
                  <small>最多 {{ imageReferenceLimit }} 张。上传后可在文本中输入 <b>@</b> 精确指定素材位置，例如「把 @图片1 的商品放进 @图片2 的场景」。支持 PNG / JPG / WebP 等格式。</small>
                </p>
                <div class="multimodal-groups">
                  <div class="multimodal-group">
                    <div class="multimodal-group-head">
                      <span class="multimodal-group-title">参考图片</span>
                      <span class="multimodal-group-count">{{ multimodalImages.length }}/{{ imageReferenceLimit }}</span>
                    </div>
                    <div class="multimodal-thumb-row">
                      <div v-for="item in multimodalImages" :key="item.url" class="multimodal-thumb">
                        <img :src="item.url" :alt="item.refLabel" loading="lazy" decoding="async" />
                        <span class="multimodal-thumb-tag">{{ item.refLabel }}</span>
                        <button class="multimodal-thumb-remove" type="button" aria-label="移除" @click="removeMultimodalAsset('image', item)">×</button>
                      </div>
                      <button
                        v-if="multimodalImages.length < imageReferenceLimit"
                        class="multimodal-add-btn"
                        type="button"
                        aria-label="添加参考图片"
                        @click="multimodalImageInput?.click()"
                      >+</button>
                    </div>
                    <input ref="multimodalImageInput" type="file" :accept="IMAGE_FILE_ACCEPT" multiple class="file-input" @change="handleMultimodalFileChange($event, 'image')" />
                  </div>
                  <div v-if="canOpenImageEditor" class="image-edit-entry-row">
                    <button
                      class="image-edit-btn"
                      type="button"
                      title="把这张图作为底图，进入图层编辑"
                      @click="openImageEditorFromUpload"
                    >图像编辑</button>
                    <span class="image-edit-entry-hint">以这张参考图作为底图，添加图层后生成新图</span>
                  </div>
                  <p v-else-if="multimodalImages.length > 1" class="image-edit-entry-hint image-edit-entry-note">
                    图像编辑仅支持 1 张参考图，请先移除多余图片。
                  </p>
                </div>
              </div>

              <div
                v-else-if="isImageReferenceMode || isExpandMode"
                class="upload-mini-row upload-card-row"
                :class="{ 'has-file': !!uploadedFile, 'is-expand-upload': isExpandMode }"
              >
                <input
                  ref="fileInput"
                  type="file"
                  :accept="IMAGE_FILE_ACCEPT"
                  class="file-input"
                  @change="handleFileChange"
                />
                <button
                  class="upload-btn upload-icon-btn"
                  type="button"
                  :aria-label="isExpandMode ? '上传扩图原图' : '上传参考图'"
                  @click="fileInput?.click()"
                >
                  +
                </button>
                <div class="upload-copy">
                  <span class="upload-label">{{ isExpandMode ? '原图' : '参考图' }}</span>
                  <span class="upload-hint">
                    {{ isExpandMode ? '上传需要向外扩展的原图，支持 PNG / JPG / WebP 等格式' : '用于图生图，支持 PNG / JPG / WebP 等格式' }}
                  </span>
                </div>
                <img v-if="uploadedFile" class="upload-thumb" :src="uploadedFile.url" alt="已上传素材" />
                <span v-if="uploadedFile" class="pill-filename">{{ uploadedFile.name }}</span>
                <button
                  v-if="uploadedFile && canOpenImageEditor"
                  class="image-edit-btn"
                  type="button"
                  title="把这张图作为底图，进入图层编辑"
                  @click="openImageEditorFromUpload"
                >图像编辑</button>
                <button v-if="uploadedFile" class="text-btn" type="button" @click="() => removeUploadedFile()">移除</button>
              </div>
              <div v-else-if="isUploadEnabled" class="upload-mini-row" :class="{ 'has-file': !!uploadedFile }">
                <input
                  ref="fileInput"
                  type="file"
                  :accept="uploadAccept"
                  class="file-input"
                  @change="handleFileChange"
                />
                <button
                  class="upload-btn upload-icon-btn"
                  type="button"
                  aria-label="上传参考"
                  :title="`支持常见格式：图片 ${IMAGE_FORMAT_HINT}；视频 ${VIDEO_FORMAT_HINT}`"
                  @click="fileInput?.click()"
                >
                  +
                </button>
                <img v-if="uploadedFile?.type === 'image'" class="upload-thumb" :src="uploadedFile.url" alt="已上传素材" />
                <span v-else-if="uploadedFile" class="upload-thumb upload-thumb-file" aria-hidden="true">🎬</span>
                <span v-if="uploadedFile" class="pill-filename">{{ uploadedFile.name }}</span>
                <button v-if="uploadedFile" class="text-btn" type="button" @click="() => removeUploadedFile()">移除</button>
              </div>
              <input
                v-else-if="showReferenceUrlInput"
                v-model.trim="referenceUrl"
                type="url"
                class="reference-input"
                placeholder="粘贴参考图片或视频链接"
              />

            </section>

            <SkillPicker
              v-if="!isExpandMode"
              layout="grid"
              :model-id="skillPreviewModelId"
              :hide-defaults="settingsStore.mediaType === 'video'"
            />
          </div>
        </aside>

        <div v-if="paramsOpen" class="rail-backdrop" @click="paramsOpen = false" />
      </div>
    </div>

    <!-- 历史抽屉 -->
    <Teleport to="body">
      <div v-if="historyOpen" class="history-mask" @click.self="historyOpen = false">
        <aside class="history-panel">
          <header class="history-head">
            <div>
              <span class="history-kicker">History</span>
              <h3>生成历史</h3>
            </div>
            <button class="history-close" type="button" aria-label="关闭历史" @click="historyOpen = false">✕</button>
          </header>

          <p v-if="!videoBatches.length" class="history-empty">还没有生成记录，先写下第一句镜头描述吧。</p>

          <ul v-else class="history-list">
            <li
              v-for="batch in videoBatches"
              :key="batch.id"
              class="history-item"
              :class="{ active: currentVideoBatch?.id === batch.id }"
            >
              <button class="history-item-btn" type="button" @click="selectBatch(batch.id)">
                <span class="history-thumb">
                  <img v-if="batch.results[0]" :src="batch.results[0].thumbnail || batch.results[0].url" alt="" loading="lazy" />
                  <span v-else class="history-thumb-empty">{{ batch.status === 'failed' ? '!' : '…' }}</span>
                </span>
                <span class="history-copy">
                  <span class="history-prompt">{{ batch.prompt || '视频生成' }}</span>
                  <span class="history-meta">
                    {{ formatTime(batch.createdAt) }} · {{ batch.results.length }} 条
                    <template v-if="batch.aspectRatio"> · {{ batch.aspectRatio }}</template>
                  </span>
                </span>
              </button>
            </li>
          </ul>
        </aside>
      </div>
    </Teleport>

    <!-- 视频预览 -->
    <Teleport to="body">
      <div v-if="previewOpen && previewResult" class="video-preview-mask" @click.self="closeVideoPreview">
        <div class="video-preview" role="dialog" aria-modal="true" aria-label="视频预览">
          <header class="video-preview-head">
            <div>
              <span class="video-preview-kicker">Preview</span>
              <h3>视频预览</h3>
            </div>
            <button class="video-preview-close" type="button" aria-label="关闭预览" @click="closeVideoPreview">✕</button>
          </header>
          <video
            :src="previewResult.url"
            :poster="previewResult.thumbnail || undefined"
            controls
            autoplay
            playsinline
          />
          <footer class="video-preview-foot">
            <span>{{ videoMetaLabel(previewResult) }}</span>
            <div class="video-preview-actions">
              <button class="ghost-pill" type="button" @click="downloadVideoResult(previewResult)">下载</button>
              <button class="ghost-pill" type="button" @click="regenerateCurrent(); closeVideoPreview()">重生成</button>
            </div>
          </footer>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="quickExpandResult" class="expand-modal-mask" @click.self="closeQuickExpand">
        <div class="expand-modal" role="dialog" aria-modal="true" aria-labelledby="expand-modal-title">
          <header class="expand-modal-head">
            <div>
              <span class="expand-modal-kicker">OUTPAINTING</span>
              <h3 id="expand-modal-title">扩图</h3>
            </div>
            <button class="expand-modal-close" type="button" aria-label="关闭扩图弹窗" @click="closeQuickExpand">×</button>
          </header>

          <div class="expand-modal-preview">
            <img
              :src="quickExpandResult.url"
              alt="待扩图的原图"
              referrerpolicy="no-referrer"
              loading="lazy"
              decoding="async"
            />
            <span class="expand-modal-source">原图 · {{ quickExpandSourceLabel }}</span>
          </div>

          <p class="expand-modal-copy">
            选择目标比例后立即开始扩图。原图主体、构图、光线与色彩会尽量保持不变，只向画面外围自然延展。
          </p>

          <div class="expand-ratio-grid">
            <button
              v-for="option in ASPECT_RATIO_OPTIONS"
              :key="option.value"
              type="button"
              class="expand-ratio-btn"
              :class="{ 'is-source-ratio': isQuickExpandRatioSame(option.value) }"
              :disabled="isQuickExpandRatioSame(option.value) || activeSessionGenerating"
              @click="confirmQuickExpand(option.value)"
            >
              <span
                class="expand-ratio-box"
                :style="{ width: `${option.boxWidth}px`, height: `${option.boxHeight}px` }"
                aria-hidden="true"
              />
              <span class="expand-ratio-label">{{ option.label }}</span>
              <span class="expand-ratio-size">
                {{ getExpandTargetSize(option.value).width }}×{{ getExpandTargetSize(option.value).height }}
              </span>
              <span v-if="isQuickExpandRatioSame(option.value)" class="expand-ratio-note">原比例</span>
            </button>
          </div>

          <footer class="expand-modal-foot">
            <span class="expand-modal-hint">
              {{ activeSessionGenerating ? '当前正在生成，请稍后再试。' : '点击比例后会直接发送新的扩图任务。' }}
            </span>
            <button type="button" class="expand-modal-cancel" @click="closeQuickExpand">取消</button>
          </footer>
        </div>
      </div>
    </Teleport>

    <AudioLibraryPicker
      :open="audioPickerOpen"
      :items="audioLibraryItems"
      :loading="audioLibraryLoading"
      :error="audioLibraryError"
      :selected-ids="selectedAudioLibraryIds"
      @close="closeAudioPicker"
      @refresh="loadAudioLibrary"
      @upload="chooseLocalAudio"
      @select="addAudioFromLibrary"
    />

    <MossLayerEditor
      v-if="layerEditorState"
      :image-url="layerEditorState.imageUrl"
      :layout="layerEditorState.layout"
      :mode="layerEditorState.mode"
      :model-name="layerEditorState.modelName"
      :generating="activeSessionGenerating"
      @close="layerEditorState = null"
      @regenerate="handleLayerRegenerate"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, computed, watch, onBeforeUnmount } from 'vue'
import { alertDialog } from '@/features/ui/dialog'
import { useRoute } from 'vue-router'
import MossLayerEditor from '@/components/MossLayerEditor.vue'
import ModelSelector from '@/components/ModelSelector.vue'
import CameraMovementGuide from '@/components/CameraMovementGuide.vue'
import AudioLibraryPicker from '@/components/AudioLibraryPicker.vue'
import StudioHeader from '@/components/StudioHeader.vue'
import StudioIsland from '@/components/StudioIsland.vue'
import AddToProjectButton from '@/components/common/AddToProjectButton.vue'
import SkillPicker from '@/components/SkillPicker.vue'
import { useSettingsStore } from '@/stores/settingsStore'
import { DEFAULT_EXPAND_SYSTEM_PROMPT } from '@/stores/settingsStore'
import { useGenerate } from '@/composables/useGenerate'
import { useChatStore } from '@/stores/chatStore'
import { useSkillStore } from '@/stores/skillStore'

import { polishPromptWithSkills } from '@/features/skill/polish'
import {
  ASPECT_RATIO_OPTIONS,
  getLocalUploadAccept,
  getModelCapability,
  getDefaultVideoDuration,
  getDefaultVideoResolution,
  getSupportedAspectRatios,
  getSupportedVideoDurations,
  getSupportedVideoResolutions,
  modelRequiresReference,
  modelSupportsLocalUpload,
  type AspectRatioOption,
  type VideoGenerationMode,
} from '@/types/model'
import { showErrorMessage } from '@/utils/errors'
import { getReadableErrorMessage, validatePromptOrThrow } from '@/utils/errorHandling'
import type { GenerateResult, GenerateStatus, ImageGenerationMode, Message, UploadedFile } from '@/types/chat'
import type { MossLayout } from '@/types/layout'
import { createLayoutFromImage } from '@/features/layout/mossLayout'
import { pickClosestAspectRatio } from '@/features/generate/aspectRatio'
import { resolveGenerateIoType } from '@/features/generate/media'
import { createExpandedUploadedFile, getExpandTargetSize } from '@/features/generate/expand'
import {
  createUploadedFile,
  dataUrlToFile,
  getImageDimensions,
  releaseUploadedFile,
  resolveUploadedImageDimensions,
  type ImageDimensions,
} from '@/features/generate/localFile'
import {
  IMAGE_FILE_ACCEPT,
  IMAGE_FORMAT_HINT,
  VIDEO_FILE_ACCEPT,
  VIDEO_FORMAT_HINT,
  classifySupportedFile,
  validateUploadFileKind,
} from '@/features/generate/fileFormats'
import { loadVoiceLibrary } from '@/features/voice/library'
import type { VoiceLibraryItem } from '@/features/voice/types'

const route = useRoute()
const settingsStore = useSettingsStore()
const chatStore = useChatStore()
const skillStore = useSkillStore()
const { generate } = useGenerate()
const LANDING_REFERENCE_STORAGE_KEY = 'artrealm_landing_reference_image'

const promptInputRef = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const viduStartInput = ref<HTMLInputElement | null>(null)
const viduEndInput = ref<HTMLInputElement | null>(null)
const motionControlImageInput = ref<HTMLInputElement | null>(null)
const motionControlVideoInput = ref<HTMLInputElement | null>(null)
const isPolishing = ref(false)
const isMobileViewport = () => window.matchMedia('(max-width: 980px)').matches
// 移动端页面高度跟随可视视口（地址栏收缩、软键盘弹出时保持输入区可见）
const appHeight = ref('100dvh')
function syncAppHeight() {
  if (isMobileViewport() && window.visualViewport) {
    appHeight.value = `${Math.round(window.visualViewport.height)}px`
  } else {
    appHeight.value = '100dvh'
  }
}
const uploadedFile = ref<UploadedFile | null>(null)
const viduStartFrame = ref<UploadedFile | null>(null)
const viduEndFrame = ref<UploadedFile | null>(null)
const motionControlImage = ref<UploadedFile | null>(null)
const motionControlVideo = ref<UploadedFile | null>(null)
const motionControlKeepOriginalSound = ref<'yes' | 'no'>('yes')
const motionControlCharacterOrientation = ref<'image' | 'video'>('image')

const referenceUrl = ref('')

const inputText = ref('')

// 空状态快捷示例：点击后直接填入提示词，不自动发送。
const quickStarts = [
  {
    title: '电影运镜',
    desc: '雨夜霓虹街头 · 缓慢横移 · 青橙色调',
    prompt:
      '镜头缓慢横移，雨夜霓虹街头，人物侧脸回望，浅景深，青橙色调，胶片颗粒，35mm 镜头，电影级调色。',
  },
  {
    title: '产品广告',
    desc: '磨砂玻璃香水瓶 · 环绕运镜 · 柔光',
    prompt:
      '镜头环绕一只磨砂玻璃质感的香水瓶，浅灰色石台，柔和侧逆光，水珠细节，高级产品广告质感。',
  },
  {
    title: '自然纪录',
    desc: '晨雾森林 · 向前推进 · 丁达尔光',
    prompt:
      '镜头缓慢向前推进，穿过晨雾中的森林，阳光穿透树叶形成丁达尔光束，空气感颗粒，电影级调色。',
  },
  {
    title: '城市延时',
    desc: '黄昏天际线 · 云层流动 · 广角',
    prompt:
      '黄昏时分的城市天际线，广角镜头固定机位，云层快速流动，楼宇灯光依次亮起，延时摄影质感。',
  },
]

function applyQuickPrompt(text: string) {
  inputText.value = text
  nextTick(() => {
    autoGrowPrompt()
    const el = promptInputRef.value
    if (!el) return
    el.focus()
    el.setSelectionRange(text.length, text.length)
  })
}

/* ---------- 画廊 / 历史 / 预览 ---------- */

interface VideoBatch {
  id: string
  assistantId: string
  prompt: string
  createdAt: number
  status: GenerateStatus
  progress: number
  results: GenerateResult[]
  error?: string
  partialError?: string
  aspectRatio?: string
  model?: string
  duration?: number
  batchSize?: number
}

const historyOpen = ref(false)
const paramsOpen = ref(false)
const selectedBatchId = ref('')
const previewOpen = ref(false)
const previewIndex = ref(0)

/** 从消息流里还原「一轮视频生成」：user 提示词 + 下一条视频 assistant 结果。 */
const videoBatches = computed<VideoBatch[]>(() => {
  const list = chatStore.messages
  const result: VideoBatch[] = []
  for (let index = 0; index < list.length; index += 1) {
    const message = list[index]
    if (message.type !== 'user') continue
    const next = list[index + 1]
    if (!next || next.type !== 'assistant' || next.generateType !== 'video') continue
    result.push({
      id: message.id,
      assistantId: next.id,
      prompt: message.content,
      createdAt: message.timestamp,
      status: next.generateStatus || 'idle',
      progress: next.progress || 0,
      results: next.generateResults?.length
        ? next.generateResults
        : next.generateResult
          ? [next.generateResult]
          : [],
      error: next.error,
      partialError: next.partialError,
      aspectRatio: message.aspectRatio,
      model: message.model,
      duration: message.duration,
      batchSize: message.batchSize,
    })
  }
  return result.reverse()
})

const currentVideoBatch = computed<VideoBatch | null>(() => {
  if (!videoBatches.value.length) return null
  if (selectedBatchId.value) {
    const hit = videoBatches.value.find((batch) => batch.id === selectedBatchId.value)
    if (hit) return hit
  }
  return videoBatches.value[0]
})

const pendingCount = computed(() => {
  const batch = currentVideoBatch.value
  if (!batch) return 0
  if (batch.status !== 'pending' && batch.status !== 'processing') return 0
  return Math.max(0, (batch.batchSize || 1) - batch.results.length)
})

const gridColumns = computed(() => {
  const count = (currentVideoBatch.value?.results.length || 0) + pendingCount.value
  if (count <= 1) return 1
  if (count <= 4) return 2
  return 3
})

const generatingProgress = computed(() => {
  if (!activeSessionGenerating.value) return 0
  const batch = videoBatches.value[0]
  if (!batch) return 0
  return Math.min(99, Math.max(batch.progress || 0, 1))
})

const previewResult = computed<GenerateResult | null>(
  () => currentVideoBatch.value?.results[previewIndex.value] || null,
)

function openHistory() {
  historyOpen.value = true
}

function selectBatch(id: string) {
  selectedBatchId.value = id
  historyOpen.value = false
}

function openVideoPreview(index: number) {
  previewIndex.value = index
  previewOpen.value = true
}

function closeVideoPreview() {
  previewOpen.value = false
}

function reusePrompt(batch: VideoBatch) {
  inputText.value = batch.prompt
  nextTick(() => {
    autoGrowPrompt()
    promptInputRef.value?.focus()
  })
}

function regenerateBatch(batch: VideoBatch) {
  const message = chatStore.messages.find((item) => item.id === batch.assistantId)
  if (message) void handleRegenerate(message)
}

function regenerateCurrent() {
  const batch = currentVideoBatch.value
  if (batch) regenerateBatch(batch)
}

function downloadVideoResult(result: GenerateResult) {
  const link = document.createElement('a')
  link.href = result.url
  link.download = `aiping-video-${Date.now()}.mp4`
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function videoInboxAsset(result: GenerateResult, index: number) {
  const base = (currentVideoBatch.value?.prompt || '生成视频').trim().slice(0, 24) || '生成视频'
  return {
    name: index > 0 ? `${base} ${index + 1}` : base,
    kind: 'video' as const,
    url: result.url,
    thumbnail: result.thumbnail || undefined,
    duration: currentVideoBatch.value?.duration || 5,
    source: 'library' as const,
  }
}

function videoMetaLabel(result: GenerateResult) {
  return [
    result.aspectRatio,
    result.duration ? `${result.duration}s` : '',
    result.model,
  ].filter(Boolean).join(' · ')
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function selectVideoDuration(value: number) {
  settingsStore.videoDuration = value
  settingsStore.saveToStorage()
}

function selectVideoResolution(value: string) {
  if (!videoResolutionOptions.value.includes(value)) return
  settingsStore.videoResolution = value
  settingsStore.saveToStorage()
}

function selectVideoBatchSize(size: number) {
  settingsStore.batchSize = size
  settingsStore.saveToStorage()
}
type ImageMode = ImageGenerationMode
type VideoMode = VideoGenerationMode

/** 扩图固定使用的模型。 */
const EXPAND_MODEL_ID = 'Doubao-Seedream-5.0-lite'
/** 快捷扩图弹窗当前选中的生成结果。 */
const quickExpandResult = ref<GenerateResult | null>(null)


const imageMode = ref<ImageMode>('text2image')
const videoMode = ref<VideoMode>('text2video')
// 多模态参考（Seedance 2.0 系列）：图片 0~9 / 视频 0~3 / 音频 0~3


const MULTIMODAL_LIMITS = { image: 9, video: 3, audio: 3 } as const
// Kling V3-Omni / Video-O1「参考生视频」：多图主体，参考图片上限 7 张（复用 multimodalImages 承载）。
const KLING_REFERENCE_IMAGE_LIMIT = 7

const multimodalImages = ref<UploadedFile[]>([])
const multimodalVideos = ref<UploadedFile[]>([])
const multimodalAudios = ref<UploadedFile[]>([])
const multimodalImageInput = ref<HTMLInputElement | null>(null)
const multimodalVideoInput = ref<HTMLInputElement | null>(null)
const multimodalAudioInput = ref<HTMLInputElement | null>(null)

// 音频添加入口：先在「音频库 / 本地上传」之间选择来源。
const audioPickerOpen = ref(false)
const audioLibraryItems = ref<VoiceLibraryItem[]>([])
const audioLibraryLoading = ref(false)
const audioLibraryError = ref('')
const selectedAudioLibraryIds = computed(() =>
  multimodalAudios.value
    .map((item) => item.libraryId)
    .filter((id): id is string => !!id),
)
// 编辑视频（Seedance 2.0）：固定「1 个待修改视频 + 1 张替换图片」
const editVideoFile = ref<UploadedFile | null>(null)
const editImageFile = ref<UploadedFile | null>(null)
const editVideoInput = ref<HTMLInputElement | null>(null)
const editImageInput = ref<HTMLInputElement | null>(null)

// @ 引用菜单状态
const showMentionMenu = ref(false)
const mentionAtIndex = ref(-1)
// 当前高亮的引用项索引（用于键盘上下选择）
const activeMentionIndex = ref(0)
const mentionMenuRef = ref<HTMLElement | null>(null)
const mentionMenuStyle = ref<Record<string, string>>({})

const imageModeOptions: Array<{ value: ImageMode; label: string }> = [
  { value: 'text2image', label: '文生图' },
  { value: 'image2image', label: '图生图' },
  { value: 'expand', label: '扩图' },
]
const viduVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'image2video', label: '图生视频' },
  { value: 'startEnd2video', label: '首尾帧生视频' },
]
const viduQ3ProFastVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'image2video', label: '图生视频' },
]
const minimaxHailuoVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  ...viduVideoModeOptions,
  { value: 'subjectReference2video', label: '主体参考视频' },
]
const klingMotionControlVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'startEnd2video', label: '首尾帧生视频' },
  { value: 'motionControl2video', label: '动作控制' },
]

// Kling V3-Omni / Video-O1：支持「参考生视频（多图主体）」与「首尾帧生视频」。
const klingOmniVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'referenceImage2video', label: '参考生视频' },
  { value: 'startEnd2video', label: '首尾帧生视频' },
]

// 可灵 4.0：文生 / 图生（首帧）/ 首尾帧（4.0）/ 参考生视频（4.0）。
// Flash 仅支持文生与首帧图生。
const klingV4VideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'image2video', label: '图生视频' },
  { value: 'startEnd2video', label: '首尾帧生视频' },
  { value: 'referenceImage2video', label: '参考生视频' },
]
const klingV4FlashVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'image2video', label: '图生视频' },
]


const seedanceVideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'image2video', label: '图生视频' },
  { value: 'multimodalReference2video', label: '多模态参考' },
  { value: 'editVideo', label: '编辑视频' },
]

// MiniMax-H3：文生 / 图生（首帧）/ 尾帧 / 首尾帧 / 多模态参考（参考图 / 参考视频 / 参考音频）。
const minimaxH3VideoModeOptions: Array<{ value: VideoMode; label: string }> = [
  { value: 'text2video', label: '文生视频' },
  { value: 'image2video', label: '图生视频' },
  { value: 'endFrame2video', label: '尾帧生视频' },
  { value: 'startEnd2video', label: '首尾帧生视频' },
  { value: 'multimodalReference2video', label: '多模态参考' },
]


const hasPromptPolishModelConfigured = computed(
  () => settingsStore.promptPolishEnabled && !!settingsStore.promptPolishModel.trim(),
)
const polishDisabledReason = '提示词增强已在设置中关闭，可在设置里重新开启'
const polishButtonTitle = computed(() => {
  if (!hasPromptPolishModelConfigured.value) return polishDisabledReason
  const skillCount =
    settingsStore.mediaType === 'video'
      ? skillStore.videoSkillContents.length
      : skillStore.effectiveSkillContents.length
  const usesSkills = !isExpandMode.value && skillCount > 0
  return usesSkills ? '按已选 Skill 规范改写提示词并补齐必要画面元素' : '用 AI 把简短描述扩写成更专业的镜头提示词'
})

const activeSessionGenerating = computed(() => chatStore.isGenerating)
const modelCapability = computed(() => getModelCapability(settingsStore.selectedModel))
// Moss-Image 原生支持结构化布局，是唯一可做「分层布局 / 图层编辑」的图片模型。
const isMossImageModel = computed(
  () => settingsStore.mediaType === 'image' && modelCapability.value?.imageRequestMode === 'moss',
)
// Seedream 5.0 Lite 等图片模型支持多图参考：复用视频的「素材 + @ 引用」面板（仅图片）。
const isImageMultiReferenceMode = computed(
  () =>
    settingsStore.mediaType === 'image' &&
    imageMode.value === 'image2image' &&
    modelCapability.value?.imageReferenceMode === 'multi',
)
const imageReferenceLimit = computed(() => modelCapability.value?.imageReferenceLimit ?? MULTIMODAL_LIMITS.image)
// 视频页的 Skill 示例图统一用 Moss 版本，不按视频模型分别生成。
const skillPreviewModelId = computed(() =>
  settingsStore.mediaType === 'video' ? 'Moss-Image-SFT' : settingsStore.selectedModel,
)
// 分层布局默认关闭，Moss 默认按普通图片生成，避免多一次布局规划与等待。
const mossLayoutEnabled = ref(false)
interface LayerEditorState {
  imageUrl: string
  layout: MossLayout
  /** moss：原生分层模型；global：整张参考图作底图的近似分层。 */
  mode: 'moss' | 'global'
  modelName: string
  /** global 模式下作为底图的参考图；Moss 模式为空。 */
  baseFile: UploadedFile | null
  /** 打开编辑器时的提示词，重新生成时作为编辑要求。 */
  prompt: string
}
const layerEditorState = ref<LayerEditorState | null>(null)
const isViduVideoModel = computed(() => settingsStore.mediaType === 'video' && modelCapability.value?.videoRequestMode === 'viduq3-fast')
const isViduQ3ProFastModel = computed(() => isViduVideoModel.value && settingsStore.selectedModel?.toLowerCase() === 'viduq3-pro-fast')
const isMinimaxHailuoVideoModel = computed(() => settingsStore.mediaType === 'video' && modelCapability.value?.videoRequestMode === 'minimax-hailuo')
const isKlingMultimodalVideoModel = computed(() => {
  const mode = modelCapability.value?.videoRequestMode
  return settingsStore.mediaType === 'video' && (mode === 'kling-v26' || mode === 'kling-v3' || mode === 'kling-omni')
})
const isKlingMotionControlVideoModel = computed(() => {
  const mode = modelCapability.value?.videoRequestMode
  return settingsStore.mediaType === 'video' && (mode === 'kling-v26' || mode === 'kling-v3')
})
// 运镜指令提示：仅 MiniMax 海螺系列（minimax-hailuo）在文生 / 图生 / 首尾帧模式下展示。

const showCameraGuide = computed(() => {

  return (
    isMinimaxHailuoVideoModel.value &&
    ['text2video', 'image2video', 'startEnd2video'].includes(videoMode.value)
  )
})

const isKlingOmniVideoModel = computed(() => settingsStore.mediaType === 'video' && modelCapability.value?.videoRequestMode === 'kling-omni')
const isKlingV4VideoModel = computed(() => settingsStore.mediaType === 'video' && modelCapability.value?.videoRequestMode === 'kling-v4')
const isKlingV4FlashModel = computed(() => isKlingV4VideoModel.value && settingsStore.selectedModel?.toLowerCase().includes('flash'))
// Kling 参考生视频：复用多模态图片素材面板 + @ 引用
const isKlingReferenceMode = computed(
  () => (isKlingOmniVideoModel.value || isKlingV4VideoModel.value) && videoMode.value === 'referenceImage2video',
)


const isSeedanceVideoModel = computed(() => settingsStore.mediaType === 'video' && modelCapability.value?.videoRequestMode === 'seedance-2')
const isMinimaxH3VideoModel = computed(() => settingsStore.mediaType === 'video' && modelCapability.value?.videoRequestMode === 'minimax-h3')
// MiniMax-H3 帧图模式（图生 / 尾帧 / 首尾帧）：比例由上传图片决定，不支持手动调整。
const isFrameRatioLocked = computed(
  () =>
    (isMinimaxH3VideoModel.value && ['image2video', 'endFrame2video', 'startEnd2video'].includes(videoMode.value)) ||
    (isKlingV4VideoModel.value && ['image2video', 'startEnd2video'].includes(videoMode.value)),
)
// 多模态参考：Seedance 2.0 与 MiniMax-H3 共用「素材 + @ 引用」面板。
const isMultimodalReferenceMode = computed(() => (isSeedanceVideoModel.value || isMinimaxH3VideoModel.value) && videoMode.value === 'multimodalReference2video')
// Seedance 多模态参考带参考视频时，输出比例必须跟随参考视频（上游只接受 adaptive）。
const isReferenceVideoRatioLocked = computed(
  () => isSeedanceVideoModel.value && videoMode.value === 'multimodalReference2video' && multimodalVideos.value.length > 0,
)
const isEditVideoMode = computed(() => isSeedanceVideoModel.value && videoMode.value === 'editVideo')
// 多模态参考、编辑视频、Kling 参考生视频都使用「素材 + @ 引用」的面板
const isSeedanceMentionMode = computed(() => isMultimodalReferenceMode.value || isEditVideoMode.value || isKlingReferenceMode.value)


const usesViduLikeVideoMode = computed(() => isViduVideoModel.value || isMinimaxHailuoVideoModel.value || isMinimaxH3VideoModel.value || isKlingMultimodalVideoModel.value || isKlingV4VideoModel.value || isSeedanceVideoModel.value)
// 统一引用开关：MiniMax-H3 等视频模型只要处于「多模态参考」模式，就复用 seedance2 的 @ 引用面板。
const isMentionReferenceMode = computed(
  () =>
    isSeedanceMentionMode.value ||
    (usesViduLikeVideoMode.value && videoMode.value === 'multimodalReference2video') ||
    isImageMultiReferenceMode.value,
)
const activeVideoModeOptions = computed(() => {
  if (isMinimaxHailuoVideoModel.value) return minimaxHailuoVideoModeOptions
  if (isMinimaxH3VideoModel.value) return minimaxH3VideoModeOptions
  if (isKlingV4VideoModel.value) return isKlingV4FlashModel.value ? klingV4FlashVideoModeOptions : klingV4VideoModeOptions
  if (isKlingMotionControlVideoModel.value) return klingMotionControlVideoModeOptions
  if (isKlingOmniVideoModel.value) return klingOmniVideoModeOptions
  if (isSeedanceVideoModel.value) return seedanceVideoModeOptions
  if (isKlingMultimodalVideoModel.value) return viduVideoModeOptions
  if (isViduQ3ProFastModel.value) return viduQ3ProFastVideoModeOptions
  return viduVideoModeOptions

})
const mentionableAssets = computed<UploadedFile[]>(() => {
  // 编辑视频：固定「视频1 + 图片1」，用于 @ 引用与彩色标签
  if (isEditVideoMode.value) {
    return [editVideoFile.value, editImageFile.value].filter((item): item is UploadedFile => !!item)
  }
  // 图片多图参考：只允许图片素材（不支持音频 / 视频）。
  if (isImageMultiReferenceMode.value) {
    return [...multimodalImages.value]
  }
  return [
    ...multimodalImages.value,
    ...multimodalVideos.value,
    ...multimodalAudios.value,
  ]
})


// 匹配文本中的 @图片N / @视频N / @音频N 引用标签
const MENTION_TAG_REGEX = /@(图片|视频|音频)\d+/g

/** 判断素材属于哪一类，用于给标签上不同的渐变色。 */
function mentionKind(item: UploadedFile): 'image' | 'video' | 'audio' {
  const label = item.refLabel || ''
  if (label.startsWith('视频')) return 'video'
  if (label.startsWith('音频')) return 'audio'
  return 'image'
}

/**
 * 当前文本中真正被 @ 引用、且与已上传素材匹配的素材列表（去重、保持出现顺序）。
 * 在输入框上方以彩色标签展示，用作图片/视频/音频的直观区分。
 */
const referencedMentions = computed<UploadedFile[]>(() => {
  if (!isMentionReferenceMode.value || !inputText.value) return []

  const referencedLabels = new Set(
    Array.from(inputText.value.matchAll(MENTION_TAG_REGEX)).map((match) => match[0].slice(1)),
  )
  return mentionableAssets.value.filter((item) => referencedLabels.has(item.refLabel || ''))
})

const isUploadEnabled = computed(() => modelSupportsLocalUpload(settingsStore.selectedModel))
const supportsImageReferenceMode = computed(() => {
  return settingsStore.mediaType === 'image' && !!modelCapability.value?.inputs.includes('image') && isUploadEnabled.value
})
const isImageReferenceMode = computed(() => {
  return settingsStore.mediaType === 'image' && imageMode.value === 'image2image' && supportsImageReferenceMode.value
})
const isExpandMode = computed(() => settingsStore.mediaType === 'image' && imageMode.value === 'expand')
// 全局图片模型：上传单张参考图后，可把它当作底图进入图层编辑。
const editableImageSource = computed<UploadedFile | null>(() => {
  if (settingsStore.mediaType !== 'image' || isMossImageModel.value) return null
  if (isImageMultiReferenceMode.value) {
    return multimodalImages.value.length === 1 ? multimodalImages.value[0] : null
  }
  if (isImageReferenceMode.value) {
    return uploadedFile.value?.type === 'image' ? uploadedFile.value : null
  }
  return null
})
const canOpenImageEditor = computed(() => !!editableImageSource.value)
const expandSourceAspectRatio = computed(() => {
  const dimensions = uploadedFile.value?.dimensions
  if (!dimensions?.width || !dimensions?.height) return null
  return dimensions.width / dimensions.height
})
const isExpandRatioSame = computed(() => {
  if (!isExpandMode.value || !expandSourceAspectRatio.value) return false
  const targetRatio = parseAspectRatio(settingsStore.aspectRatio)
  if (!targetRatio) return false
  return Math.abs(expandSourceAspectRatio.value - targetRatio) < 0.01
})
const requiresUpload = computed(() => {
  if (!modelRequiresReference(settingsStore.selectedModel)) return false
  return !!modelCapability.value?.inputs.includes('image') && !inputText.value.trim()
})
const showReferenceUrlInput = computed(() => requiresUpload.value && !isUploadEnabled.value)
const showReferenceField = computed(() => {
  if (usesViduLikeVideoMode.value) return videoMode.value !== 'text2video'
  if (settingsStore.mediaType === 'image') {
    return isImageMultiReferenceMode.value || isImageReferenceMode.value || isExpandMode.value || showReferenceUrlInput.value
  }
  return isUploadEnabled.value || showReferenceUrlInput.value
})

const uploadAccept = computed(
  () => getLocalUploadAccept(settingsStore.selectedModel) || `${IMAGE_FILE_ACCEPT},${VIDEO_FILE_ACCEPT}`,
)
function createAspectRatioOption(value: string): AspectRatioOption | null {
  const [width, height] = value.split(':').map((item) => Number(item))
  if (!width || !height) return null
  const scale = 28 / Math.max(width, height)
  return {
    value,
    label: value,
    boxWidth: Math.max(12, Math.round(width * scale)),
    boxHeight: Math.max(12, Math.round(height * scale)),
  }
}

function getAspectRatioOption(value: string): AspectRatioOption | null {
  // MiniMax-H3 图生/参考场景支持 adaptive（自适应）。
  if (value === 'adaptive') {
    return { value: 'adaptive', label: '自适应', boxWidth: 20, boxHeight: 20 }
  }
  return ASPECT_RATIO_OPTIONS.find((option) => option.value === value) || createAspectRatioOption(value)
}

const aspectRatioOptions = computed(() => {
  if (settingsStore.mediaType !== 'video') return ASPECT_RATIO_OPTIONS
  if (isFrameRatioLocked.value) {
    return [getAspectRatioOption('adaptive')].filter((option): option is AspectRatioOption => !!option)
  }
  // MiniMax-H3 的具体比例列表依赖生成方式（仅图生/参考模式提供 adaptive）。
  const supported = getSupportedAspectRatios(settingsStore.selectedModel, videoMode.value)
  return supported
    ? supported.map(getAspectRatioOption).filter((option): option is AspectRatioOption => !!option)
    : ASPECT_RATIO_OPTIONS
})

const videoDurationOptions = computed(() => getSupportedVideoDurations(settingsStore.selectedModel) ?? [{ value: 6, label: '6s' }])
const klingReferenceImageLimit = computed(() => (isKlingV4VideoModel.value ? 10 : KLING_REFERENCE_IMAGE_LIMIT))
const videoResolutionOptions = computed(() => getSupportedVideoResolutions(settingsStore.selectedModel) ?? [])
const showsVideoResolution = computed(() => videoResolutionOptions.value.length > 0)
function formatVideoResolution(value: string) {
  return value.toUpperCase()
}
const formattedVideoResolution = computed(() => formatVideoResolution(settingsStore.videoResolution))

const selectedModelLabel = computed(() => settingsStore.selectedModel || '未选择模型')
const selectedVideoDurationLabel = computed(() => {
  return videoDurationOptions.value.find((option) => option.value === settingsStore.videoDuration)?.label || `${settingsStore.videoDuration}s`
})
const activeGenerateModeLabel = computed(() => {
  if (settingsStore.mediaType === 'image') {
    return imageModeOptions.find((option) => option.value === imageMode.value)?.label || '文生图'
  }
  if (usesViduLikeVideoMode.value) {
    return activeVideoModeOptions.value.find((option) => option.value === videoMode.value)?.label || '文生视频'
  }
  return uploadedFile.value ? '参考生成' : '文生视频'
})

const quickExpandSourceRatio = computed(() => {
  const result = quickExpandResult.value
  if (!result) return null
  return parseAspectRatio(result.aspectRatio)
    ?? (result.size?.width && result.size?.height ? result.size.width / result.size.height : null)
})

const quickExpandSourceLabel = computed(() => {
  const result = quickExpandResult.value
  if (!result) return ''
  if (result.aspectRatio) return result.aspectRatio
  if (result.size?.width && result.size?.height) return `${result.size.width}×${result.size.height}`
  return '原图'
})

function isQuickExpandRatioSame(ratio: string): boolean {
  const sourceRatio = quickExpandSourceRatio.value
  const targetRatio = parseAspectRatio(ratio)
  if (!sourceRatio || !targetRatio) return false
  return Math.abs(sourceRatio - targetRatio) < 0.01
}
const needsMaterialAttention = computed(() => {
  if (!showReferenceField.value) return false
  if (isExpandMode.value) return !uploadedFile.value
  if (isImageReferenceMode.value) return !uploadedFile.value
  if (!usesViduLikeVideoMode.value) return showReferenceUrlInput.value ? !referenceUrl.value.trim() : false
  if (videoMode.value === 'image2video' || videoMode.value === 'endFrame2video') return !uploadedFile.value
  if (videoMode.value === 'motionControl2video') return !motionControlImage.value || !motionControlVideo.value
  if (videoMode.value === 'startEnd2video') return !viduStartFrame.value
  if (videoMode.value === 'referenceImage2video') return multimodalImages.value.length === 0
  if (videoMode.value === 'subjectReference2video') return !uploadedFile.value
  if (videoMode.value === 'editVideo') return !editVideoFile.value || !editImageFile.value
  return false
})
const materialSummaryLabel = computed(() => {
  if (!showReferenceField.value) return ''
  if (isExpandMode.value) return uploadedFile.value ? `原图：${uploadedFile.value.name}` : '原图：待上传'
  if (isImageMultiReferenceMode.value) {
    return multimodalImages.value.length
      ? `多图参考 ${multimodalImages.value.length}/${imageReferenceLimit.value}`
      : '多图参考待上传'
  }
  if (isImageReferenceMode.value) return uploadedFile.value ? `素材：${uploadedFile.value.name}` : '素材：待上传'
  if (showReferenceUrlInput.value) return referenceUrl.value.trim() ? '参考链接已填写' : '参考链接待填写'
  if (usesViduLikeVideoMode.value) {
    if (videoMode.value === 'image2video') return uploadedFile.value ? `参考图：${uploadedFile.value.name}` : '参考图待上传'
    if (videoMode.value === 'endFrame2video') return uploadedFile.value ? `尾帧图：${uploadedFile.value.name}` : '尾帧图待上传'
    if (videoMode.value === 'motionControl2video') {
      const count = [motionControlImage.value, motionControlVideo.value].filter(Boolean).length
      return count === 2 ? '动作素材已齐' : `动作素材 ${count}/2`
    }
    if (videoMode.value === 'startEnd2video') {
      if (viduStartFrame.value && viduEndFrame.value) return '首尾帧已添加'
      if (viduStartFrame.value) return '首帧已添加'
      return '首帧待上传'
    }
    if (videoMode.value === 'referenceImage2video') return multimodalImages.value.length ? `参考图 ${multimodalImages.value.length}/${klingReferenceImageLimit.value}` : '参考图待上传'
    if (videoMode.value === 'multimodalReference2video') {
      const count = multimodalImages.value.length + multimodalVideos.value.length + multimodalAudios.value.length
      return count ? `多模态素材 ${count}` : '多模态素材可选'
    }
    if (videoMode.value === 'editVideo') {
      const count = [editVideoFile.value, editImageFile.value].filter(Boolean).length
      return count === 2 ? '编辑素材已齐' : `编辑素材 ${count}/2`
    }
    if (videoMode.value === 'subjectReference2video') return uploadedFile.value ? '主体参考已添加' : '主体图待上传'
  }
  return uploadedFile.value ? `素材：${uploadedFile.value.name}` : '素材可选'
})

const inputPlaceholder = computed(() => {
  if (isExpandMode.value) {
    return '（可选）描述扩展区域希望出现的画面；留空则只按目标比例自然向外延展。'
  }
  if (usesViduLikeVideoMode.value && videoMode.value === 'text2video') {
    return '描述你想生成的视频：场景、运动、节奏、情绪和镜头语言。'
  }
  if (usesViduLikeVideoMode.value && videoMode.value === 'image2video') {
    return '描述参考图如何动起来：主体运动、镜头推进、节奏和氛围。'
  }
  if (usesViduLikeVideoMode.value && videoMode.value === 'endFrame2video') {
    return '描述视频如何走向这个结尾画面：动作走向、镜头运动与氛围。'
  }
  if (usesViduLikeVideoMode.value && videoMode.value === 'motionControl2video') {
    return '描述参考图中的人物外观、服装和场景，并结合参考视频控制人物动作。'
  }
  if (usesViduLikeVideoMode.value && videoMode.value === 'startEnd2video') {
    return '描述首帧到尾帧之间的变化过程、镜头运动、节奏和氛围。'
  }
  if (isImageMultiReferenceMode.value) {
    return '描述生成目标，可输入 @ 引用图片，例如「把 @图片1 的人物放进 @图片2 的场景，保持图2 的光线」。'
  }
  if (isMentionReferenceMode.value) {
    return '描述生成目标，可输入 @ 引用图片、视频或音频，例如「让 @图片1 的角色走向 @视频1 的场景，并配合 @音频1 的节奏」。'
  }
  if (isMinimaxHailuoVideoModel.value && videoMode.value === 'subjectReference2video') {
    return '描述人物主体在视频中的动作、表情、镜头运动和氛围。'
  }
  if (isImageReferenceMode.value) {
    return '描述你希望参考图如何变化：风格、光线、细节、构图。'
  }
  if (settingsStore.mediaType === 'video' && uploadedFile.value?.type === 'image') {
    return '描述你希望参考图如何动起来：主体运动、镜头推进、节奏和氛围。'
  }
  if (settingsStore.mediaType === 'video' && uploadedFile.value?.type === 'video') {
    return '描述你希望参考视频如何延展：运动、镜头、节奏、氛围。'
  }
  return settingsStore.mediaType === 'image'
    ? '描述你想生成的画面：主体、氛围、镜头、色彩、质感。'
    : '描述你想生成的视频：场景、运动、节奏、情绪和镜头语言。'
})

const canSend = computed(() => {
  if (isExpandMode.value) {
    return !!uploadedFile.value && !isExpandRatioSame.value
  }
  if (!inputText.value.trim()) return false
  if (usesViduLikeVideoMode.value) {
    if (videoMode.value === 'text2video') return true
    if (videoMode.value === 'multimodalReference2video') return true
    // 编辑视频：需上传待编辑视频 + 替换图片
    if (videoMode.value === 'editVideo') return !!editVideoFile.value && !!editImageFile.value
    // 参考生视频（Kling Omni / O1）：至少 1 张参考图片（复用 multimodalImages）
    if (videoMode.value === 'referenceImage2video') return multimodalImages.value.length > 0


    if (videoMode.value === 'image2video' || videoMode.value === 'endFrame2video') return !!uploadedFile.value


    if (videoMode.value === 'motionControl2video') return !!motionControlImage.value && !!motionControlVideo.value
    // 首尾帧生视频：首帧必填，尾帧可选。
    if (videoMode.value === 'startEnd2video') return !!viduStartFrame.value

    return !!uploadedFile.value || !!referenceUrl.value.trim()
  }

  if (settingsStore.mediaType === 'image' && imageMode.value === 'image2image') {
    if (isImageMultiReferenceMode.value) return multimodalImages.value.length > 0
    return supportsImageReferenceMode.value && !!uploadedFile.value
  }
  if (modelCapability.value?.availabilityNote === 'requires-image-upload' || modelCapability.value?.availabilityNote === 'requires-video-upload') {
    return !!uploadedFile.value || !!referenceUrl.value.trim()
  }
  if (!requiresUpload.value) return true
  return !!uploadedFile.value || !!referenceUrl.value.trim()
})

function setVideoMode(mode: VideoMode) {
  if (videoMode.value === mode) return
  videoMode.value = mode
  removeUploadedFile()
  removeViduFrames()
  removeMotionControlFiles()
  clearMultimodalAssets()
  clearEditFiles()
  showMentionMenu.value = false
  referenceUrl.value = ''
  // 模式切换会影响可选比例（如 MiniMax-H3 仅图生/参考模式提供 adaptive），需要重新校验。
  ensureSupportedAspectRatio()
}




function selectAspectRatio(value: string) {

  if (!aspectRatioOptions.value.some((option) => option.value === value)) return
  settingsStore.aspectRatio = value
  settingsStore.saveToStorage()
}

function ensureSupportedAspectRatio() {
  if (isFrameRatioLocked.value) return
  if (!aspectRatioOptions.value.length) return
  if (aspectRatioOptions.value.some((option) => option.value === settingsStore.aspectRatio)) return
  settingsStore.aspectRatio = aspectRatioOptions.value[0]?.value || '1:1'
  settingsStore.saveToStorage()
}

function ensureSupportedVideoDuration() {
  if (settingsStore.mediaType !== 'video') return
  if (videoDurationOptions.value.some((option) => option.value === settingsStore.videoDuration)) return
  settingsStore.videoDuration = getDefaultVideoDuration(settingsStore.selectedModel)
  settingsStore.saveToStorage()
}

/** 切换模型后校正分辨率档位（MiniMax-H3：768P/2K；Kling 4.0：720p/1080p；Flash：仅 720p）。 */
function ensureSupportedVideoResolution() {
  if (settingsStore.mediaType !== 'video') return
  const options = videoResolutionOptions.value
  if (!options.length) return
  if (options.includes(settingsStore.videoResolution)) return
  settingsStore.videoResolution = getDefaultVideoResolution(settingsStore.selectedModel) || options[0]
  settingsStore.saveToStorage()
}

function restoreLandingReferenceImage() {
  if (route.query.reference !== 'landing') return
  const raw = sessionStorage.getItem(LANDING_REFERENCE_STORAGE_KEY)
  if (!raw) return

  try {
    const parsed = JSON.parse(raw) as { name?: string; type?: string; size?: number; dataUrl?: string }
    if (!parsed.dataUrl) return
    const file = dataUrlToFile(parsed.dataUrl, parsed.name || 'landing-reference.png', parsed.type || 'image/png')
    removeUploadedFile()
    uploadedFile.value = createUploadedFile(file, 'image')
    if (supportsImageReferenceMode.value) imageMode.value = 'image2image'
  } catch (error) {
    showErrorMessage(getReadableErrorMessage(error, '首页参考图读取失败，请重新上传。'))
  } finally {
    sessionStorage.removeItem(LANDING_REFERENCE_STORAGE_KEY)
  }
}

function getGreatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(a)
  let y = Math.abs(b)
  while (y) {
    const next = x % y
    x = y
    y = next
  }
  return x || 1
}

function getAspectRatioLabel(dimensions: ImageDimensions): string {
  const divisor = getGreatestCommonDivisor(dimensions.width, dimensions.height)
  return `${dimensions.width / divisor}:${dimensions.height / divisor}`
}

function parseAspectRatio(value: string | undefined | null): number | null {
  if (!value) return null
  const [width, height] = value.split(':').map((item) => Number(item))
  if (!width || !height) return null
  return width / height
}

function hasSameAspectRatio(a: ImageDimensions, b: ImageDimensions): boolean {
  return a.width * b.height === b.width * a.height
}

/**
 * 全局图片模型的「图像编辑」入口：
 * 把已上传的参考图作为整张底图（背景层）打开图层编辑器，
 * 用户可继续添加图层、写描述、拖拽调整，完成后直接生成新图。
 */
async function openImageEditorFromUpload() {
  const source = editableImageSource.value
  if (!source) return
  try {
    const dimensions = await resolveUploadedImageDimensions(source)
    if (!dimensions?.width || !dimensions?.height) {
      showErrorMessage('无法读取图片尺寸，请重新上传后再试。')
      return
    }
    const aspectRatio = pickClosestAspectRatio(dimensions.width, dimensions.height)
    const caption = inputText.value.trim()
    layerEditorState.value = {
      imageUrl: source.url,
      layout: createLayoutFromImage({
        width: dimensions.width,
        height: dimensions.height,
        aspectRatio,
        caption,
      }),
      mode: 'global',
      modelName: settingsStore.selectedModel || '',
      baseFile: source,
      prompt: caption,
    }
  } catch (error) {
    showErrorMessage(getReadableErrorMessage(error, '无法打开图像编辑，请重试。'))
  }
}

function showViduFrameAspectRatioError(startDimensions: ImageDimensions, endDimensions: ImageDimensions) {
  showErrorMessage(
    `首帧和尾帧图片比例必须相同。当前首帧为 ${getAspectRatioLabel(startDimensions)}，尾帧为 ${getAspectRatioLabel(endDimensions)}。`,
  )
}

async function validateViduFrameAspectRatio(): Promise<boolean> {
  if (!viduStartFrame.value || !viduEndFrame.value) return true
  try {
    const startDimensions = await resolveUploadedImageDimensions(viduStartFrame.value)
    const endDimensions = await resolveUploadedImageDimensions(viduEndFrame.value)
    if (!startDimensions || !endDimensions) return true
    if (hasSameAspectRatio(startDimensions, endDimensions)) return true
    showViduFrameAspectRatioError(startDimensions, endDimensions)
    return false
  } catch (error) {
    showErrorMessage('无法读取首帧或尾帧图片尺寸，请重新上传图片后再试。')
    return false
  }
}

function removeUploadedFile(options: { revoke?: boolean } = {}) {
  if (options.revoke !== false) {
    releaseUploadedFile(uploadedFile.value)
  }
  uploadedFile.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

function removeViduFrame(position: 'start' | 'end', options: { revoke?: boolean } = {}) {
  if (position === 'start') {
    if (options.revoke !== false) {
      releaseUploadedFile(viduStartFrame.value)
    }
    viduStartFrame.value = null
    if (viduStartInput.value) viduStartInput.value.value = ''
    return
  }
  if (options.revoke !== false) {
    releaseUploadedFile(viduEndFrame.value)
  }
  viduEndFrame.value = null
  if (viduEndInput.value) viduEndInput.value.value = ''
}

function removeViduFrames(options: { revoke?: boolean } = {}) {
  removeViduFrame('start', options)
  removeViduFrame('end', options)
}

function removeMotionControlFile(type: 'image' | 'video', options: { revoke?: boolean } = {}) {
  if (type === 'image') {
    if (options.revoke !== false) releaseUploadedFile(motionControlImage.value)
    motionControlImage.value = null
    if (motionControlImageInput.value) motionControlImageInput.value.value = ''
    return
  }

  if (options.revoke !== false) releaseUploadedFile(motionControlVideo.value)
  motionControlVideo.value = null
  if (motionControlVideoInput.value) motionControlVideoInput.value.value = ''
}

function removeMotionControlFiles(options: { revoke?: boolean } = {}) {
  removeMotionControlFile('image', options)
  removeMotionControlFile('video', options)
}

function handleFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const capability = getModelCapability(settingsStore.selectedModel)
  const fileKind = classifySupportedFile(file)
  if (!fileKind) {
    showErrorMessage(`仅支持常见格式：图片（${IMAGE_FORMAT_HINT}）、视频（${VIDEO_FORMAT_HINT}）`)
    target.value = ''
    return
  }
  const isImage = fileKind === 'image'
  const isVideo = fileKind === 'video'

  if (isImage && !capability?.localUploadInputs?.includes('image')) {
    showErrorMessage('当前模型不支持本地图片上传')
    return
  }

  if (isVideo && !capability?.localUploadInputs?.includes('video')) {
    showErrorMessage('当前模型不支持本地视频上传')
    return
  }

  removeUploadedFile()
  const nextFile = createUploadedFile(file, isImage ? 'image' : 'video')
  uploadedFile.value = nextFile
  // 扩图模式需要知道原图比例，用于拦截「目标比例与原图一致」的无意义请求。
  // 这里必须传 ref 中的响应式对象，直接在原始 File 包装对象上写 dimensions
  // 不会触发 computed 更新。
  if (isImage && isExpandMode.value && uploadedFile.value) {
    void resolveUploadedImageDimensions(uploadedFile.value).catch(() => {})
  }
}

async function handleViduFrameChange(e: Event, position: 'start' | 'end') {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const frameFormatError = validateUploadFileKind(file, 'image')
  if (frameFormatError) {
    showErrorMessage(`首尾帧生视频仅支持常见图片格式（${IMAGE_FORMAT_HINT}）`)
    target.value = ''
    return
  }

  let dimensions: ImageDimensions
  try {
    dimensions = await getImageDimensions(file)
  } catch (error) {
    showErrorMessage('无法读取图片尺寸，请重新上传图片后再试。')
    target.value = ''
    return
  }

  const oppositeFrame = position === 'start' ? viduEndFrame.value : viduStartFrame.value
  if (oppositeFrame) {
    try {
      const oppositeDimensions = await resolveUploadedImageDimensions(oppositeFrame)
      if (oppositeDimensions && !hasSameAspectRatio(dimensions, oppositeDimensions)) {
        if (position === 'start') {
          showViduFrameAspectRatioError(dimensions, oppositeDimensions)
        } else {
          showViduFrameAspectRatioError(oppositeDimensions, dimensions)
        }
        target.value = ''
        return
      }
    } catch (error) {
      showErrorMessage('无法读取已上传图片尺寸，请重新上传首帧和尾帧。')
      target.value = ''
      return
    }
  }

  removeViduFrame(position)
  const uploaded = createUploadedFile(file, 'image', dimensions)
  // 标记首/尾帧用途，供 buildParams（尤其是 kling-omni 首尾帧）区分帧图与参考图。
  uploaded.purpose = position === 'start' ? 'start-frame' : 'end-frame'
  if (position === 'start') {
    viduStartFrame.value = uploaded
  } else {
    viduEndFrame.value = uploaded
  }
}

function handleMotionControlFileChange(e: Event, type: 'image' | 'video') {

  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const motionFormatError = validateUploadFileKind(file, type)
  if (motionFormatError) {
    showErrorMessage(
      type === 'image'
        ? `动作控制参考图像仅支持常见图片格式（${IMAGE_FORMAT_HINT}）`
        : `动作控制参考视频仅支持常见视频格式（${VIDEO_FORMAT_HINT}）`,
    )
    target.value = ''
    return
  }

  removeMotionControlFile(type)
  const uploaded = createUploadedFile(file, type)
  uploaded.purpose = type === 'image' ? 'motion-control-image' : 'motion-control-video'
  if (type === 'image') {
    motionControlImage.value = uploaded
  } else {
    motionControlVideo.value = uploaded
  }
}

// ---- 编辑视频（Seedance 2.0）相关：固定 1 视频 + 1 图片 ----

function handleEditFileChange(e: Event, type: 'image' | 'video') {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const editFormatError = validateUploadFileKind(file, type)
  if (editFormatError) {
    showErrorMessage(editFormatError)
    target.value = ''
    return
  }

  removeEditFile(type)
  const uploaded = createUploadedFile(file, type)
  // 与多模态参考保持一致的 purpose / refLabel，交由 buildParams 分类为 reference_image / reference_video
  uploaded.purpose = type === 'image' ? 'multimodal-image' : 'multimodal-video'
  uploaded.refLabel = type === 'image' ? '图片1' : '视频1'
  if (type === 'image') {
    editImageFile.value = uploaded
  } else {
    editVideoFile.value = uploaded
  }
  target.value = ''
}

function removeEditFile(type: 'image' | 'video', options: { revoke?: boolean } = {}) {
  if (type === 'image') {
    if (options.revoke !== false) releaseUploadedFile(editImageFile.value)
    editImageFile.value = null
    if (editImageInput.value) editImageInput.value.value = ''
    return
  }
  if (options.revoke !== false) releaseUploadedFile(editVideoFile.value)
  editVideoFile.value = null
  if (editVideoInput.value) editVideoInput.value.value = ''
}

function clearEditFiles(options: { revoke?: boolean } = {}) {
  removeEditFile('image', options)
  removeEditFile('video', options)
}

// ---- 多模态参考（Seedance 2.0）相关 ----


function multimodalRefFromType(type: 'image' | 'video' | 'audio') {
  return type === 'image' ? multimodalImages : type === 'video' ? multimodalVideos : multimodalAudios
}

function multimodalLabelPrefix(type: 'image' | 'video' | 'audio') {
  return type === 'image' ? '图片' : type === 'video' ? '视频' : '音频'
}

/** 重新编号某一类素材的 refLabel（图片1、图片2……）。 */
function relabelMultimodal(type: 'image' | 'video' | 'audio') {
  const list = multimodalRefFromType(type).value
  const prefix = multimodalLabelPrefix(type)
  list.forEach((item, index) => {
    item.refLabel = `${prefix}${index + 1}`
  })
}

async function loadAudioLibrary() {
  audioLibraryLoading.value = true
  audioLibraryError.value = ''

  if (typeof indexedDB === 'undefined') {
    audioLibraryItems.value = []
    audioLibraryError.value = '当前浏览器不支持本地音频库，请改用本地上传。'
    audioLibraryLoading.value = false
    return
  }

  try {
    audioLibraryItems.value = await loadVoiceLibrary()
  } catch {
    audioLibraryItems.value = []
    audioLibraryError.value = '音频库读取失败，请刷新后重试或改用本地上传。'
  } finally {
    audioLibraryLoading.value = false
  }
}

function openAudioPicker() {
  if (multimodalAudios.value.length >= MULTIMODAL_LIMITS.audio) {
    showErrorMessage(`音频最多添加 ${MULTIMODAL_LIMITS.audio} 个。`)
    return
  }
  audioPickerOpen.value = true
  void loadAudioLibrary()
}

function closeAudioPicker() {
  audioPickerOpen.value = false
}

function chooseLocalAudio() {
  closeAudioPicker()
  multimodalAudioInput.value?.click()
}

function addAudioFromLibrary(item: VoiceLibraryItem) {
  if (multimodalAudios.value.length >= MULTIMODAL_LIMITS.audio) {
    showErrorMessage(`音频最多添加 ${MULTIMODAL_LIMITS.audio} 个。`)
    return
  }
  if (multimodalAudios.value.some((entry) => entry.libraryId === item.id)) {
    showErrorMessage('这段配音已经在参考音频里了。')
    return
  }

  const extension = item.format === 'pcm' ? 'pcm' : item.format
  const file = new File([item.blob], `voice-${item.id}.${extension}`, {
    type: item.blob.type || 'audio/mpeg',
  })
  const uploaded = createUploadedFile(file, 'audio')
  uploaded.purpose = 'multimodal-audio'
  uploaded.libraryId = item.id
  multimodalAudios.value.push(uploaded)
  relabelMultimodal('audio')
  closeAudioPicker()
}

watch(videoMode, () => {
  closeAudioPicker()
})

function handleMultimodalFileChange(e: Event, type: 'image' | 'video' | 'audio') {
  const target = e.target as HTMLInputElement
  const files = Array.from(target.files || [])
  if (!files.length) return

  const listRef = multimodalRefFromType(type)
  const limit = type === 'image'
    ? isImageMultiReferenceMode.value
      ? imageReferenceLimit.value
      : isKlingReferenceMode.value
        ? klingReferenceImageLimit.value
        : MULTIMODAL_LIMITS.image
    : MULTIMODAL_LIMITS[type]

  for (const file of files) {
    if (listRef.value.length >= limit) {
      showErrorMessage(`${multimodalLabelPrefix(type)}最多上传 ${limit} 个。`)
      break
    }
    const formatError = type === 'audio'
      ? (!file.type.startsWith('audio/') ? '请上传正确的音频文件。' : null)
      : validateUploadFileKind(file, type)
    if (formatError) {
      showErrorMessage(formatError)
      continue
    }
    const uploaded = createUploadedFile(file, type)
    uploaded.purpose = type === 'image' ? 'multimodal-image' : type === 'video' ? 'multimodal-video' : 'multimodal-audio'
    listRef.value.push(uploaded)
  }
  relabelMultimodal(type)
  target.value = ''
}

function removeMultimodalAsset(type: 'image' | 'video' | 'audio', item: UploadedFile) {
  const listRef = multimodalRefFromType(type)
  const index = listRef.value.findIndex((entry) => entry.url === item.url)
  if (index < 0) return
  releaseUploadedFile(listRef.value[index])
  listRef.value.splice(index, 1)
  relabelMultimodal(type)
}

function clearMultimodalAssets(options: { revoke?: boolean } = {}) {
  const revoke = options.revoke !== false
  for (const listRef of [multimodalImages, multimodalVideos, multimodalAudios]) {
    if (revoke) listRef.value.forEach((item) => releaseUploadedFile(item))
    listRef.value = []
  }
}

/**
 * 输入框键盘处理：
 * - 当 @ 引用菜单打开时：↑/↓ 切换高亮项，Enter/Tab 选中当前项，Esc 关闭菜单；
 * - 菜单关闭时：Enter 仅作为普通换行（不再触发发送）。
 */
function handleComposerKeydown(event: KeyboardEvent) {
  if (event.isComposing) return
  if (!showMentionMenu.value || !mentionableAssets.value.length) return

  const total = mentionableAssets.value.length
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      activeMentionIndex.value = (activeMentionIndex.value + 1) % total
      break
    case 'ArrowUp':
      event.preventDefault()
      activeMentionIndex.value = (activeMentionIndex.value - 1 + total) % total
      break
    case 'Enter':
    case 'Tab': {
      event.preventDefault()
      const item = mentionableAssets.value[activeMentionIndex.value]
      if (item) insertMentionReference(item)
      break
    }
    case 'Escape':
      event.preventDefault()
      showMentionMenu.value = false
      mentionAtIndex.value = -1
      break
    default:
      break
  }
}

/** 在光标处插入 @素材标签 引用。 */
function insertMentionReference(item: UploadedFile) {
  const label = item.refLabel || item.name
  const textarea = promptInputRef.value
  const insertText = `@${label} `
  if (!textarea) {
    inputText.value += insertText
  } else {
    const currentValue = textarea.value ?? inputText.value
    const start = mentionAtIndex.value >= 0 ? mentionAtIndex.value : textarea.selectionStart
    const end = textarea.selectionStart
    const before = currentValue.slice(0, start)
    const after = currentValue.slice(end)
    inputText.value = `${before}${insertText}${after}`
  }
  showMentionMenu.value = false
  mentionAtIndex.value = -1
  nextTick(() => promptInputRef.value?.focus())
}

/** 监听输入，检测末尾的 @ 以触发引用菜单。 */
/** 提示词输入框随内容自动长高，最多 180px。 */
function autoGrowPrompt() {
  const textarea = promptInputRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`
}

function handlePromptInput(event?: Event) {
  autoGrowPrompt()
  if (!isMentionReferenceMode.value || !mentionableAssets.value.length) {
    showMentionMenu.value = false
    return
  }

  const textarea = promptInputRef.value
  const currentValue =
    (event?.target as HTMLTextAreaElement | undefined)?.value ??
    textarea?.value ??
    inputText.value
  const caret = textarea ? textarea.selectionStart : inputText.value.length
  const textBefore = currentValue.slice(0, caret)
  const atIndex = textBefore.lastIndexOf('@')
  if (atIndex >= 0 && !/\s/.test(textBefore.slice(atIndex + 1))) {
    mentionAtIndex.value = atIndex
    // 菜单（重新）打开时，若高亮索引越界则复位到第一项
    if (!showMentionMenu.value || activeMentionIndex.value >= mentionableAssets.value.length) {
      activeMentionIndex.value = 0
    }
    showMentionMenu.value = true
    void positionMentionMenu()
  } else {
    showMentionMenu.value = false
    mentionAtIndex.value = -1
  }
}

/** 将 @ 引用菜单定位到输入框附近，避免被父容器的 overflow/backdrop-filter 裁切。 */
async function positionMentionMenu() {
  await nextTick()
  const textarea = promptInputRef.value
  const menu = mentionMenuRef.value
  if (!textarea || !menu) return

  const rect = textarea.getBoundingClientRect()
  const gap = 8
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const menuWidth = Math.max(menu.offsetWidth || 180, 180)
  const menuHeight = Math.min(menu.scrollHeight || 44, 220)
  const availableBelow = viewportHeight - rect.bottom - gap
  const availableAbove = rect.top - gap
  const maxHeight = Math.max(96, Math.min(220, Math.max(availableBelow, availableAbove) - gap))
  const placeBelow = availableBelow >= Math.min(menuHeight, maxHeight) || availableBelow >= availableAbove
  const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - menuWidth - 8))
  const top = placeBelow
    ? rect.bottom + gap
    : Math.max(8, rect.top - Math.min(menuHeight, maxHeight) - gap)

  mentionMenuStyle.value = {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    bottom: 'auto',
    width: `${menuWidth}px`,
    maxHeight: `${maxHeight}px`,
  }
}

async function handlePolishPrompt() {

  const prompt = inputText.value.trim()
  try {
    validatePromptOrThrow(prompt)
  } catch (error) {
    void alertDialog({
      title: '生成失败',
      message: getReadableErrorMessage(error, '请检查提示词后重试。'),
    })
    return
  }

  const model = settingsStore.promptPolishModel.trim()
  if (!model) {
    showErrorMessage('提示词增强已关闭，请先在设置中开启后再使用 AI 润色。')
    return
  }

  isPolishing.value = true
  try {
    // 有已选 Skill 时按 Skill 规范改写并补齐元素；视频只用风格 + 上传 Skill，扩图忽略 Skill。
    inputText.value = await polishPromptWithSkills({
      model,
      prompt,
      skillContent: isExpandMode.value
        ? []
        : settingsStore.mediaType === 'video'
          ? skillStore.videoSkillContents
          : skillStore.effectiveSkillContents,
      systemPrompt: isExpandMode.value
        ? DEFAULT_EXPAND_SYSTEM_PROMPT
        : settingsStore.promptPolishSystemPrompt,
    })
    await nextTick()
    promptInputRef.value?.focus()
  } catch (error) {
    void alertDialog({
      title: '润色失败',
      message: getReadableErrorMessage(error, '润色失败，请稍后重试。'),
    })
  } finally {
    isPolishing.value = false
  }
}

/**
 * 插入运镜指令 / 示例到提示词（MiniMax 海螺系列）。
 * 优先在光标处插入，否则追加到末尾，并自动处理空格。
 */
function insertCameraCommand(text: string) {
  const textarea = promptInputRef.value
  if (!textarea) {
    const current = inputText.value
    inputText.value = current && !current.endsWith(' ') ? `${current} ${text}` : `${current}${text}`
    return
  }
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const before = inputText.value.slice(0, start)
  const after = inputText.value.slice(end)
  const needsLeadingSpace = before.length > 0 && !before.endsWith(' ')
  const insert = needsLeadingSpace ? ` ${text}` : text
  inputText.value = `${before}${insert}${after}`
  nextTick(() => {
    const caret = before.length + insert.length
    textarea.focus()
    textarea.setSelectionRange(caret, caret)
  })
}

onMounted(async () => {
  settingsStore.loadFromStorage()
  skillStore.loadFromStorage()
  sessionStorage.removeItem('artrealm_landing_pending_prompt')
  syncAppHeight()
  window.visualViewport?.addEventListener('resize', syncAppHeight)
  // 视频页固定使用视频模型，页面内不再提供图像 / 视频切换。
  settingsStore.setMediaType('video')
  if (!activeVideoModeOptions.value.some((option) => option.value === videoMode.value)) {
    videoMode.value = activeVideoModeOptions.value[0]?.value || 'text2video'
  }
  ensureSupportedAspectRatio()
  ensureSupportedVideoDuration()
  ensureSupportedVideoResolution()
  restoreLandingReferenceImage()
  const initialPrompt = typeof route.query.prompt === 'string' ? route.query.prompt.trim() : ''
  if (initialPrompt) {
    inputText.value = initialPrompt
    await nextTick()
    if (route.query.autosend === '1') {
      handleSend()
    } else {
      promptInputRef.value?.focus()
    }
  }
})

onBeforeUnmount(() => {
  window.visualViewport?.removeEventListener('resize', syncAppHeight)
  releaseUploadedFile(uploadedFile.value)
  releaseUploadedFile(viduStartFrame.value)
  releaseUploadedFile(viduEndFrame.value)
  releaseUploadedFile(motionControlImage.value)
  releaseUploadedFile(motionControlVideo.value)
  releaseUploadedFile(editVideoFile.value)
  releaseUploadedFile(editImageFile.value)
  clearMultimodalAssets()
})



watch(
  () => settingsStore.selectedModel,
  () => {
    const capability = getModelCapability(settingsStore.selectedModel)
    if (!supportsImageReferenceMode.value) {
      imageMode.value = 'text2image'
    }
    // 图片模型切到不支持多图参考的模型时，释放已上传的多图素材，避免残留占用。
    if (settingsStore.mediaType === 'image' && capability?.imageReferenceMode !== 'multi') {
      clearMultimodalAssets()
    }
    const usesModeSwitcher = settingsStore.mediaType === 'video' && ['viduq3-fast', 'minimax-hailuo', 'minimax-h3', 'kling-v26', 'kling-v3', 'kling-omni', 'kling-v4', 'seedance-2'].includes(capability?.videoRequestMode || '')
    if (!usesModeSwitcher) {
      videoMode.value = 'text2video'
      removeViduFrames()
      removeMotionControlFiles()
      clearMultimodalAssets()
    }
    if (!activeVideoModeOptions.value.some((option) => option.value === videoMode.value)) {
      videoMode.value = activeVideoModeOptions.value[0]?.value || 'text2video'
      removeViduFrames()
      removeMotionControlFiles()
      clearMultimodalAssets()
    }

    if (uploadedFile.value?.type === 'image' && !capability?.localUploadInputs?.includes('image')) {
      removeUploadedFile()
    }
    if (uploadedFile.value?.type === 'video' && !capability?.localUploadInputs?.includes('video')) {
      removeUploadedFile()
    }
    if (!showReferenceUrlInput.value) {
      referenceUrl.value = ''
    }
    ensureSupportedAspectRatio()
    ensureSupportedVideoDuration()
    ensureSupportedVideoResolution()
  }
)

watch(
  () => chatStore.messages.length,
  async () => {
    await nextTick()
  }
)

/**
 * 统一的扩图生成入口：先预扩画布，再把扩展后的图片交给 Seedream。
 * 若远程结果图因 CORS 无法读入 Canvas，则自动降级为原图直传 + 扩图指令。
 */
async function runExpandGeneration(source: UploadedFile, ratio: string, prompt = '') {
  const preparedFile = await createExpandedUploadedFile(source, ratio)
  const target = getExpandTargetSize(ratio)

  settingsStore.setMediaType('image')
  settingsStore.selectedModel = EXPAND_MODEL_ID
  settingsStore.aspectRatio = ratio
  imageMode.value = 'expand'

  await generate(
    prompt,
    'image2image',
    EXPAND_MODEL_ID,
    source,
    ratio,
    settingsStore.videoDuration,
    false,
    null,
    settingsStore.videoResolution,
    1,
    {
      imageMode: 'expand',
      generationFile: preparedFile || source,
      imageSize: target.size,
    },
  )

  settingsStore.saveToStorage()
  await nextTick()
}

/** 图层编辑完成后，按新布局重新生成一张图。 */
async function handleLayerRegenerate(layout: MossLayout) {
  if (activeSessionGenerating.value) {
    showErrorMessage('当前还有生成任务进行中，请等它完成后再按新布局生成。')
    return
  }
  const editorState = layerEditorState.value
  layerEditorState.value = null

  if (editorState?.mode === 'global') {
    const baseFile = editorState.baseFile
    if (!baseFile) {
      showErrorMessage('缺少底图，无法生成新图，请重新上传参考图后再试。')
      return
    }
    const model = getModelCapability(editorState.modelName)
      ? editorState.modelName
      : settingsStore.selectedModel

    settingsStore.setMediaType('image')
    settingsStore.selectedModel = model
    settingsStore.aspectRatio = layout.aspectRatio || settingsStore.aspectRatio
    settingsStore.saveToStorage()
    imageMode.value = 'image2image'

    await generate(
      editorState.prompt.trim() || '保持参考图的主体、构图与风格不变，按图层布局调整画面',
      'image2image',
      model,
      baseFile,
      settingsStore.aspectRatio,
      settingsStore.videoDuration,
      false,
      null,
      settingsStore.videoResolution,
      1,
      { mossLayout: layout },
    )

    await nextTick()
    return
  }

  settingsStore.setMediaType('image')
  settingsStore.selectedModel = 'Moss-Image-SFT'
  settingsStore.aspectRatio = layout.aspectRatio || settingsStore.aspectRatio
  settingsStore.saveToStorage()
  imageMode.value = 'text2image'

  await generate(
    `图层调整后重新生成 · ${layout.items.length} 个图层`,
    'text2image',
    'Moss-Image-SFT',
    null,
    settingsStore.aspectRatio,
    settingsStore.videoDuration,
    false,
    null,
    settingsStore.videoResolution,
    1,
    { mossLayout: layout },
  )

  await nextTick()
}

function closeQuickExpand() {
  quickExpandResult.value = null
}

async function confirmQuickExpand(ratio: string) {
  const result = quickExpandResult.value
  if (!result || activeSessionGenerating.value || isQuickExpandRatioSame(ratio)) return

  quickExpandResult.value = null
  const source: UploadedFile = {
    name: `扩图原图-${Date.now()}.png`,
    type: 'image',
    url: result.url,
    size: 0,
    dimensions: result.size,
  }
  await runExpandGeneration(source, ratio)
}

async function handleSend() {
  const prompt = inputText.value.trim()

  if (!isExpandMode.value || prompt) {
    try {
      validatePromptOrThrow(prompt)
    } catch (error) {
      void alertDialog({
        title: '提示词校验失败',
        message: getReadableErrorMessage(error, '提示词校验失败，请修改后重试。'),
      })
      return
    }
  }

  if (!canSend.value || activeSessionGenerating.value) return

  // 扩图链路：原图作为消息展示，预扩画布作为实际模型输入。
  if (isExpandMode.value) {
    const source = uploadedFile.value
    if (!source) return

    // 上传后尺寸读取是异步的；发送前再确认一次，避免目标比例与原图一致。
    let sourceDimensions: ImageDimensions | null = null
    try {
      sourceDimensions = await resolveUploadedImageDimensions(source)
    } catch {
      // 读不到尺寸时不阻塞发送，交给预扩画布按目标比例兜底。
    }
    const targetRatio = parseAspectRatio(settingsStore.aspectRatio)
    const isSameRatio = !!sourceDimensions && !!targetRatio
      && Math.abs(sourceDimensions.width / sourceDimensions.height - targetRatio) < 0.01
    if (isSameRatio || isExpandRatioSame.value) {
      showErrorMessage('当前扩图比例与原图一致，请选择其他比例后再发送。')
      return
    }

    inputText.value = ''
    removeUploadedFile({ revoke: false })
    showMentionMenu.value = false
    referenceUrl.value = ''

    await runExpandGeneration(source, settingsStore.aspectRatio, prompt)
    return
  }

  if (usesViduLikeVideoMode.value && videoMode.value === 'startEnd2video') {
    const isAspectRatioValid = await validateViduFrameAspectRatio()
    if (!isAspectRatioValid) return
  }

  inputText.value = ''

  const file: UploadedFile | UploadedFile[] | null = isImageMultiReferenceMode.value
    ? (multimodalImages.value.length ? [...multimodalImages.value] : null)
    : usesViduLikeVideoMode.value
    ? videoMode.value === 'image2video'
      ? uploadedFile.value
      : videoMode.value === 'motionControl2video' && motionControlImage.value && motionControlVideo.value
        ? [
            {
              ...motionControlImage.value,
              motionControlOptions: {
                keep_original_sound: motionControlKeepOriginalSound.value,
                character_orientation: motionControlCharacterOrientation.value,
              },
            },
            motionControlVideo.value,
          ]
      : videoMode.value === 'endFrame2video'
        ? (uploadedFile.value ? [{ ...uploadedFile.value, purpose: 'end-frame' as const }] : null)
      : videoMode.value === 'startEnd2video' && viduStartFrame.value
        ? (viduEndFrame.value ? [viduStartFrame.value, viduEndFrame.value] : [viduStartFrame.value])

        : videoMode.value === 'referenceImage2video'
          ? (multimodalImages.value.length ? [...multimodalImages.value] : null)
        : videoMode.value === 'multimodalReference2video' || videoMode.value === 'editVideo'

          ? (mentionableAssets.value.length ? [...mentionableAssets.value] : null)


        : videoMode.value === 'subjectReference2video'
          ? (uploadedFile.value ? { ...uploadedFile.value, name: 'Subject Reference' } : null)
          : null

    : uploadedFile.value ||

      (referenceUrl.value.trim()
        ? {
            name: 'Reference URL',
            type: 'image' as const,
            url: referenceUrl.value.trim(),
            size: 0,
          }
        : null)

  removeUploadedFile({ revoke: false })
  removeViduFrames({ revoke: false })
  removeMotionControlFiles({ revoke: false })
  clearMultimodalAssets({ revoke: false })
  showMentionMenu.value = false
  referenceUrl.value = ''

  const primaryFile = Array.isArray(file) ? file[0] : file


  const ioType = resolveGenerateIoType(settingsStore.mediaType, primaryFile)

  await nextTick()
  // 图片沿用默认质量规范 + 风格 + 上传 Skill；视频只用风格 + 上传 Skill，不套图片默认规范。
  const imageSkillContents =
    ioType === 'text2image' || ioType === 'image2image'
      ? skillStore.effectiveSkillContents
      : skillStore.videoSkillContents

  await generate(prompt, ioType, settingsStore.selectedModel, file, settingsStore.aspectRatio, settingsStore.videoDuration, false, imageSkillContents, settingsStore.videoResolution, settingsStore.batchSize, {
    videoGenerationMode: videoMode.value,
    // Moss 开启分层时，先把自然语言拆成布局再出图；生成后可在结果卡片进入图层编辑。
    mossLayoutMode: isMossImageModel.value && mossLayoutEnabled.value && !isExpandMode.value,
  })



  settingsStore.saveToStorage()

  await nextTick()
}

async function handleRegenerate(message: Message) {
  const list = chatStore.messages
  const idx = list.findIndex((m) => m.id === message.id)
  const userMsg = idx > 0 ? list[idx - 1] : null
  if (userMsg && userMsg.type === 'user') {
    const aspectRatio = userMsg.aspectRatio || settingsStore.aspectRatio
    const source = userMsg.uploadedFiles?.[0] || userMsg.uploadedFile

    // 扩图消息重生成：仍以原图为源图，重新走预扩画布 + Seedream 扩图链路。
    if (userMsg.imageMode === 'expand' && source) {
      await runExpandGeneration(source, aspectRatio, userMsg.content)
      return
    }

    const model = userMsg.model || settingsStore.selectedModel
    const duration = userMsg.duration || settingsStore.videoDuration
    const batchSize = userMsg.batchSize || settingsStore.batchSize
    // Moss 分层结果重生成时沿用原布局，避免退化成普通文生图。
    const savedLayout = message.layout || message.generateResults?.find((item) => item.layout)?.layout || null
    await generate(
      userMsg.content,
      resolveGenerateIoType(settingsStore.mediaType, userMsg.uploadedFiles?.[0] || userMsg.uploadedFile),
      model,
      userMsg.uploadedFiles || userMsg.uploadedFile || null,
      aspectRatio,
      duration,
      false,
      message.generateType === 'image'
        ? skillStore.effectiveSkillContents
        : skillStore.videoSkillContents,
      settingsStore.videoResolution,
      batchSize,
      {
        // 沿用发起时的视频方式，避免编辑视频重新生成时被当成普通生成。
        videoGenerationMode: userMsg.videoMode ?? null,
        mossLayout: savedLayout,
      },
    )
    await nextTick()
  }
}
</script>

<style scoped>
.chat-page {
  position: relative;
  display: flex;
  flex-direction: row;
  height: 100dvh;
  padding: 16px 0 18px 18px;
  overflow: hidden;
  background: transparent;
  isolation: isolate;
  --surface-glass: rgba(255, 255, 255, 0.76);
  --surface-glass-strong: rgba(255, 255, 255, 0.92);
  --surface-line: rgba(255, 255, 255, 0.78);
  --surface-shadow: 0 24px 70px rgba(15, 23, 42, 0.10);
  --surface-shadow-soft: 0 12px 34px rgba(15, 23, 42, 0.07);
}

.chat-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 16% 10%, rgba(255, 255, 255, 0.92), transparent 0 23%),
    radial-gradient(circle at 76% 18%, rgba(10, 132, 255, 0.14), transparent 0 20%),
    radial-gradient(circle at 45% 92%, rgba(17, 24, 39, 0.06), transparent 0 24%),
    linear-gradient(135deg, rgba(252, 253, 255, 0.96), rgba(238, 243, 249, 0.94) 52%, rgba(246, 247, 249, 0.98));
}

.chat-page::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.42;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.36) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.30) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(circle at 50% 48%, var(--sf-ink), transparent 74%);
}

.workspace-shell,
.session-sidebar,
.workspace-main,
.chat-stage,
.composer-dock {
  position: relative;
}

.workspace-shell {
  width: 100%;
  height: calc(100dvh - 34px);
  margin: 0 auto;
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  gap: 18px;
  min-height: 0;
  z-index: 1;
}

.single-session-layout {
  grid-template-columns: 224px minmax(0, 1fr);
}

.session-sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 16px;
  min-height: 0;
  padding: 16px 14px 14px;
  border-radius: 28px;
  border: 1px solid var(--surface-line);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(250, 251, 253, 0.70));
  box-shadow: var(--surface-shadow-soft);
  backdrop-filter: blur(28px) saturate(135%);
}

.single-session-sidebar {
  justify-content: space-between;
}

.single-session-top {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.brand-lockup {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  width: 100%;
  padding: 6px 4px;
}

.brand-title {
  font-size: clamp(22px, 1.7vw, 28px);
  font-weight: 800;
  letter-spacing: -0.06em;
  line-height: 1;
  font-family: "Georgia", "Times New Roman", serif;
  font-style: italic;
  background: var(--sf-ink);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.single-session-card-panel {
  cursor: default;
}

.single-session-card-head {
  margin-bottom: 10px;
}

/* 简易模式说明卡片 */
.mode-intro-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 12px 14px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  background:
    linear-gradient(160deg, rgba(255, 255, 255, 0.92), rgba(244, 247, 251, 0.74)),
    radial-gradient(circle at 0 0, rgba(10, 132, 255, 0.12), transparent 38%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 10px 24px rgba(15, 23, 42, 0.05);
}

.mode-intro-badge {
  align-self: flex-start;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--sf-ink);
  background: var(--color-theme-gradient);
  box-shadow: 0 8px 18px rgba(36, 31, 25, 0.08);
}

.mode-intro-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.65;
  color: rgba(71, 85, 105, 0.86);
}

/* 无限画布：黑色平面按钮 + NEW 标志 */

.canvas-entry-btn {

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 18px;
  border: 0;
  border-radius: 16px;
  cursor: pointer;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--sf-ink);
  background: var(--sf-surface-3);
  transition: background var(--transition-base);
}

.canvas-entry-btn:hover {
  background: var(--sf-surface-3);
}

.canvas-entry-text {
  position: relative;
  z-index: 1;
}

.canvas-entry-new {
  display: inline-flex;
  align-items: center;
  z-index: 2;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  line-height: 1.2;
  color: rgba(36, 31, 25, 0.86);
  background: rgba(36, 31, 25, 0.16);
}




.sidebar-secondary-btn,
.sidebar-danger-btn,
.switch-btn,
.composer-summary,
.summary-toggle,
.ratio-current-btn,
.upload-btn,
.icon-btn,
.polish-btn,
.send-btn,
.text-btn,
.reference-input {
  transition:
    transform var(--transition-base),
    background var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base),
    opacity var(--transition-base);
}

.workspace-main {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 14px;
  overflow: hidden;
}

.chat-stage,
.composer-dock,
.session-card {
  border: 1px solid var(--surface-line);
  background: var(--surface-glass);
  box-shadow: var(--surface-shadow-soft);
  backdrop-filter: blur(28px) saturate(140%);
  background-clip: padding-box;
}

.status-label,
.session-meta-line.subtle,
.empty-kicker,
.empty-copy,
.duration-label {
  color: rgba(71, 85, 105, 0.78);
}

.chat-stage {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 32px;
  padding: 12px;
  overflow: hidden;
}

.chat-stage {
  border-bottom-color: rgba(36, 31, 25, 0.78);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(250, 251, 253, 0.74)),
    radial-gradient(circle at 50% 0%, rgba(10, 132, 255, 0.06), transparent 36%);
}

.chat-area {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 12px 8px 12px 4px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  margin: auto;
  max-width: 560px;
  padding: 44px 34px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.74);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.88);
}

.empty-kicker {
  margin: 0 0 8px;
  text-transform: uppercase;
  letter-spacing: 0.28em;
  font-size: 12px;
}

.empty-state h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 46px);
  line-height: 1.06;
  letter-spacing: -0.05em;
}

.empty-copy {
  margin: 16px 0 0;
  font-size: 15px;
  line-height: 1.7;
}

.composer-dock {
  flex-shrink: 0;
  border-radius: 30px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top-color: rgba(36, 31, 25, 0.76);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.88)),
    radial-gradient(circle at 12% 0%, rgba(10, 132, 255, 0.08), transparent 35%);
  box-shadow: var(--surface-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.90);
  overflow: visible;
}

.composer-console {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.composer-summary {
  width: 100%;
  min-height: 44px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 7px 8px 7px 12px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 22px;
  text-align: left;
  color: rgba(15, 23, 42, 0.88);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 252, 0.82));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 8px 24px rgba(15, 23, 42, 0.05);
}

.composer-summary:hover {
  border-color: rgba(100, 116, 139, 0.30);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.96), 0 12px 28px rgba(15, 23, 42, 0.07);
}

.summary-kicker {
  flex: 0 0 auto;
  margin-right: 2px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(71, 85, 105, 0.64);
}

.summary-chip {
  min-height: 26px;
  display: inline-flex;
  align-items: center;
  max-width: min(260px, 100%);
  padding: 0 9px;
  border: 1px solid rgba(148, 163, 184, 0.20);
  border-radius: 999px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 750;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.summary-chip-strong {
  border-color: transparent;
  color: var(--sf-ink);
  background: var(--sf-surface-3);
}

.summary-chip.attention {
  border-color: rgba(245, 158, 11, 0.28);
  color: rgba(146, 64, 14, 0.95);
  background: rgba(255, 251, 235, 0.92);
}

.summary-chip-skill {
  border-color: rgba(10, 132, 255, 0.22);
  color: rgba(10, 102, 194, 0.96);
  background: rgba(10, 132, 255, 0.08);
}

.summary-spacer {
  flex: 1 1 24px;
}

.summary-toggle {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 999px;
  color: rgba(36, 31, 25, 0.96);
  font-size: 11px;
  font-weight: 800;
  background: var(--color-theme-gradient);
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.14);
}

.composer-control-panel {
  max-height: min(42vh, 420px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 9px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(248, 250, 252, 0.78), rgba(255, 255, 255, 0.62));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.86);
}

.composer-meta-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}

.composer-meta-row-top {
  align-items: flex-start;
}

.dock-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.dock-pills-primary {
  flex: 1 1 auto;
  min-width: 0;
}

.meta-pill {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 7px 5px 10px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  background: rgba(255, 255, 255, 0.62);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.82), 0 6px 14px rgba(15, 23, 42, 0.04);
}

.meta-pill-type {
  flex: 0 0 auto;
}

.meta-pill-model {
  flex: 1 1 220px;
}

.meta-pill-ratio {
  flex: 0 0 auto;
}

.meta-pill-duration {
  flex: 0 0 auto;
}

.meta-pill-label {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: rgba(51, 65, 85, 0.86);
}

.media-switch,
.video-mode-switch,
.ratio-selector,
.model-slot,
.duration-selector,
.upload-mini-row,
.reference-input {
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.84),
    0 1px 2px rgba(15, 23, 42, 0.04);
}

.media-switch,
.video-mode-switch,
.ratio-selector,
.duration-selector {
  position: relative;
}

.media-switch::after,
.video-mode-switch::after,
.ratio-selector::after,
.duration-selector::after {
  content: '';
  position: absolute;
  right: -5px;
  top: 7px;
  bottom: 7px;
  width: 1px;
  background: rgba(148, 163, 184, 0.28);
}

.duration-slot:last-child .duration-selector::after,
.dock-pills-primary > :last-child::after {
  display: none;
}

.media-switch,
.video-mode-switch {
  display: inline-flex;
  flex-wrap: wrap;
  max-width: 100%;
  padding: 2px;
  gap: 2px;
}

.compact-switch {
  padding: 2px;
  border-radius: 14px;
}

.switch-btn,
.sidebar-secondary-btn,
.sidebar-danger-btn,
.polish-btn,
.send-btn,
.icon-btn,
.upload-btn,
.text-btn,
.ratio-current-btn {
  border: 0;
  cursor: pointer;
}

.switch-btn {
  min-width: 88px;
  height: 40px;
  padding: 0 16px;
  border-radius: 14px;
  background: transparent;
  color: rgba(15, 23, 42, 0.72);
  font-weight: 600;
}

.compact-switch .switch-btn {
  min-width: 56px;
  height: 28px;
  padding: 0 8px;
  border-radius: 10px;
  font-size: 11px;
  white-space: nowrap;
}

.switch-btn.active {
  background: var(--color-theme-gradient);
  color: var(--sf-ink);
  box-shadow: 0 12px 26px rgba(36, 31, 25, 0.08);
}

.ratio-selector {
  position: relative;
  border-color: rgba(100, 116, 139, 0.42);
  background: rgba(248, 250, 252, 0.92);
  flex: 0 0 auto;
  padding: 2px;
  border-radius: 14px;
  z-index: 2;
}

.ratio-selector.open,
.ratio-selector:focus-within,
.duration-selector:focus-within,
.media-switch:focus-within {
  border-color: rgba(36, 31, 25, 0.30);
  box-shadow:
    inset 0 1px 0 rgba(36, 31, 25, 0.10),
    0 0 0 3px rgba(36, 31, 25, 0.06),
    0 8px 18px rgba(15, 23, 42, 0.06);
}

.ratio-selector.open {
  z-index: 30;
}

.ratio-current-btn {
  min-width: 112px;
  height: 28px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.88);
}

.ratio-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.ratio-current-box,
.ratio-option-box {
  display: inline-block;
  flex: 0 0 auto;
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid rgba(15, 23, 42, 0.18);
  background: rgba(15, 23, 42, 0.06);
}

.ratio-current-box {
  transform: scale(0.72);
  transform-origin: center;
}

.ratio-caret,
.duration-caret {
  color: rgba(71, 85, 105, 0.7);
}

.ratio-lock-note {
  margin: 6px 2px 0;
  font-size: 11px;
  line-height: 1.45;
  color: rgba(100, 116, 139, 0.82);
}

.meta-pill-ratio.ratio-locked .ratio-selector {
  opacity: 0.62;
}

.ratio-current-btn:disabled {
  cursor: default;
}

.ratio-dropdown {
  position: absolute;
  right: 0;
  bottom: calc(100% + 10px);
  width: min(420px, calc(100vw - 40px));
  min-width: max(300px, 100%);
  max-height: min(220px, calc(100dvh - 220px));
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
  z-index: 31;
}

.ratio-dropdown-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 52px;
  padding: 6px 6px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.ratio-dropdown-item.active {
  background: rgba(10, 132, 255, 0.10);
}

.ratio-option-preview {
  width: 32px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.duration-selector,
.upload-mini-row {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  min-height: 36px;
  max-width: 100%;
  min-width: 0;
  padding: 4px 12px;
}

.duration-selector {
  border-color: rgba(100, 116, 139, 0.42);
  background: rgba(248, 250, 252, 0.92);
  min-height: 34px;
  padding: 0 10px;
  border-radius: 14px;
}

.duration-select-wrap {
  position: relative;
}

.duration-select {
  appearance: none;
  border: 0;
  background: transparent;
  min-width: 0;
  padding-right: 20px;
  font: inherit;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.88);
  outline: none;
}

.duration-caret {
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}

.reference-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  align-items: stretch;
}

/* 上传成功态：绿色描边 + 缩略图，避免文件名与按钮挤压排版 */
.upload-mini-row.has-file,
.upload-card-row.has-file,
.subject-reference-card.has-file {
  border-color: rgba(52, 211, 153, 0.38);
  background: rgba(52, 211, 153, 0.07);
}

.upload-mini-row.has-file .upload-icon-btn {
  background: rgba(52, 211, 153, 0.14);
  border-color: rgba(52, 211, 153, 0.4);
  color: var(--sf-success);
}

.upload-thumb {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  object-fit: cover;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(15, 23, 42, 0.06);
}

.upload-thumb-file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}

/* 上传行内的“移除”按钮：小胶囊 + 删除态 */
.upload-mini-row .text-btn,
.subject-reference-card .text-btn {
  flex: 0 0 auto;
  min-height: 26px;
  padding: 0 10px;
  border: 1px solid rgba(248, 113, 113, 0.30);
  border-radius: 999px;
  background: rgba(248, 113, 113, 0.08);
  color: rgba(248, 113, 113, 0.92);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.upload-mini-row .text-btn::before,
.subject-reference-card .text-btn::before {
  content: '✕';
  margin-right: 4px;
  font-size: 9px;
  opacity: 0.85;
}

.upload-mini-row .text-btn:hover,
.subject-reference-card .text-btn:hover {
  border-color: rgba(248, 113, 113, 0.52);
  background: rgba(248, 113, 113, 0.16);
  color: var(--sf-terra-strong);
}

/* 上传后的「图像编辑」入口：全局图片模型把整张参考图当作底图。 */
.image-edit-btn {
  flex: 0 0 auto;
  min-height: 26px;
  padding: 0 11px;
  border: 1px solid rgba(36, 31, 25, 0.42);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.12);
  color: rgba(36, 31, 25, 0.95);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.image-edit-btn:hover {
  border-color: rgba(36, 31, 25, 0.7);
  background: rgba(36, 31, 25, 0.2);
}

.image-edit-btn::before {
  content: '✎';
  margin-right: 4px;
  font-size: 10px;
}

.image-edit-entry-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.image-edit-entry-hint {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(36, 31, 25, 0.45);
}

.image-edit-entry-note {
  margin: 10px 0 0;
}

.skill-control-row {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding-top: 2px;
}

/* 运镜指令：独占一行，弹出框向上展开，不再挤压上方胶囊行 */
.camera-guide-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}


.motion-control-note strong {

  padding: 0 2px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.9);
}

.motion-control-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.motion-control-note {
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.9);
}


.motion-control-note small {

  margin-left: 6px;
  font-size: 10px;
  font-weight: 500;
  color: rgba(71, 85, 105, 0.72);
}

.motion-control-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.motion-control-option {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 14px;
  background: rgba(248, 250, 252, 0.86);
}

.motion-control-option-label {
  font-size: 11px;
  font-weight: 800;
  color: rgba(51, 65, 85, 0.86);
}

.motion-control-select {
  border: 0;
  outline: none;
  background: transparent;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: rgba(15, 23, 42, 0.88);
}

/* 主体参考视频：上传主体图卡片（上传按钮 + 说明 + 文件名/URL） */
.subject-reference-card {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.86);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.subject-upload-btn {
  min-height: 38px;
  display: inline-flex;

  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border: 0;
  border-radius: 14px;
  background: var(--color-theme-gradient);
  color: var(--sf-ink);
  font-weight: 700;
  cursor: pointer;
}

.subject-upload-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.18);
}

.subject-reference-copy {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.upload-copy {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.upload-label {
  font-size: 12px;
  font-weight: 800;
  line-height: 1.1;
  color: rgba(15, 23, 42, 0.9);
}

.upload-hint {
  font-size: 10px;
  line-height: 1.1;
  color: rgba(71, 85, 105, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.frame-upload-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
}

.frame-upload-card {
  width: 100%;
  justify-content: flex-start;
}

.multimodal-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.multimodal-note {
  margin: 0;
  padding: 0 2px;
  font-size: 12px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.9);
}

.multimodal-note small {
  margin-left: 6px;
  font-size: 10px;
  font-weight: 500;
  color: rgba(71, 85, 105, 0.72);
}

.multimodal-note b {
  color: var(--color-accent-strong);
}

.multimodal-groups {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.multimodal-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px 10px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 16px;
  background: rgba(248, 250, 252, 0.86);
}

.multimodal-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.multimodal-group-title {
  font-size: 11px;
  font-weight: 800;
  color: rgba(51, 65, 85, 0.9);
}

.multimodal-group-count {
  font-size: 10px;
  font-weight: 700;
  color: rgba(71, 85, 105, 0.66);
}

.multimodal-thumb-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.multimodal-thumb {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.4);
  background: rgba(255, 255, 255, 0.7);
}

.multimodal-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.multimodal-thumb-file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.multimodal-file-icon {
  font-size: 20px;
}

.multimodal-thumb-tag {
  position: absolute;
  left: 2px;
  bottom: 2px;
  padding: 0 4px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 800;
  color: var(--sf-ink);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 3px rgba(36, 31, 25, 0.1);
}

.multimodal-thumb-remove {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  color: var(--sf-ink);
  background: rgba(255, 255, 255, 0.92);
}

.multimodal-add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 1px dashed var(--sf-line-strong);
  border-radius: 12px;
  background: var(--sf-surface-2);
  color: rgba(36, 31, 25, 0.90);
  font-size: 18px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: background var(--transition-base), border-color var(--transition-base), color var(--transition-base);
}

.multimodal-add-btn:hover {
  border-color: rgba(36, 31, 25, 0.48);
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

/* @ 引用菜单 */
.mention-menu {
  position: absolute;
  left: 8px;
  bottom: calc(100% + 6px);
  z-index: 40;
  max-height: 220px;
  min-width: 180px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  background: rgba(255, 255, 255, 0.97);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.mention-item:hover,
.mention-item.active {
  background: rgba(10, 132, 255, 0.14);
}

.mention-item-tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 800;
  color: var(--sf-ink);
  background: var(--sf-ink);
}

.mention-item-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.86);
}

.file-input {
  display: none;
}


.upload-icon-btn,
.icon-btn,
.send-icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.upload-icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
}

.icon-btn {
  background: rgba(255, 255, 255, 0.58);
}

.upload-btn {
  border: 1px solid rgba(36, 31, 25, 0.22);
  background: rgba(36, 31, 25, 0.10);
  color: rgba(36, 31, 25, 0.92);
}

.upload-btn:hover {
  border-color: rgba(36, 31, 25, 0.38);
  background: rgba(36, 31, 25, 0.16);
}

.icon-btn:hover,
.text-btn:hover,
.polish-btn:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.46);
}

.pill-filename {
  flex: 0 1 auto;
  min-width: 0;
  max-width: min(180px, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.reference-input {
  min-width: min(420px, 100%);
  min-height: 34px;
  padding: 0 12px;
  outline: none;
  font-size: 13px;
}

.input-shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  padding: 8px 8px 8px 12px;
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.20);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.78));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.92), 0 10px 24px rgba(15, 23, 42, 0.05);
}

.input-shell:focus-within {
  border-color: rgba(100, 116, 139, 0.42);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.86));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.96), 0 0 0 4px rgba(100, 116, 139, 0.08), 0 14px 30px rgba(15, 23, 42, 0.08);
}

.compact-model-slot {
  min-width: min(200px, 100%);
  border: 0;
  background: transparent;
}

.input-shell.expanded textarea {
  min-height: 320px;
}

.input-shell textarea {
  width: 100%;
  min-height: 52px;
  max-height: 152px;
  box-sizing: border-box;
  margin: 0;
  padding: 7px 6px;
  border: 0;
  resize: vertical;
  background: transparent;
  outline: none;
  font: inherit;
  line-height: 1.45;
  color: rgba(15, 23, 42, 0.92);
}

/* 输入框上方「已引用素材」彩色标签行：用不同渐变色区分图片/视频/音频 */
.referenced-mentions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
}

.referenced-mentions-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(71, 85, 105, 0.8);
}

.referenced-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--sf-ink);
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.16);
}

.referenced-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.28);
}

/* 图片：紫色系 */
.referenced-chip-image {
  background: var(--sf-ink);
}

/* 视频：橙红色系 */
.referenced-chip-video {
  background: var(--sf-ink);
}

/* 音频：青绿色系 */
.referenced-chip-audio {
  background: var(--sf-ink);
}

.composer-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  align-self: flex-end;
  padding-left: 4px;
}

/* 图像/视频模式：对话框内「上传 Skill」按钮 */
.skill-upload-btn-inline {
  min-height: 34px;
  max-width: 150px;
  padding: 0 12px;
  border: 1px solid rgba(10, 132, 255, 0.24);
  border-radius: 14px;
  background: rgba(10, 132, 255, 0.06);
  color: rgba(10, 132, 255, 0.95);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-upload-btn-inline:hover {
  background: rgba(10, 132, 255, 0.16);
}

.skill-upload-btn-inline.active {
  color: var(--sf-ink);
  border-color: transparent;
  background: var(--color-theme-gradient);
}

.skill-clear-inline {
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  color: rgba(153, 27, 27, 0.9);
  background: rgba(153, 27, 27, 0.1);
}


.icon-btn svg,
.send-gradient-icon svg {
  width: 18px;
  height: 18px;
}

.polish-btn {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 14px;
  font-weight: 600;
}

.sidebar-secondary-btn,
.sidebar-danger-btn {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 16px;
  font-weight: 600;
}

.sidebar-secondary-btn,
.polish-btn,
.icon-btn,
.send-btn,
.text-btn {
  background: rgba(255, 255, 255, 0.62);
  color: rgba(15, 23, 42, 0.9);
}

.sidebar-danger-btn {
  background: rgba(153, 27, 27, 0.08);
  color: rgba(153, 27, 27, 0.92);
}

.send-btn.ready {
  background: var(--color-theme-gradient);
  color: rgba(36, 31, 25, 0.98);
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.20), 0 0 0 1px rgba(255, 255, 255, 0.42) inset;
}

.send-btn.ready .send-gradient-icon {
  color: rgba(8, 8, 10, 0.9);
}

.send-btn.ready .send-gradient-icon svg {
  color: currentColor;
}

.send-btn.ready .send-gradient-icon path {
  stroke: currentColor;
}

.send-btn:disabled,
.polish-btn:disabled,
.sidebar-secondary-btn:disabled,
.sidebar-danger-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.session-card {
  padding: 16px;
  border-radius: 24px;
}

.session-card-head,
.session-card-meta,
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-title {
  font-size: 18px;
}

@media (max-width: 1100px) {
  .workspace-shell,
  .single-session-layout {
    grid-template-columns: 1fr;
    height: calc(100dvh - 34px);
    min-height: 0;
  }

  .session-sidebar {
    order: 2;
    min-height: auto;
  }

  .workspace-main {
    order: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }

}

@media (max-width: 720px) {
  .chat-page {
    height: 100dvh;
    padding: 10px;
  }

  .workspace-shell {
    gap: 12px;
  }

  .composer-meta-row,
  .dock-pills,
  .composer-actions,
  .sidebar-footer {
    width: 100%;
  }

  .input-shell {
    grid-template-columns: 1fr;
  }

  .dock-pills-primary,
  .meta-pill,
  .compact-model-slot {
    width: 100%;
  }

  .composer-actions {
    justify-content: space-between;
  }

  .composer-summary {
    align-items: flex-start;
  }

  .summary-kicker,
  .summary-spacer {
    display: none;
  }

  .summary-chip {
    max-width: 100%;
  }

  .summary-toggle {
    width: 100%;
  }

  .composer-control-panel {
    max-height: min(52vh, 460px);
  }

  .reference-input {
    min-width: 100%;
  }

  .frame-upload-grid {
    grid-template-columns: 1fr;
  }

  .subject-reference-card {
    flex-direction: column;
    align-items: stretch;
  }

  .subject-reference-url {
    min-width: 100%;
  }


  .video-mode-switch {
    width: 100%;
    overflow-x: auto;
  }

  .video-mode-switch .switch-btn {
    width: auto;
    flex: 1 0 max-content;
  }

  .ratio-selector,
  .ratio-current-btn {
    width: 100%;
  }

  .meta-pill-ratio {
    flex-wrap: wrap;
  }

  .ratio-dropdown {
    left: 0;
    right: auto;
    min-width: 100%;
    width: min(100%, calc(100vw - 20px));
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-height: min(260px, calc(100dvh - 190px));
  }
}
.chat-page {
  padding: 14px;
  color: rgba(36, 31, 25, 0.92);
  background: var(--sf-surface);
  --surface-glass: var(--sf-surface);
  --surface-glass-strong: var(--sf-surface);
  --surface-line: var(--sf-line);
  --surface-shadow: 0 8px 28px rgba(36, 31, 25, 0.06);
  --surface-shadow-soft: 0 4px 18px rgba(36, 31, 25, 0.05);
}

.chat-page::before {
  background:
    linear-gradient(rgba(36, 31, 25, 0.052) 1px, transparent 1px),
    linear-gradient(90deg, rgba(36, 31, 25, 0.048) 1px, transparent 1px);
  background-size: 72px 72px;
  opacity: 1;
  mask-image: radial-gradient(circle at 50% 40%, var(--sf-ink) 0 34%, transparent 78%);
}

.chat-page::after {
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.94));
  opacity: 1;
  mask-image: none;
}

.workspace-shell,
.single-session-layout {
  width: min(100%, 1440px);
  grid-template-columns: 248px minmax(0, 1fr);
  gap: 14px;
}

.session-sidebar {
  padding: 16px;
  border-color: rgba(36, 31, 25, 0.11);
  background: rgba(36, 31, 25, 0.065);
  box-shadow: var(--surface-shadow-soft), inset 0 1px 0 rgba(36, 31, 25, 0.09);
  backdrop-filter: blur(28px) saturate(145%);
}

.brand-lockup {
  padding: 0;
}

.brand-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--font-family-display);
  font-size: 22px;
  font-style: normal;
  font-weight: 700;
  letter-spacing: -0.05em;
  color: var(--sf-ink);
  background: none;
}

.brand-title-logo {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  object-fit: cover;
  box-shadow: 0 0 32px rgba(36, 31, 25, 0.22);
}

.mode-intro-card {
  margin-top: 14px;
  padding: 14px;
  border-color: rgba(36, 31, 25, 0.11);
  background:
    radial-gradient(circle at 18% 0%, rgba(36, 31, 25, 0.14), transparent 0 42%),
    rgba(36, 31, 25, 0.075);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.10);
}

.mode-intro-badge,
.canvas-entry-new {
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-surface);
  box-shadow: 0 12px 34px rgba(36, 31, 25, 0.10);
}

.mode-intro-desc,
.empty-copy {
  color: rgba(36, 31, 25, 0.54);
}

.workspace-main {
  border: 1px solid rgba(36, 31, 25, 0.10);
  border-radius: 34px;
  background:
    radial-gradient(circle at 50% 0%, rgba(36, 31, 25, 0.105), transparent 0 28%),
    rgba(36, 31, 25, 0.052);
  box-shadow: var(--surface-shadow), inset 0 1px 0 rgba(36, 31, 25, 0.08);
  overflow: hidden;
  backdrop-filter: blur(24px) saturate(140%);
}

.chat-stage {
  padding: 20px 20px 0;
}

.chat-area {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.empty-state {
  width: min(100%, 780px);
  margin: clamp(42px, 8vh, 96px) auto 0;
  padding: 0;
  text-align: center;
}

.empty-kicker {
  color: rgba(36, 31, 25, 0.45);
  letter-spacing: 0.18em;
}

.empty-state h1 {
  max-width: 11ch;
  margin: 14px auto 0;
  color: var(--sf-ink);
  font-family: var(--font-family-display);
  font-size: clamp(52px, 8vw, 104px);
  font-weight: 600;
  line-height: 0.9;
  letter-spacing: -0.08em;
}

.empty-copy {
  max-width: 560px;
  margin: 24px auto 0;
  font-size: 15px;
}

.composer-dock {
  padding: 0 20px 20px;
}

.composer-console {
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 28px;
  background: rgba(36, 31, 25, 0.075);
  box-shadow: 0 24px 90px rgba(36, 31, 25, 0.08), inset 0 1px 0 rgba(36, 31, 25, 0.11);
  backdrop-filter: blur(28px) saturate(145%);
}

.composer-summary {
  color: rgba(36, 31, 25, 0.78);
  background: transparent;
}

.summary-kicker,
.meta-pill-label {
  color: rgba(36, 31, 25, 0.42);
}

.summary-chip,
.meta-pill {
  border-color: rgba(36, 31, 25, 0.10);
  background: rgba(36, 31, 25, 0.075);
  color: rgba(36, 31, 25, 0.72);
}

.summary-chip-strong,
.switch-btn.active,
.mode-switch-btn.active,
.ratio-current-btn,
.send-btn.ready,
.canvas-entry-btn {
  background: var(--sf-ink);
  color: var(--sf-surface);
  border-color: transparent;
}

.composer-control-panel {
  border-top-color: rgba(36, 31, 25, 0.10);
  background: rgba(255, 255, 255, 0.9);
}

.switch-btn,
.upload-mini-row,
.upload-card-row,
.reference-input,
.motion-control-panel,
.subject-reference-card,
.multimodal-panel,
.skill-control-row,
.ratio-dropdown {
  border-color: rgba(36, 31, 25, 0.11);
  background: rgba(36, 31, 25, 0.07);
  color: rgba(36, 31, 25, 0.76);
}

.switch-btn:not(.active):hover,
.upload-mini-row:hover,
.upload-card-row:hover {
  background: rgba(36, 31, 25, 0.11);
  color: var(--sf-ink);
}

.input-shell {
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 24px;
  background: var(--sf-surface);
  box-shadow: inset 0 1px 6px rgba(36, 31, 25, 0.05);
}

.input-shell textarea {
  color: var(--sf-ink);
}

.input-shell textarea::placeholder,
.upload-hint,
.pill-filename,
.summary-toggle {
  color: rgba(36, 31, 25, 0.42);
}

.icon-btn,
.polish-btn,
.text-btn,
.sidebar-secondary-btn,
.skill-upload-btn-inline {
  border: 1px solid rgba(36, 31, 25, 0.11);
  background: rgba(36, 31, 25, 0.08);
  color: rgba(36, 31, 25, 0.76);
}

.icon-btn:hover,
.polish-btn:not(:disabled):hover,
.text-btn:hover,
.sidebar-secondary-btn:hover,
.skill-upload-btn-inline:hover {
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-ink);
}

.send-btn.ready {
  box-shadow: 0 16px 36px rgba(36, 31, 25, 0.10);
}

.sidebar-footer {
  gap: 10px;
}

:deep(.message .avatar-icon),
:deep(.message .bubble) {
  border-color: rgba(36, 31, 25, 0.11);
  background: rgba(36, 31, 25, 0.08);
  color: rgba(36, 31, 25, 0.9);
  box-shadow: 0 14px 44px rgba(36, 31, 25, 0.08), inset 0 1px 0 rgba(36, 31, 25, 0.08);
  backdrop-filter: blur(20px) saturate(135%);
}

:deep(.result-card) {
  border-color: rgba(36, 31, 25, 0.14);
  background: var(--sf-surface);
  color: rgba(36, 31, 25, 0.9);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.04);
  backdrop-filter: blur(20px) saturate(135%);
}

:deep(.message.user .bubble) {
  border-color: rgba(36, 31, 25, 0.26);
  background: var(--sf-surface-3);
  color: var(--sf-ink);
}

:deep(.content p),
:deep(.result-title),
:deep(.meta-pair dd) {
  color: rgba(36, 31, 25, 0.88);
}

:deep(.message.user .content p),
:deep(.message.user .time) {
  color: rgba(36, 31, 25, 0.94);
}

:deep(.message.system .bubble) {
  background: rgba(36, 31, 25, 0.075);
}

:deep(.meta-pair),
:deep(.provider-pill) {
  background: rgba(36, 31, 25, 0.08);
  color: rgba(36, 31, 25, 0.76);
  box-shadow: inset 0 0 0 1px rgba(36, 31, 25, 0.08);
}

:deep(.media-frame) {
  background:
    radial-gradient(circle at 50% 20%, rgba(36, 31, 25, 0.12), transparent 55%),
    var(--sf-surface-3);
  box-shadow: inset 0 0 0 1px rgba(36, 31, 25, 0.08);
}

:deep(.meta-pair dt),
:deep(.time) {
  color: rgba(36, 31, 25, 0.42);
}

.chat-stage {
  border-color: rgba(36, 31, 25, 0.10);
  background: transparent;
  box-shadow: none;
}

.empty-state {
  border-color: rgba(36, 31, 25, 0.12);
  background: rgba(36, 31, 25, 0.07);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.08);
}

.composer-dock {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
}

.composer-summary {
  border-color: rgba(36, 31, 25, 0.11);
  background: rgba(36, 31, 25, 0.075);
}

.media-switch,
.video-mode-switch,
.ratio-selector,
.model-slot,
.duration-selector {
  border-color: rgba(36, 31, 25, 0.26);
  background: rgba(36, 31, 25, 0.07);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.08);
}

.ratio-selector {
  border-color: transparent;
}

.motion-control-option {
  border-color: rgba(36, 31, 25, 0.26);
  background: rgba(36, 31, 25, 0.07);
}

.motion-control-option-label,
.motion-control-note,
.multimodal-note,
.upload-label {
  color: rgba(36, 31, 25, 0.82);
}

.motion-control-note small,
.multimodal-note small,
.upload-hint {
  color: rgba(36, 31, 25, 0.46);
}

.motion-control-select,
.duration-select {
  color: rgba(36, 31, 25, 0.88);
}

.ratio-caret,
.duration-caret {
  color: rgba(36, 31, 25, 0.5);
}

.summary-toggle {
  color: rgba(36, 31, 25, 0.88);
  background: rgba(36, 31, 25, 0.12);
  border: 1px solid rgba(36, 31, 25, 0.16);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.10);
  backdrop-filter: blur(18px) saturate(140%);
}

.send-btn.ready {
  background: var(--color-action-bg);
  color: var(--color-action-text);
  border-color: var(--color-action-border);
  box-shadow: 0 8px 18px rgba(36, 31, 25, 0.14);
}

.send-btn.ready .send-gradient-icon {
  color: rgba(8, 8, 10, 0.9);
}

.input-shell:focus-within {
  border-color: rgba(36, 31, 25, 0.30);
  background: var(--sf-surface);
  box-shadow: inset 0 1px 6px rgba(36, 31, 25, 0.05), 0 0 0 3px rgba(36, 31, 25, 0.06);
}

:deep(.model-selector select) {
  background: rgba(36, 31, 25, 0.08);
  color: rgba(36, 31, 25, 0.88);
  border-color: rgba(36, 31, 25, 0.12);
}

:deep(.model-selector .select-icon) {
  color: rgba(36, 31, 25, 0.58);
}

.ratio-current-btn {
  background: rgba(36, 31, 25, 0.08);
  color: rgba(36, 31, 25, 0.86);
}

.ratio-dropdown-item {
  color: rgba(36, 31, 25, 0.78);
}

.ratio-dropdown-item.active {
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.ratio-current-box,
.ratio-option-box {
  border-color: transparent;
  background: rgba(36, 31, 25, 0.08);
}

.media-switch:focus-within,
.video-mode-switch:focus-within,
.model-slot:focus-within,
.duration-selector:focus-within {
  border-color: rgba(36, 31, 25, 0.34);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.10), 0 0 0 3px rgba(36, 31, 25, 0.06);
}

.ratio-selector.open,
.ratio-selector:focus-within {
  border-color: transparent;
  box-shadow: none;
}

.composer-control-panel.ratio-open {
  overflow: visible;
}

.skill-control-row {
  border: 0;
  background: transparent;
  box-shadow: none;
}

.skill-upload-btn-inline {
  background: transparent;
  border-color: rgba(36, 31, 25, 0.26);
  color: rgba(36, 31, 25, 0.78);
}

.skill-upload-btn-inline:hover {
  background: rgba(36, 31, 25, 0.08);
  color: var(--sf-ink);
}

.skill-upload-btn-inline.active {
  background: var(--color-action-bg);
  border-color: var(--color-action-border);
  color: var(--color-action-text);
}

.composer-summary,
.composer-control-panel,
.composer-console,
.meta-pill,
.media-switch,
.video-mode-switch,
.ratio-selector,
.model-slot,
.duration-selector,
.upload-mini-row,
.upload-card-row,
.reference-input,
.motion-control-panel,
.motion-control-option,
.subject-reference-card,
.multimodal-panel,
.skill-control-row,
.ratio-dropdown {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.composer-summary {
  background: var(--sf-surface-2);
  border-color: transparent;
  box-shadow: none;
}

.composer-control-panel {
  background: var(--sf-surface);
  border-color: transparent;
  box-shadow: none;
}

.composer-console {
  background: var(--sf-surface);
  border-color: transparent;
  box-shadow: 0 12px 32px rgba(36, 31, 25, 0.08);
}

.meta-pill,
.media-switch,
.video-mode-switch,
.ratio-selector,
.model-slot,
.duration-selector,
.upload-mini-row,
.upload-card-row,
.reference-input,
.motion-control-panel,
.motion-control-option,
.subject-reference-card,
.multimodal-panel {
  background: var(--sf-surface-2);
  border-color: transparent;
  box-shadow: none;
}

.ratio-dropdown {
  background: var(--sf-surface);
  border-color: transparent;
  box-shadow: 0 12px 32px rgba(36, 31, 25, 0.1);
}

.input-shell {
  background: var(--sf-surface);
  border-color: transparent;
}

.input-shell:focus-within {
  background: var(--sf-surface);
}

.summary-toggle {
  background: var(--sf-line-soft);
  border-color: transparent;
  color: rgba(36, 31, 25, 0.88);
  backdrop-filter: none;
}

@media (max-width: 1100px) {
  .workspace-shell,
  .single-session-layout {
    grid-template-columns: 1fr;
  }

  .session-sidebar {
    order: 1;
    min-height: auto;
  }

  .workspace-main {
    order: 2;
  }

  .mode-intro-card {
    display: none;
  }

  .sidebar-footer {
    flex-direction: row;
    flex-wrap: wrap;
  }
}

@media (max-width: 720px) {
  .chat-page {
    padding: 8px;
  }

  .workspace-main,
  .composer-console,
  .input-shell {
    border-radius: 22px;
  }

  .empty-state h1 {
    font-size: clamp(40px, 14vw, 64px);
  }
}


/* 新简易模式布局：顶部菜单 + 左右创作区 */
.top-nav {
  position: relative;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
}

.top-nav .brand-lockup {
  width: auto;
  padding: 0;
}

.top-nav-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.workspace-shell,
.single-session-layout {
  grid-template-columns: 1fr;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.workspace-main {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  height: 100%;
  background: transparent;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  overflow: hidden;
}

.chat-stage {
  min-height: 0;
  border: 1px solid rgba(36, 31, 25, 0.10);
  border-radius: 24px;
  background: var(--sf-surface);
}

.composer-dock {
  min-height: 0;
  display: flex;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.composer-console {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.composer-summary {
  flex: 0 0 auto;
}

.composer-control-panel {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-x: hidden;
  overflow-y: auto;
}

.composer-control-panel.ratio-open {
  overflow: visible;
}

@media (max-width: 980px) {
  .workspace-main {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
  }
}

@media (max-width: 640px) {
  .top-nav {
    align-items: flex-start;
    flex-direction: column;
  }

  .top-nav-actions {
    width: 100%;
    justify-content: flex-start;
  }
}


/* 最终简易模式微调：紧凑顶栏 + 右栏上下结构 + 可读性 */
.top-nav {
  min-height: 54px;
  padding: 8px 12px;
  gap: 10px;
  background: var(--sf-surface);
  border: 1px solid var(--sf-line);
  border-radius: 16px;
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.04);
}

.top-nav .brand-title {
  font-size: 18px;
  gap: 9px;
  letter-spacing: -0.04em;
}

.top-nav .brand-title-logo {
  width: 28px;
  height: 28px;
  border-radius: 10px;
}

.top-nav-actions {
  gap: 6px;
}

.top-nav-actions .canvas-entry-btn,
.top-nav-actions .sidebar-secondary-btn {
  min-height: 34px;
  padding: 0 13px;
  border-radius: 11px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  gap: 6px;
  background: var(--sf-surface-2);
  color: var(--sf-ink);
  border: 1px solid var(--sf-line);
}

.top-nav-actions .canvas-entry-new {
  padding: 2px 6px;
  font-size: 9px;
}

.workspace-shell,
.single-session-layout {
  gap: 12px;
}

.workspace-main {
  grid-template-columns: minmax(0, 1.1fr) minmax(380px, 0.9fr);
  gap: 14px;
}

.composer-dock {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: var(--sf-surface);
  border: 1px solid var(--sf-line);
  border-radius: 22px;
  box-shadow: 0 12px 32px rgba(36, 31, 25, 0.08);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.composer-console {
  order: 3;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.composer-summary {
  display: none;
}

.composer-control-panel {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.composer-control-panel.ratio-open,
.composer-dock.ratio-open,
.composer-console.ratio-open {
  overflow: visible;
}

@media (min-width: 981px) {
  .composer-control-panel.ratio-open .ratio-dropdown {
    top: calc(100% + 10px);
    bottom: auto;
  }
}

.referenced-mentions {
  order: 2;
  flex: 0 0 auto;
  padding: 8px 16px;
}

.input-shell {
  order: 1;
  position: relative;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 0;
  padding: 14px;
  border: 1px solid var(--sf-line);
  border-radius: 20px;
  background: linear-gradient(180deg, var(--sf-surface) 0%, var(--sf-surface) 100%);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.05), 0 18px 44px rgba(36, 31, 25, 0.08);
}

.input-shell:focus-within {
  border-color: rgba(36, 31, 25, 0.34);
  background: linear-gradient(180deg, var(--sf-surface) 0%, var(--sf-surface) 100%);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.06), 0 0 0 3px rgba(36, 31, 25, 0.06), 0 18px 44px rgba(36, 31, 25, 0.08);
}

.composer-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  align-self: stretch;
  padding: 12px 0 0;
  border-top: 1px solid rgba(36, 31, 25, 0.08);
}

.meta-pill-label,
.upload-label,
.motion-control-note,
.motion-control-note strong,
.multimodal-note,
.multimodal-note strong,
.referenced-mentions-label {
  color: rgba(36, 31, 25, 0.88);
}

.upload-hint,
.motion-control-note small,
.multimodal-note small,
.input-shell textarea::placeholder {
  color: rgba(36, 31, 25, 0.58);
}

.multimodal-group,
.mention-menu {
  background: var(--sf-surface-2);
  border-color: var(--sf-line);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.05), 0 14px 32px rgba(36, 31, 25, 0.08);
}

.multimodal-group-title,
.mention-item-name {
  color: rgba(36, 31, 25, 0.86);
}

.multimodal-group-count {
  color: rgba(36, 31, 25, 0.54);
}

.multimodal-add-btn {
  border-color: rgba(36, 31, 25, 0.32);
  background: rgba(36, 31, 25, 0.07);
  color: rgba(36, 31, 25, 0.90);
}

.multimodal-add-btn:hover {
  border-color: rgba(36, 31, 25, 0.48);
  background: rgba(36, 31, 25, 0.13);
  color: var(--sf-ink);
}

.mention-item:hover,
.mention-item.active {
  background: rgba(36, 31, 25, 0.12);
}

.switch-btn,
.ratio-current-btn,
.reference-input,
.motion-control-select,
.duration-select {
  color: rgba(36, 31, 25, 0.92);
}

.switch-btn:not(.active) {
  color: rgba(36, 31, 25, 0.72);
}

.switch-btn.active,
.mode-switch-btn.active {
  background: var(--color-action-bg);
  color: var(--color-action-text);
  border-color: var(--color-action-border);
}

.ratio-current-btn {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
  width: auto;
  height: 28px;
  padding: 0 10px;
  gap: 8px;
  background: var(--sf-surface-2);
  color: rgba(36, 31, 25, 0.92);
}

.ratio-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
  white-space: nowrap;
}

.ratio-caret {
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 1;
  color: rgba(36, 31, 25, 0.5);
}

.motion-control-select {
  border: 0;
  background: transparent;
  padding: 0 4px;
  color: rgba(36, 31, 25, 0.92);
}

.duration-select {
  border: 0;
  background: transparent;
  min-width: 0;
  padding: 0 20px 0 4px;
  color: rgba(36, 31, 25, 0.92);
}

.duration-selector {
  min-height: 30px;
  padding: 0 8px;
  border-radius: 12px;
}

.reference-input {
  border-color: rgba(36, 31, 25, 0.26);
}

.icon-btn,
.polish-btn,
.text-btn {
  color: rgba(36, 31, 25, 0.9);
}

.icon-btn,
.polish-btn {
  background: var(--sf-surface-3);
  border: 1px solid var(--sf-line);
  box-shadow: inset 0 1px 0 rgba(36, 31, 25, 0.06);
}

.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 13px;
}

.polish-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 13px;
  color: var(--sf-ink);
}

.icon-btn:hover,
.polish-btn:not(:disabled):hover {
  background: var(--sf-surface-3);
  border-color: rgba(36, 31, 25, 0.40);
}

.send-btn.ready {
  background: var(--color-action-bg);
  color: var(--color-action-text);
  box-shadow: 0 12px 28px rgba(36, 31, 25, 0.08), inset 0 1px 0 rgba(36, 31, 25, 0.10);
}

.input-shell textarea {
  color: var(--sf-ink);
  font-size: 15px;
  min-height: 0;
  max-height: none;
  padding: 4px 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  resize: none;
  cursor: text;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.38) transparent;
}

.input-shell textarea::-webkit-scrollbar {
  width: 8px;
}

.input-shell textarea::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.32);
}

.input-shell textarea::-webkit-scrollbar-track {
  background: transparent;
}

.meta-pill-label {
  font-size: 12px;
}

@media (max-width: 980px) {
  .input-shell {
    margin-top: 0;
  }

  .composer-console {
    max-height: min(46vh, 440px);
  }
}

@media (max-width: 640px) {
  .top-nav {
    min-height: auto;
  }

  .top-nav-actions .canvas-entry-btn,
  .top-nav-actions .sidebar-secondary-btn {
    min-height: 32px;
    padding: 0 11px;
  }
}

/* 移动端布局收口：单列聊天 + 底部参数面板，优先保证聊天区可读、输入区可用 */
@media (max-width: 980px) {
  .chat-page {
    height: var(--app-height, 100dvh);
    padding: 8px;
  }

  .workspace-shell,
  .single-session-layout {
    height: 100%;
    gap: 8px;
  }

  .workspace-main {
    grid-template-columns: 1fr;
    /* 窄屏上下堆叠时给对话区一个可读的最小高度，参数区按内容展开，由主区域滚动 */
    grid-template-rows: 520px max-content;
    gap: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .chat-stage {
    min-height: 0;
    padding: 0;
    border-radius: 20px;
  }

  .chat-area {
    padding: 18px 18px 24px;
  }

  .composer-dock {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 0 0 auto;
    min-height: 0;
    /* 堆叠布局下参数区按内容展开，避免输入框被固定高度裁掉；滚动交给 workspace-main */
    max-height: none;
    overflow: visible;
    border-radius: 20px;
  }

  .composer-console {
    flex: 0 0 auto;
    min-height: 0;
    order: 3;
    max-height: none;
    overflow: visible;
    border-radius: 20px;
  }

  /* 参数面板内部滚动，输入区固定在底部不被挤掉 */
  .composer-control-panel {
    flex: 0 0 auto;
    min-height: 0;
    max-height: max(calc(var(--app-height, 100dvh) - 375px), 0px);
    overflow-y: auto;
    padding: 10px;
  }

  /* 移动端恢复折叠开关：收起时只保留输入区 */
  .composer-summary {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    min-height: 42px;
    border-radius: 16px;
  }

  .composer-summary .summary-kicker {
    display: none;
  }

  .composer-summary .summary-toggle {
    width: auto;
    flex: 0 0 auto;
    align-self: center;
    min-height: 32px;
    margin-left: auto;
  }

  .input-shell {
    flex: 0 0 auto;
    order: 2;
    border-radius: 18px;
  }

  .input-shell.expanded textarea {
    min-height: 0;
  }

  .empty-state {
    padding: 28px 18px;
    border-radius: 22px;
  }

  .empty-copy {
    font-size: 13px;
  }
}

@media (max-width: 640px) {
  .top-nav {
    flex-direction: row;
    flex-wrap: nowrap;
    align-items: center;
    gap: 8px;
    min-height: 40px;
  }

  .top-nav .brand-lockup {
    flex: 0 0 auto;
  }

  .top-nav .brand-title {
    font-size: 20px;
  }

  .top-nav-actions {
    flex: 1 1 auto;
    width: auto;
    justify-content: flex-end;
    flex-wrap: nowrap;
    overflow-x: auto;
    gap: 6px;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .top-nav-actions::-webkit-scrollbar {
    display: none;
  }

  .top-nav-actions .canvas-entry-btn,
  .top-nav-actions .sidebar-secondary-btn {
    flex: 0 0 auto;
    min-height: 32px;
    padding: 0 10px;
    font-size: 12px;
    white-space: nowrap;
  }

  .top-nav-actions .canvas-entry-new {
    display: none;
  }

  .chat-area {
    padding: 8px 4px;
    gap: 12px;
  }

  .empty-state h1 {
    font-size: clamp(28px, 9vw, 40px);
  }

  .composer-summary {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .composer-summary::-webkit-scrollbar {
    display: none;
  }

  .composer-summary .summary-chip {
    flex: 0 0 auto;
  }

  .composer-actions {
    flex-wrap: nowrap;
    gap: 6px;
  }

  .composer-actions .icon-btn,
  .composer-actions .polish-btn,
  .composer-actions .send-btn {
    min-height: 40px;
    min-width: 40px;
    padding: 0 12px;
  }
}

/* =========================================================================
 * Studio 统一视觉 v2：与 Skill / 配音分区共用同一套背景与面板语言
 * ========================================================================= */

.chat-page {
  --surface-glass: var(--sf-surface);
  --surface-glass-strong: var(--sf-surface);
  --surface-line: var(--sf-line);
  --surface-shadow-soft: 0 4px 18px rgba(36, 31, 25, 0.05);
  background: var(--sf-surface);
}

.chat-page::before {
  display: none;
}

.workspace-shell,
.single-session-layout {
  width: min(100%, 1480px);
}

.chat-stage {
  border-radius: 26px;
}

/* ---------- 空状态 ---------- */

.empty-state {
  display: flex;
  width: min(100%, 760px);
  flex-direction: column;
  align-items: center;
  margin: clamp(18px, 4vh, 40px) auto 0;
  text-align: center;
}

.empty-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  margin-bottom: 14px;
  border: 1px solid rgba(36, 31, 25, 0.32);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-ink);
}

.empty-badge svg {
  width: 22px;
  height: 22px;
}

.empty-state .empty-kicker {
  color: var(--sf-ink-2);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.empty-state h1 {
  max-width: 20ch;
  margin: 12px auto 0;
  font-size: clamp(30px, 3.6vw, 46px);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.035em;
  color: rgba(36, 31, 25, 0.96);
}

.empty-copy {
  max-width: 540px;
  margin: 14px auto 0;
  font-size: 13.5px;
  line-height: 1.7;
  color: rgba(36, 31, 25, 0.55);
}

.quick-starts {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 22px;
}

.quick-start-block {
  width: 100%;
  margin-top: 18px;
}

.quick-start-label {
  margin-bottom: 10px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(36, 31, 25, 0.38);
}

.quick-start-block .quick-starts {
  margin-top: 0;
}

.quick-start {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.035);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.quick-start:hover {
  transform: translateY(-1px);
  border-color: rgba(36, 31, 25, 0.38);
  background: rgba(36, 31, 25, 0.08);
}

.quick-start-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.quick-start-title {
  font-size: 13px;
  font-weight: 650;
  color: rgba(36, 31, 25, 0.9);
}

.quick-start-head svg {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: rgba(36, 31, 25, 0.35);
}

.quick-start-desc {
  font-size: 11.5px;
  line-height: 1.5;
  color: rgba(36, 31, 25, 0.45);
}

@media (max-width: 780px) {
  .quick-starts {
    grid-template-columns: 1fr;
  }
}

/* ---------- 参数台 ---------- */

.composer-console {
  border-color: rgba(36, 31, 25, 0.10);
  border-radius: 26px;
  background: rgba(36, 31, 25, 0.055);
  box-shadow:
    0 26px 70px rgba(36, 31, 25, 0.08),
    inset 0 1px 0 rgba(36, 31, 25, 0.07);
}

.send-btn.ready {
  background: var(--sf-ink);
  color: var(--sf-surface);
}

/* =========================================================================
 * v4 创作栏（所有宽度通用）
 * ========================================================================= */

.composer-bar {
  display: flex;
  flex: 0 0 auto;
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
  min-height: 54px;
  padding-right: 14px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.07);
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.04), rgba(36, 31, 25, 0.005));
}

.composer-tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  min-width: 0;
}

.composer-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: rgba(36, 31, 25, 0.5);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;
}

.composer-tab:hover {
  color: rgba(36, 31, 25, 0.86);
  background: rgba(36, 31, 25, 0.04);
}

.composer-tab.is-active {
  color: var(--sf-ink);
  background: rgba(36, 31, 25, 0.08);
}

.composer-tab.is-active::after {
  content: '';
  position: absolute;
  right: 12px;
  bottom: 0;
  left: 12px;
  height: 2px;
  border-radius: 2px 2px 0 0;
  background: var(--sf-ink);
}

.composer-bar-model {
  display: inline-flex;
  flex: 0 1 auto;
  align-self: center;
  align-items: center;
  gap: 7px;
  max-width: 46%;
  padding: 5px 10px;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 9px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.68);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.composer-bar-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sf-ink);
  box-shadow: 0 0 0 3px rgba(36, 31, 25, 0.14);
}

.composer-bar-extra {
  padding-left: 7px;
  margin-left: 1px;
  border-left: 1px solid rgba(36, 31, 25, 0.12);
  color: rgba(36, 31, 25, 0.5);
}

.composer-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 0 12px;
}

.composer-section-title {
  color: rgba(36, 31, 25, 0.42);
  font-size: 10.5px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.composer-section-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.composer-section-chip {
  padding: 2px 7px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 6px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.5);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
}

.composer-section-chip.attention {
  border-color: rgba(251, 191, 36, 0.32);
  background: rgba(251, 191, 36, 0.12);
  color: var(--sf-amber);
}

.composer-tab-static {
  cursor: default;
}

.composer-tab-static:hover {
  color: var(--sf-ink);
  background: rgba(36, 31, 25, 0.08);
}

@media (max-width: 980px) {
  .composer-bar {
    min-height: 44px;
    padding-right: 10px;
  }

  .composer-tab {
    padding: 0 12px;
    font-size: 11.5px;
  }

  .composer-section-head {
    margin-bottom: 10px;
  }
}

/* =========================================================================
 * v4 布局（桌面端）：左侧是完整的对话 / 结果区，右侧是参数栏
 * ========================================================================= */

@media (min-width: 981px) {
  .workspace-main {
    grid-template-columns: minmax(0, 1fr) 400px;
    grid-template-rows: minmax(0, 1fr);
    gap: 14px;
    overflow: hidden;
  }

  /* 桌面端：左侧保留完整的对话/结果区，右侧是 400px 参数栏，与配音页控制栏同宽 */
  .composer-dock {
    order: 0;
    display: flex;
    flex-direction: column;
    align-self: stretch;
    height: 100%;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid rgba(36, 31, 25, 0.09);
    border-radius: 26px;
    background: rgba(36, 31, 25, 0.05);
    box-shadow:
      0 26px 70px rgba(36, 31, 25, 0.08),
      inset 0 1px 0 rgba(36, 31, 25, 0.06);
  }

  .composer-bar {
    order: 0;
    border-radius: 25px 25px 0 0;
  }

  /* 模型已在参数区完整展示，右栏顶部的摘要 chip 在 400px 内会挤掉标签，直接隐藏 */
  .composer-bar-model {
    display: none;
  }

  .composer-console {
    display: flex;
    order: 1;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: flex-start;
    min-height: 0;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  /* 参数区：固定占据 bar 与输入框之间，内容过多时内部滚动 */
  .composer-control-panel {
    display: flex;
    order: 1;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    padding: 16px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  .composer-section-head {
    flex: 0 0 auto;
  }

  /* 参数区内部所有分区统一竖排、统一 12px 间距与整栏宽度 */
  .composer-meta-row {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: stretch;
    flex-wrap: nowrap;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
  }

  .composer-meta-row > * {
    flex: 0 0 auto;
    width: 100%;
    max-width: 100%;
  }

  .skill-control-row {
    padding-top: 0;
  }

  .composer-meta-row,
  .dock-pills {
    gap: 10px;
  }

  /* 参数胶囊排成两列网格，模型独占一行，宽度统一 */
  .dock-pills {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: stretch;
  }

  .meta-pill {
    flex: none;
    flex-direction: column;
    align-items: stretch;
    gap: 7px;
    width: auto;
    min-width: 0;
    min-height: 78px;
    padding: 11px 12px;
    border: 1px solid rgba(36, 31, 25, 0.12);
    border-radius: 16px;
    background: rgba(36, 31, 25, 0.085);
  }

  .meta-pill-model,
  .meta-pill-mode {
    grid-column: 1 / -1;
  }

  .meta-pill .meta-pill-label {
    flex: 0 0 auto;
    color: rgba(36, 31, 25, 0.6);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .meta-pill .model-slot,
  .meta-pill .duration-selector,
  .meta-pill .ratio-selector,
  .meta-pill .media-switch,
  .meta-pill .video-mode-switch {
    width: 100%;
  }

  /* 控件底色压深一档，与卡片拉开层次；高度统一 36px */
  .meta-pill .model-slot,
  .meta-pill .duration-selector,
  .meta-pill .ratio-selector {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 10px;
    border: 1px solid rgba(36, 31, 25, 0.09);
    border-radius: 12px;
    background: rgba(36, 31, 25, 0.08);
  }

  .meta-pill .model-slot select,
  .meta-pill .duration-select {
    width: 100%;
    border: 0;
    background: transparent;
    color: var(--sf-ink);
    font-size: 12.5px;
    font-weight: 600;
  }

  .meta-pill .duration-select-wrap {
    display: flex;
    align-items: center;
    width: 100%;
  }

  .meta-pill .duration-select {
    padding-left: 0;
  }

  .meta-pill .duration-select:disabled {
    color: rgba(36, 31, 25, 0.62);
    cursor: not-allowed;
  }

  /* 比例锁定时不再显示下拉箭头，避免误以为可选 */
  .meta-pill-ratio.ratio-locked .duration-caret {
    opacity: 0;
  }

  .meta-pill .duration-select option {
    background: var(--sf-surface-3);
    color: var(--sf-ink);
  }

  .meta-pill .duration-caret {
    color: rgba(36, 31, 25, 0.55);
    font-size: 11px;
  }

  .meta-pill .ratio-current-btn {
    border: 0;
    background: transparent;
    color: var(--sf-ink);
    font-size: 12.5px;
    font-weight: 600;
  }

  /* 分段切换：深底 + 高对比选中态 */
  .meta-pill .media-switch,
  .meta-pill .video-mode-switch {
    align-items: center;
    height: 36px;
    gap: 3px;
    padding: 2px;
    border: 1px solid rgba(36, 31, 25, 0.08);
    border-radius: 12px;
    background: rgba(36, 31, 25, 0.08);
  }

  /* 视频模型最多有 5~6 个生成方式，400px 参数栏里单行会换行并溢出；
     改成自动列网格，让「多模态参考」等末项留在面板内。 */
  .meta-pill .video-mode-switch {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(94px, 1fr));
    align-items: stretch;
    height: auto;
    min-height: 36px;
  }

  .meta-pill .video-mode-switch .switch-btn {
    width: 100%;
    min-width: 0;
    padding: 0 6px;
  }

  .meta-pill .switch-btn {
    flex: 1 1 auto;
    min-width: 0;
    height: 30px;
    padding: 0 10px;
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: rgba(36, 31, 25, 0.78);
    font-size: 12px;
    font-weight: 600;
  }

  .meta-pill .switch-btn:not(.active):hover {
    background: rgba(36, 31, 25, 0.08);
    color: var(--sf-ink);
  }

  .meta-pill .switch-btn.active {
    background: var(--sf-surface-3);
    color: var(--sf-surface);
    box-shadow: 0 2px 8px rgba(36, 31, 25, 0.08);
  }

  .meta-pill .switch-btn:disabled {
    opacity: 0.36;
    cursor: not-allowed;
  }

  .camera-guide-row,
  .reference-strip {
    flex: 0 0 auto;
    width: 100%;
    padding: 0;
  }

  .referenced-mentions {
    order: 2;
    flex: 0 0 auto;
    padding: 8px 16px 0;
  }

  /* 发送框：固定高度，位置不随参数多少变化 */
  .input-shell {
    display: flex;
    order: 4;
    flex: 0 0 auto;
    flex-direction: column;
    height: clamp(190px, 21vh, 280px);
    min-height: 0;
    margin: 10px 14px 14px;
    padding: 12px 14px;
    border: 1px solid rgba(36, 31, 25, 0.13);
    border-radius: 20px;
    background: rgba(36, 31, 25, 0.07);
    box-shadow: none;
  }

  .input-shell textarea {
    flex: 1 1 auto;
    min-height: 96px;
  }

  .composer-actions {
    flex: 0 0 auto;
  }

  .input-shell:focus-within {
    border-color: rgba(36, 31, 25, 0.45);
    background: rgba(36, 31, 25, 0.06);
    box-shadow: 0 0 0 3px rgba(36, 31, 25, 0.12);
  }

  .composer-actions {
    padding: 10px 0 0;
  }

  /* 右栏：对话 */
  .chat-stage {
    order: 0;
    padding: 0;
    border-radius: 26px;
  }

  .chat-area {
    width: min(100%, 940px);
    margin: 0 auto;
    padding: 26px 30px 30px;
  }
}

/* =========================================================================
 * v5 上传 / 素材卡片
 * ========================================================================= */

.upload-mini-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  min-height: 64px;
  padding: 10px 12px;
  border: 1px dashed rgba(36, 31, 25, 0.18);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.05), rgba(36, 31, 25, 0.022));
  transition: border-color 0.16s ease, background 0.16s ease;
}

.upload-card-row {
  min-height: 80px;
}

.upload-mini-row:hover,
.upload-card-row:hover {
  border-color: rgba(36, 31, 25, 0.45);
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.1), rgba(36, 31, 25, 0.02));
}

.upload-mini-row.has-file,
.upload-card-row.has-file {
  border-style: solid;
  border-color: rgba(52, 211, 153, 0.42);
  background: linear-gradient(180deg, rgba(52, 211, 153, 0.1), rgba(36, 31, 25, 0.02));
}

.upload-mini-row .upload-icon-btn {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid rgba(36, 31, 25, 0.16);
  border-radius: 13px;
  background: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
  font-size: 20px;
  font-weight: 400;
  line-height: 1;
}

.upload-mini-row:hover .upload-icon-btn {
  border-color: rgba(36, 31, 25, 0.5);
  background: rgba(36, 31, 25, 0.16);
  color: var(--sf-ink);
}

.upload-mini-row.has-file .upload-icon-btn {
  border-color: rgba(52, 211, 153, 0.45);
  background: rgba(52, 211, 153, 0.16);
  color: var(--sf-success);
}

.upload-mini-row .upload-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.upload-mini-row .upload-label {
  color: rgba(36, 31, 25, 0.92);
  font-size: 12.5px;
  font-weight: 700;
  line-height: 1.2;
}

.upload-mini-row .upload-hint {
  display: -webkit-box;
  overflow: hidden;
  color: rgba(36, 31, 25, 0.45);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: normal;
  text-overflow: initial;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.upload-mini-row .upload-thumb {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 1px solid rgba(36, 31, 25, 0.14);
  border-radius: 11px;
  background: rgba(36, 31, 25, 0.05);
  object-fit: cover;
}

.upload-mini-row .upload-thumb-file {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.upload-mini-row .pill-filename {
  flex: 0 1 auto;
  max-width: 110px;
  padding: 3px 8px;
  overflow: hidden;
  border-radius: 7px;
  background: rgba(36, 31, 25, 0.06);
  color: rgba(36, 31, 25, 0.6);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-mini-row .text-btn {
  flex: 0 0 auto;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid rgba(248, 113, 113, 0.32);
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.1);
  color: var(--sf-terra-strong);
  font-size: 11px;
  font-weight: 600;
}

.upload-mini-row .text-btn::before {
  content: none;
}

.upload-mini-row .text-btn:hover {
  border-color: rgba(248, 113, 113, 0.55);
  background: rgba(248, 113, 113, 0.18);
  color: #8f3a33;
}

/* 两张以上素材卡时上下排列，避免窄栏里挤成一团 */
.frame-upload-grid {
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 10px;
}

/* 粘贴链接的输入框同样做成虚线槽位 */
.reference-input {
  width: 100%;
  min-height: 48px;
  padding: 0 14px;
  border: 1px dashed rgba(36, 31, 25, 0.18);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.03);
  color: var(--sf-ink);
  font-size: 12px;
}

.reference-input::placeholder {
  color: rgba(36, 31, 25, 0.32);
}

.reference-input:focus {
  outline: none;
  border-style: solid;
  border-color: rgba(36, 31, 25, 0.5);
  box-shadow: 0 0 0 3px rgba(36, 31, 25, 0.12);
}

/* 素材 / 动作控制容器与卡片保持同一套圆角与底色 */
.multimodal-panel,
.motion-control-panel,
.subject-reference-card {
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.035);
}

.motion-control-note,
.multimodal-note {
  color: rgba(36, 31, 25, 0.78);
  font-size: 11.5px;
  line-height: 1.5;
}

.motion-control-note small,
.multimodal-note small {
  color: rgba(36, 31, 25, 0.45);
  font-size: 10.5px;
}

.ratio-lock-note {
  margin: 0;
  padding: 8px 10px;
  border: 1px solid rgba(251, 191, 36, 0.22);
  border-radius: 10px;
  background: rgba(251, 191, 36, 0.08);
  color: rgba(253, 224, 71, 0.85);
  font-size: 10.5px;
  line-height: 1.5;
}

/* 参数区底部说明，把剩余空间收束住 */
.composer-panel-foot {
  flex: 0 0 auto;
  margin: auto 0 0;
  padding-top: 14px;
  color: rgba(36, 31, 25, 0.26);
  font-size: 10.5px;
  line-height: 1.6;
}

/* 多模态参考：三组素材位统一成虚线槽 */
.multimodal-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.multimodal-group {
  padding: 10px;
  border: 1px dashed rgba(36, 31, 25, 0.16);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.03);
}

.multimodal-group-title {
  color: rgba(36, 31, 25, 0.86);
  font-size: 11px;
  font-weight: 600;
}

.multimodal-group-count {
  color: rgba(36, 31, 25, 0.5);
  font-size: 10px;
}

.multimodal-add-btn {
  width: 52px;
  height: 52px;
  border: 1px dashed rgba(36, 31, 25, 0.22);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.05);
  color: var(--sf-ink);
  font-size: 20px;
  font-weight: 400;
  line-height: 1;
}

.multimodal-add-btn:hover {
  border-color: rgba(36, 31, 25, 0.5);
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-ink);
}

/* 参数区滚动条：常驻细条，提示还有内容 */
.composer-control-panel {
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.16) transparent;
}

.composer-control-panel::-webkit-scrollbar {
  width: 6px;
}

.composer-control-panel::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.16);
}

.composer-control-panel::-webkit-scrollbar-track {
  background: transparent;
}

/* 输入框左下角的操作提示 */
.composer-hint {
  margin-right: auto;
  color: rgba(36, 31, 25, 0.32);
  font-size: 10.5px;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* 对话面板头：与配音 / Skill 页的 studio-panel-head 对齐 */
.chat-stage-head {
  flex: 0 0 auto;
  background: linear-gradient(90deg, rgba(36, 31, 25, 0.07), rgba(36, 31, 25, 0) 62%);
}

/* 稍窄的桌面端给对话区再让 40px，参数栏仍保持可读宽度 */
@media (min-width: 981px) and (max-width: 1180px) {
  .workspace-main {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}

/* 右侧参数栏只有 400/360px：图片 / 视频 / 音频三组素材改为纵向排列，
   每组独占整行，缩略图和添加入口不再被压成两列半。 */
@media (min-width: 981px) {
  .multimodal-groups {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .upload-mini-row {
    min-height: 60px;
    padding: 9px 10px;
    gap: 8px;
  }

  .upload-card-row {
    min-height: 76px;
  }

  .upload-mini-row .upload-icon-btn {
    width: 38px;
    height: 38px;
    border-radius: 11px;
    font-size: 18px;
  }

  .upload-mini-row .upload-thumb {
    width: 38px;
    height: 38px;
    border-radius: 9px;
  }

  .upload-mini-row .pill-filename {
    max-width: 84px;
  }
}

/* 手机宽度下顶栏空间有限，模型名回到参数区展示 */
@media (max-width: 640px) {
  .composer-bar-model {
    display: none;
  }

  .multimodal-groups {
    grid-template-columns: 1fr;
  }
}

/* 扩图模式：上传区用暖色强调，和普通参考图区分 */
.upload-card-row.is-expand-upload {
  border-color: rgba(36, 31, 25, 0.34);
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.09), rgba(36, 31, 25, 0.02));
}

.upload-card-row.is-expand-upload.has-file {
  border-color: rgba(52, 211, 153, 0.46);
}

.expand-mode-note {
  color: var(--sf-ink-2);
}

.expand-ratio-warning {
  border-color: rgba(248, 113, 113, 0.26);
  background: rgba(248, 113, 113, 0.1);
  color: var(--sf-terra-strong);
}

/* 结果图快捷扩图弹窗 */
.expand-modal-mask {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.expand-modal {
  width: min(100%, 520px);
  max-height: min(720px, calc(100dvh - 40px));
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--sf-line);
  border-radius: 22px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  box-shadow: 0 24px 70px rgba(36, 31, 25, 0.16);
  animation: expand-modal-in 0.22s ease-out;
}

@keyframes expand-modal-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.expand-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.expand-modal-kicker {
  display: block;
  margin-bottom: 4px;
  color: rgba(36, 31, 25, 0.62);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.expand-modal-head h3 {
  margin: 0;
  color: var(--sf-ink);
  font-size: 21px;
  font-weight: 720;
  letter-spacing: 0.01em;
}

.expand-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.72);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.expand-modal-close:hover {
  border-color: rgba(36, 31, 25, 0.34);
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.expand-modal-preview {
  position: relative;
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.08);
  aspect-ratio: 16 / 8;
}

.expand-modal-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.expand-modal-source {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 4px 8px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: rgba(36, 31, 25, 0.82);
  font-size: 9.5px;
  font-weight: 600;
  backdrop-filter: blur(10px);
}

.expand-modal-copy {
  margin: 12px 0 14px;
  color: var(--sf-ink-2);
  font-size: 11.5px;
  line-height: 1.6;
}

.expand-ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.expand-ratio-btn {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 88px;
  padding: 9px 6px 8px;
  border: 1px solid rgba(36, 31, 25, 0.11);
  border-radius: 13px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.86);
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.expand-ratio-btn:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.42);
  background: rgba(36, 31, 25, 0.13);
  transform: translateY(-2px);
}

.expand-ratio-btn:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.expand-ratio-box {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 3px;
  opacity: 0.78;
}

.expand-ratio-label {
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.expand-ratio-size {
  color: rgba(36, 31, 25, 0.38);
  font-size: 8.5px;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}

.expand-ratio-note {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 2px 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink);
  font-size: 7.5px;
  font-weight: 700;
  line-height: 1.2;
}

.expand-modal-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid rgba(36, 31, 25, 0.08);
}

.expand-modal-hint {
  color: rgba(36, 31, 25, 0.36);
  font-size: 10px;
  line-height: 1.45;
}

.expand-modal-cancel {
  flex: 0 0 auto;
  min-height: 32px;
  padding: 0 16px;
  border: 1px solid rgba(36, 31, 25, 0.14);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.06);
  color: rgba(36, 31, 25, 0.78);
  font-size: 11px;
  font-weight: 650;
  cursor: pointer;
}

.expand-modal-cancel:hover {
  border-color: rgba(36, 31, 25, 0.32);
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-ink);
}

@media (max-width: 560px) {
  .expand-modal-mask {
    padding: 12px;
  }

  .expand-modal {
    padding: 16px;
    border-radius: 18px;
  }

  .expand-ratio-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .expand-modal-foot {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* =========================================================================
 * 视频工作台：与图片页对齐（左侧结果画廊 + 底部提示词条 + 右侧参数栏）
 * 追加在文件末尾，用于覆盖早期对话式布局的遗留规则。
 * ========================================================================= */

.video-page {
  position: relative;
  display: flex;
  /* 导航是右列，内容外壳是左列 */
  flex-direction: row;
  min-height: 0;
  height: 100dvh;
  padding: 0 0 10px 10px;
  overflow: hidden;
  background: transparent;
  color: var(--sf-ink);
}

.video-page::before {
  display: none;
}

.video-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  width: min(100%, var(--page-max-width, 1480px));
  min-height: 0;
  margin: 0 auto;
}


/* ---------- 头部操作 ---------- */

.header-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 15px;
  border: 1px solid rgba(36, 31, 25, 0.10);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.76);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.header-action:hover {
  border-color: rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.header-action-count {
  display: inline-grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

/* ---------- 主体 ---------- */

.video-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 352px;
  gap: 14px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 18px 4px;
}

.workbench {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}

/* ---------- 结果画廊 ---------- */

.gallery-area {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 8px 2px;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.07) rgba(36, 31, 25, 0.04);
  overscroll-behavior: contain;
}

.gallery-area::-webkit-scrollbar {
  width: 9px;
}

.gallery-area::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
}

.gallery-area::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.07);
  background-clip: padding-box;
}

.gallery-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px 12px 40px;
  text-align: center;
}

.empty-mark {
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 18px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.07);
}

.empty-mark svg {
  width: 26px;
  height: 26px;
}

.gallery-empty h2 {
  margin: 0;
  color: rgba(36, 31, 25, 0.94);
  font-size: clamp(20px, 2vw, 26px);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.gallery-empty p {
  max-width: 520px;
  margin: 0;
  color: rgba(36, 31, 25, 0.44);
  font-size: 12.5px;
  line-height: 1.7;
}

.starters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  width: min(100%, 860px);
  margin-top: 8px;
}

.starter {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.03);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.starter:hover {
  border-color: rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.09);
  transform: translateY(-1px);
}

.starter-title {
  color: rgba(36, 31, 25, 0.9);
  font-size: 12.5px;
  font-weight: 650;
}

.starter-desc {
  color: rgba(36, 31, 25, 0.4);
  font-size: 10.5px;
  line-height: 1.5;
}

.batch-bar {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 0 0 auto;
  padding: 2px 4px 0;
}

.batch-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.batch-prompt {
  margin: 0;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: rgba(36, 31, 25, 0.9);
  font-size: 13px;
  line-height: 1.5;
}

.batch-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  color: rgba(36, 31, 25, 0.36);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.batch-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
  flex: 0 0 auto;
}

.batch-warning,
.batch-error {
  flex: 0 0 auto;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 11.5px;
  line-height: 1.6;
}

.batch-warning {
  border: 1px solid var(--sf-amber-soft);
  background: var(--sf-surface-2);
  color: var(--sf-amber);
}

.batch-error {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--sf-danger-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.batch-error p {
  margin: 0;
}

/* ---------- 视频结果网格 ---------- */

.video-grid {
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), minmax(0, 1fr));
  gap: 10px;
  align-content: start;
}

.video-grid.is-single .video-tile {
  width: min(100%, 880px);
  justify-self: center;
}

.video-tile {
  position: relative;
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 16px;
  aspect-ratio: 16 / 9;
  background: var(--sf-surface);
  cursor: pointer;
  transition: border-color 0.22s ease, transform 0.22s ease;
}

.video-tile:hover {
  border-color: rgba(36, 31, 25, 0.07);
  transform: translateY(-2px);
}

.video-tile video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: var(--sf-surface-3);
}

.tile-play {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border: 1px solid rgba(36, 31, 25, 0.24);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: rgba(36, 31, 25, 0.9);
  transform: translate(-50%, -50%);
  backdrop-filter: blur(10px);
  transition: background 0.2s ease, transform 0.2s ease;
}

.video-tile:hover .tile-play {
  background: rgba(36, 31, 25, 0.07);
  transform: translate(-50%, -50%) scale(1.06);
}

.tile-play svg {
  width: 20px;
  height: 20px;
  margin-left: 2px;
}

.tile-index {
  position: absolute;
  top: 8px;
  left: 8px;
  display: grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: rgba(36, 31, 25, 0.8);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  backdrop-filter: blur(8px);
}

.tile-overlay {
  position: absolute;
  inset: auto 0 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 26px 10px 10px;
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.94));
  opacity: 0;
  transition: opacity 0.22s ease;
}

.video-tile:hover .tile-overlay,
.video-tile:focus-within .tile-overlay {
  opacity: 1;
}

.tile-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.tile-tools :deep(.add-to-project) {
  min-height: 26px;
  padding: 0 9px;
  border-color: rgba(36, 31, 25, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: rgba(36, 31, 25, 0.82);
  font-size: 11px;
  font-weight: 500;
}

.tile-tools :deep(.add-to-project svg) {
  display: none;
}

.tile-btn {
  min-height: 26px;
  padding: 0 9px;
  border: 1px solid rgba(36, 31, 25, 0.16);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: rgba(36, 31, 25, 0.82);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(10px);
  transition: background 0.18s ease, border-color 0.18s ease;
}

.tile-btn:hover {
  border-color: rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
}

.tile-size {
  margin-left: auto;
  overflow: hidden;
  color: rgba(36, 31, 25, 0.42);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.tile-pending {
  display: grid;
  place-items: center;
  cursor: default;
}

.tile-pending:hover {
  border-color: rgba(36, 31, 25, 0.08);
  transform: none;
}

.tile-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    rgba(36, 31, 25, 0.02) 20%,
    rgba(36, 31, 25, 0.07) 42%,
    rgba(36, 31, 25, 0.02) 64%
  );
  background-size: 220% 100%;
  animation: video-shimmer 1.5s linear infinite;
}

@keyframes video-shimmer {
  from {
    background-position: 140% 0;
  }
  to {
    background-position: -60% 0;
  }
}

.tile-pending-text {
  position: relative;
  color: rgba(36, 31, 25, 0.34);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* ---------- 提示词条 ---------- */

.prompt-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 0 0 auto;
  padding: 12px 14px 11px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 20px;
  background: var(--sf-surface);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.04);
  transition: border-color 0.24s ease;
}

.prompt-card:focus-within {
  border-color: rgba(36, 31, 25, 0.07);
}

.prompt-field {
  display: flex;
  align-items: flex-end;
  gap: 10px;
}

.prompt-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 46px;
  max-height: 180px;
  padding: 11px 2px;
  border: 0;
  background: transparent;
  color: rgba(36, 31, 25, 0.94);
  font: inherit;
  font-size: 14px;
  line-height: 1.55;
  resize: none;
  outline: none;
}

.prompt-input::placeholder {
  color: rgba(36, 31, 25, 0.32);
}

.prompt-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  padding-bottom: 4px;
}

.ghost-pill {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.72);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.ghost-pill:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-ink);
}

.ghost-pill:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.generate-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(96, 140, 220, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.6);
  transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
}

.generate-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 16px 32px rgba(96, 140, 220, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.68);
}

.generate-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
  box-shadow: none;
}

.generate-icon {
  width: 14px;
  height: 14px;
  flex: none;
}

.generate-kbd {
  color: rgba(15, 22, 38, 0.42);
  font-size: 10px;
  font-weight: 600;
}

.generate-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid rgba(15, 22, 38, 0.24);
  border-top-color: var(--sf-surface);
  border-radius: 50%;
  animation: video-spin 0.9s linear infinite;
}

@keyframes video-spin {
  to {
    transform: rotate(360deg);
  }
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pchip {
  display: inline-flex;
  align-items: center;
  max-width: 220px;
  min-height: 24px;
  padding: 0 10px;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.58);
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pchip-model {
  color: rgba(36, 31, 25, 0.82);
}

.pchip-warn {
  border-color: var(--sf-amber-soft);
  background: var(--sf-surface-2);
  color: var(--sf-amber);
}

.pchip-action {
  display: none;
  margin-left: auto;
  border-color: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
  cursor: pointer;
}

/* ---------- 右侧参数栏 ---------- */

.param-rail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 22px;
  background: var(--sf-surface);
  box-shadow: 0 1px 2px rgba(36, 31, 25, 0.04);
}

.rail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.06);
}

.rail-title {
  color: rgba(36, 31, 25, 0.86);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.rail-close {
  display: none;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 50%;
  background: transparent;
  color: rgba(36, 31, 25, 0.6);
  font-size: 11px;
  cursor: pointer;
}

.rail-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
  padding: 12px 8px 12px 12px;
  overflow-y: auto;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.07) rgba(36, 31, 25, 0.05);
  overscroll-behavior: contain;
}

.rail-scroll > * {
  flex: 0 0 auto;
}

.rail-scroll::-webkit-scrollbar {
  width: 9px;
}

.rail-scroll::-webkit-scrollbar-track {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
}

.rail-scroll::-webkit-scrollbar-thumb {
  border: 2px solid transparent;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.07);
  background-clip: padding-box;
}

.rail-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.028);
}

.rail-label {
  color: rgba(36, 31, 25, 0.46);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.rail-hint {
  margin: 0;
  color: rgba(36, 31, 25, 0.36);
  font-size: 10.5px;
  line-height: 1.6;
}

.rail-card-upload {
  gap: 10px;
}

.rail-card-upload :deep(.camera-guide-row) {
  width: 100%;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  min-height: 30px;
  padding: 0 13px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.66);
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.chip:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
}

.chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.chip:disabled {
  opacity: 0.36;
  cursor: not-allowed;
}

.chip-count {
  min-width: 38px;
  padding: 0;
}

.ratio-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.ratio-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 9px 4px 7px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.03);
  color: rgba(36, 31, 25, 0.5);
  font-size: 10px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.ratio-chip:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
}

.ratio-chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.ratio-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ratio-box {
  display: block;
  border: 1px solid currentColor;
  border-radius: 3px;
  opacity: 0.8;
}

.ratio-text {
  font-variant-numeric: tabular-nums;
}

/* 参数栏内的素材控件沿用旧控制台样式，这里只修一下间距。 */
.rail-card-upload :deep(.reference-strip) {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.rail-card-upload :deep(.upload-mini-row) {
  border-radius: 14px;
}

.rail-backdrop {
  display: none;
}

/* ---------- 历史抽屉 ---------- */

.history-mask {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  justify-content: flex-end;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(6px);
}

.history-panel {
  display: flex;
  flex-direction: column;
  width: min(100%, 400px);
  padding: 18px 16px;
  border-left: 1px solid rgba(36, 31, 25, 0.08);
  background: var(--sf-surface);
  animation: video-slide-in 0.26s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes video-slide-in {
  from {
    transform: translateX(18px);
    opacity: 0.4;
  }
}

.history-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex: 0 0 auto;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.07);
}

.history-kicker {
  color: rgba(36, 31, 25, 0.34);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.history-head h3 {
  margin: 3px 0 0;
  color: var(--sf-ink);
  font-size: 17px;
  font-weight: 700;
}

.history-close {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 50%;
  background: transparent;
  color: rgba(36, 31, 25, 0.6);
  font-size: 11px;
  cursor: pointer;
}

.history-empty {
  margin: 22px 2px;
  color: rgba(36, 31, 25, 0.4);
  font-size: 12px;
  line-height: 1.7;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1 1 auto;
  min-height: 0;
  margin: 12px 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.history-item-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.025);
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.history-item-btn:hover {
  border-color: rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.08);
}

.history-item.active .history-item-btn {
  border-color: rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.12);
}

.history-thumb {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 52px;
  height: 52px;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.05);
}

.history-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.history-thumb-empty {
  color: rgba(36, 31, 25, 0.4);
  font-size: 13px;
}

.history-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.history-prompt {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: rgba(36, 31, 25, 0.82);
  font-size: 11.5px;
  line-height: 1.45;
}

.history-meta {
  color: rgba(36, 31, 25, 0.34);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

/* ---------- 视频预览 ---------- */

.video-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 118;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(10px);
}

.video-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(100%, 920px);
  padding: 16px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 22px;
  background: var(--sf-surface);
  box-shadow: 0 30px 90px rgba(36, 31, 25, 0.08);
}

.video-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.video-preview-kicker {
  color: rgba(36, 31, 25, 0.34);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.video-preview-head h3 {
  margin: 3px 0 0;
  color: var(--sf-ink);
  font-size: 18px;
  font-weight: 700;
}

.video-preview-close {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 50%;
  background: transparent;
  color: rgba(36, 31, 25, 0.62);
  font-size: 12px;
  cursor: pointer;
}

.video-preview video {
  width: 100%;
  max-height: min(64vh, 620px);
  border-radius: 14px;
  background: var(--sf-surface-3);
}

.video-preview-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: rgba(36, 31, 25, 0.5);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.video-preview-actions {
  display: flex;
  gap: 8px;
}

/* ---------- 响应式 ---------- */

@media (max-width: 1200px) {
  .video-body {
    grid-template-columns: minmax(0, 1fr) 320px;
    padding: 0 12px 4px;
  }

  .starters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 980px) {
  .video-page {
    padding: 0 8px 8px;
  }

  .video-body {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 60px 4px 6px;
  }

  .pchip-action {
    display: inline-flex;
  }

  .param-rail {
    position: fixed;
    right: 8px;
    bottom: 8px;
    left: 8px;
    z-index: 112;
    max-height: min(76vh, 620px);
    border-radius: 20px;
    transform: translateY(calc(100% + 20px));
    pointer-events: none;
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .param-rail.is-open {
    transform: translateY(0);
    pointer-events: auto;
  }

  .rail-close {
    display: block;
  }

  .rail-backdrop {
    position: fixed;
    inset: 0;
    z-index: 111;
    display: block;
    background: rgba(36, 31, 25, 0.28);
    backdrop-filter: blur(4px);
  }

  .batch-bar {
    flex-direction: column;
    gap: 8px;
  }

  .batch-actions {
    margin-left: 0;
  }

  .video-grid {
    grid-template-columns: repeat(min(var(--cols, 2), 2), minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .prompt-field {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .prompt-buttons {
    justify-content: flex-end;
    padding-bottom: 0;
  }

  .starters {
    grid-template-columns: 1fr;
  }

  .video-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .history-panel {
    width: 100%;
    border-left: 0;
  }
}


/* 创作导航是布局里的右列：挂在根节点上，不能落进竖向的 .video-shell */
.video-page > .studio-island {
  order: 2;
  align-self: stretch;
  height: auto;
}

.video-shell {
  flex: 1 1 auto;
  min-width: 0;
  padding-right: 18px;
}

@media (max-width: 980px) {
  .chat-page {
    flex-direction: column;
    padding: 16px 18px 18px;
  }

  .video-shell {
    padding-right: 0;
  }
}
</style>
