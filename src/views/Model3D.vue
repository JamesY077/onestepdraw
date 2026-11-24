<template>
  <div class="studio-page model3d-page" :style="{ '--studio-accent': 'var(--sf-ink)' }">
    <AppTopNav />

    <StudioHeader
      kicker="3D Studio"
      :title="pageMode === 'motion' ? '动作捕捉' : '3D 建模'"
      :subtitle="
        pageMode === 'motion'
          ? '上传人物视频，自动追踪姿态并输出可直接驱动三维角色的 BVH 动作数据'
          : 'V2Fun 三维重建：文生 3D、图生 3D、多视角 3D'
      "
      accent="var(--sf-ink)"
    >
      <template #actions>
        <span class="studio-chip">{{ model.displayName }}</span>
        <span class="studio-chip chip-live">
          <span class="live-dot" aria-hidden="true" />
          组装台在线
        </span>
      </template>
    </StudioHeader>

    <main class="model3d-main">
      <!-- ============================ 左栏：模型 / 输入 / 参数 ============================ -->
      <aside class="model3d-rail model3d-rail--left">
        <div class="rail-scroll studio-scroll">
          <!-- ---------- 引擎 ---------- -->
          <section class="studio-panel rail-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Engine · 01</span>
                <h2 class="studio-panel-title">选择引擎</h2>
              </div>
              <span class="studio-panel-meta">{{ modeModels.length }} 个模型</span>
            </header>

            <div class="model-grid">
              <button
                v-for="option in modeModels"
                :key="option.id"
                class="model-card"
                :class="{ active: option.id === modelId, motion: option.kind === 'motion' }"
                type="button"
                :aria-pressed="option.id === modelId"
                @click="selectModel(option)"
              >
                <span class="model-glyph" aria-hidden="true">
                  <svg v-if="option.kind === 'mesh'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
                    <path d="M12 2.8 20.2 7v10L12 21.2 3.8 17V7z" />
                    <path d="M3.8 7 12 11.3 20.2 7M12 11.3v9.9" opacity=".55" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2.8" y="5.4" width="11.4" height="13.2" rx="2.4" />
                    <path d="M14.2 10.4 21 7.2v9.6l-6.8-3.2z" />
                  </svg>
                </span>
                <span class="model-body">
                  <span class="model-line">
                    <span class="model-name">{{ option.shortName }}</span>
                    <span class="model-badge">{{ option.badge }}</span>
                  </span>
                  <span class="model-desc">{{ option.description }}</span>
                  <span class="model-foot">
                    <span class="model-price">{{ option.price }}</span>
                    <span class="model-tags">
                      <em v-for="tag in option.tags.slice(0, 3)" :key="tag">{{ tag }}</em>
                    </span>
                  </span>
                </span>
              </button>
            </div>
          </section>

          <!-- ---------- 输入 ---------- -->
          <section class="studio-panel rail-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Input · 02</span>
                <h2 class="studio-panel-title">{{ isMotion ? '视频动捕素材' : '建模输入' }}</h2>
              </div>
              <span class="studio-panel-meta">{{ isMotion ? '视频 · 片段' : '文本 · 图片' }}</span>
            </header>

            <!-- 3D 建模输入 -->
            <div v-if="!isMotion" class="panel-body">
              <div class="segmented" role="tablist" aria-label="输入方式">
                <button
                  v-for="tab in MESH_MODES"
                  :key="tab.value"
                  class="segmented-item"
                  :class="{ active: meshMode === tab.value }"
                  type="button"
                  role="tab"
                  :aria-selected="meshMode === tab.value"
                  @click="meshMode = tab.value"
                >
                  {{ tab.label }}
                </button>
              </div>

              <!-- 预览材质：本地渲染效果，不改变上游模型文件 -->
              <div class="material-block">
                <div class="material-head">
                  <span class="material-title">预览材质</span>
                  <span class="material-hint">仅影响预览 / 导出</span>
                </div>
                <div class="material-grid" role="tablist" aria-label="预览材质">
                  <button
                    v-for="item in MATERIAL_PRESETS"
                    :key="item.value"
                    class="material-chip"
                    :class="{ active: materialPreset === item.value }"
                    type="button"
                    role="tab"
                    :aria-selected="materialPreset === item.value"
                    :title="item.hint"
                    @click="materialPreset = item.value"
                  >
                    <span class="material-swatch" :style="{ background: item.swatch }" aria-hidden="true" />
                    {{ item.label }}
                  </button>
                </div>

                <div v-if="materialPreset === 'glass' && stats?.kind !== 'splat'" class="material-thickness">
                  <div class="material-thickness-head">
                    <span>玻璃厚度</span>
                    <span>{{ Math.round(materialThickness * 100) }}%</span>
                  </div>
                  <input v-model.number="materialThickness" class="time-range" type="range" min="0" max="1" step="0.01" />
                </div>

                <p class="field-hint">预览材质只影响本地渲染与导出；GLB / glTF 应用完整 PBR 材质，点云模型应用整体色调与通透度。</p>
              </div>

              <!-- 文本 -->
              <div v-if="meshMode === 'text'" class="input-block">
                <textarea
                  v-model="prompt"
                  class="studio-field prompt-input"
                  maxlength="2000"
                  placeholder="描述要建模的物体：单体、结构清晰、材质明确。例如：一位宇航员，全身站立，双手自然下垂，白色宇航服细节清晰。"
                  spellcheck="false"
                  @keydown.meta.enter.prevent="submit"
                  @keydown.ctrl.enter.prevent="submit"
                />
                <div class="field-meta">
                  <span>{{ prompt.length }} / 2000</span>
                  <span class="field-hint">⌘ / Ctrl + ↵ 直接生成</span>
                </div>

                <div class="preset-block">
                  <div class="preset-head">
                    <span>灵感预设</span>
                    <span class="preset-hint">点击填入</span>
                  </div>
                  <div class="preset-chips">
                    <button v-for="preset in MESH_PROMPT_PRESETS" :key="preset.label" class="preset-chip" type="button" @click="prompt = preset.prompt">
                      {{ preset.label }}
                    </button>
                  </div>
                </div>
              </div>

              <!-- 单图 -->
              <div v-else-if="meshMode === 'image'" class="input-block">
                <div
                  class="dropzone"
                  :class="{ filled: singleImage }"
                  role="button"
                  tabindex="0"
                  @click="chooseImage('single')"
                  @keydown.enter.prevent="chooseImage('single')"
                  @keydown.space.prevent="chooseImage('single')"
                  @dragover.prevent
                  @drop.prevent="dropImage($event, 'single')"
                >
                  <template v-if="singleImage">
                    <img class="dropzone-thumb" :src="singleImage.dataUrl" alt="参考图预览" />
                    <div class="dropzone-overlay">
                      <span>{{ singleImage.name }}</span>
                      <span>{{ singleImage.width }} × {{ singleImage.height }}</span>
                    </div>
                    <button class="thumb-clear" type="button" aria-label="移除图片" @click.stop="singleImage = null">×</button>
                  </template>
                  <template v-else>
                    <span class="dropzone-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="4.5" width="18" height="15" rx="3" />
                        <path d="M3.6 16.4 8.8 11l3.4 3.6 2.5-2.4 5.7 5.6" />
                        <circle cx="8.4" cy="9" r="1.5" />
                      </svg>
                    </span>
                    <span class="dropzone-title">上传一张参考图</span>
                    <span class="dropzone-sub">点击或拖拽 · PNG / JPG / WebP</span>
                  </template>
                </div>
                <p class="field-hint">建议单一主体、背景干净、主体完整不裁切。</p>
              </div>

              <!-- 多视角 -->
              <div v-else class="input-block">
                <div class="view-grid">
                  <div
                    v-for="slot in MULTI_VIEW_SLOTS"
                    :key="slot.key"
                    class="view-slot"
                    :class="{ filled: views[slot.key], required: slot.required }"
                    role="button"
                    tabindex="0"
                    @click="chooseImage(slot.key)"
                    @keydown.enter.prevent="chooseImage(slot.key)"
                    @keydown.space.prevent="chooseImage(slot.key)"
                    @dragover.prevent
                    @drop.prevent="dropImage($event, slot.key)"
                  >
                    <template v-if="views[slot.key]">
                      <img :src="views[slot.key]?.dataUrl" :alt="slot.label" />
                      <button class="thumb-clear" type="button" aria-label="移除图片" @click.stop="views[slot.key] = null">×</button>
                    </template>
                    <template v-else>
                      <span class="view-slot-label">{{ slot.label }}</span>
                      <span class="view-slot-hint">{{ slot.hint }}</span>
                    </template>
                  </div>
                </div>
                <p class="field-hint">正视图必填，补全左 / 背 / 右视图可以显著提升还原度；四个视角建议同一分辨率、主体居中。</p>
              </div>
            </div>

            <!-- 视频动捕输入 -->
            <div v-else class="panel-body">
              <div class="segmented" role="tablist" aria-label="视频来源">
                <button class="segmented-item" :class="{ active: videoSource === 'url' }" type="button" @click="videoSource = 'url'">视频地址</button>
                <button class="segmented-item" :class="{ active: videoSource === 'file' }" type="button" @click="videoSource = 'file'">本地上传</button>
              </div>

              <div v-if="videoSource === 'url'" class="input-block">
                <input v-model.trim="videoUrl" class="studio-field text-field" type="url" placeholder="https://... .mp4（服务商可访问的公网地址）" spellcheck="false" />
              </div>

              <div v-else class="input-block">
                <div
                  class="dropzone dropzone--video"
                  :class="{ filled: videoFile }"
                  role="button"
                  tabindex="0"
                  @click="videoInputRef?.click()"
                  @keydown.enter.prevent="videoInputRef?.click()"
                  @keydown.space.prevent="videoInputRef?.click()"
                  @dragover.prevent
                  @drop.prevent="dropVideo($event)"
                >
                  <template v-if="videoFile">
                    <span class="video-file-icon" aria-hidden="true">▣</span>
                    <span class="dropzone-title">{{ videoFile.name }}</span>
                    <span class="dropzone-sub">
                      {{ formatBytes(videoFile.size) }}
                      <template v-if="videoMeta?.duration"> · {{ videoMeta.duration.toFixed(1) }}s</template>
                    </span>
                    <button class="thumb-clear" type="button" aria-label="移除视频" @click.stop="clearVideo">×</button>
                  </template>
                  <template v-else>
                    <span class="dropzone-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2.8" y="5.4" width="11.4" height="13.2" rx="2.4" />
                        <path d="M14.2 10.4 21 7.2v9.6l-6.8-3.2z" />
                      </svg>
                    </span>
                    <span class="dropzone-title">上传一段人物视频</span>
                    <span class="dropzone-sub">MP4 / MOV / WebM · 建议 ≤ 50MB · 单人全身入镜</span>
                  </template>
                </div>
              </div>

              <div class="time-block">
                <div class="time-row">
                  <label class="time-field">
                    <span>起始时间</span>
                    <div class="time-input">
                      <input v-model.number="startSeconds" type="number" min="0" :max="maxStart" step="0.5" />
                      <em>s</em>
                    </div>
                  </label>
                  <label class="time-field">
                    <span>片段时长</span>
                    <div class="time-input">
                      <input v-model.number="durationSeconds" type="number" :min="MOTION_DURATION_LIMITS.min" :max="maxDuration" step="1" />
                      <em>s</em>
                    </div>
                  </label>
                </div>
                <input
                  class="time-range"
                  type="range"
                  :min="0"
                  :max="Math.max(0, maxStart)"
                  step="0.1"
                  :value="startSeconds"
                  @input="onSeek(($event.target as HTMLInputElement).value)"
                />
                <div class="time-meta">
                  <span>{{ videoDurationLabel }}</span>
                  <span>预估 {{ motionUnits }} 个计费单位 · 3 秒/单位</span>
                </div>
              </div>

              <p class="field-hint">动捕会在指定片段内追踪人物并输出 BVH 动作数据；多人入镜时按检测顺序输出多份。</p>
            </div>
          </section>

          <!-- ---------- 参数 ---------- -->
          <section class="studio-panel rail-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Params · 03</span>
                <h2 class="studio-panel-title">生成参数</h2>
              </div>
              <span class="studio-panel-meta">异步任务</span>
            </header>

            <div class="panel-body">
              <label class="project-name-field">
                <span class="project-name-label">项目名称</span>
                <input
                  v-model.trim="projectName"
                  class="studio-field text-field project-name-input"
                  type="text"
                  maxlength="40"
                  placeholder="默认用描述 / 素材名自动命名"
                  spellcheck="false"
                  @change="commitProjectName"
                  @keydown.enter.prevent="commitProjectName"
                />
              </label>

              <template v-if="!isMotion">
                <label class="switch-row">
                  <span class="switch-copy">
                    <span class="switch-title">生成纹理</span>
                    <span class="switch-sub">输出带颜色的模型（with_texture）</span>
                  </span>
                  <input v-model="withTexture" type="checkbox" />
                  <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
                </label>

                <label class="switch-row" :class="{ disabled: !withTexture }">
                  <span class="switch-copy">
                    <span class="switch-title">高清纹理</span>
                    <span class="switch-sub">提高纹理分辨率（hd_texture）</span>
                  </span>
                  <input v-model="hdTexture" type="checkbox" :disabled="!withTexture" />
                  <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
                </label>

                <label class="switch-row" :class="{ disabled: !withTexture }">
                  <span class="switch-copy">
                    <span class="switch-title">PBR 材质</span>
                    <span class="switch-sub">输出粗糙度 / 金属度贴图（pbr_texture）</span>
                  </span>
                  <input v-model="pbrTexture" type="checkbox" :disabled="!withTexture" />
                  <span class="switch-track" aria-hidden="true"><span class="switch-thumb" /></span>
                </label>
              </template>

              <div v-else class="billing-card">
                <div class="billing-row">
                  <span>计费单价</span>
                  <strong>{{ model.price }}</strong>
                </div>
                <div class="billing-row">
                  <span>本次预估</span>
                  <strong>{{ motionEstimate }}</strong>
                </div>
                <p class="billing-note">按实际处理秒数向上取整到 3 秒一档，最终以平台账单为准。</p>
              </div>
            </div>
          </section>
        </div>

        <div class="rail-actions">
          <button class="build-btn" type="button" :disabled="!canSubmit || isSubmitting" @click="submit">
            <span class="build-btn-glow" aria-hidden="true" />
            <span class="build-btn-label">
              <svg v-if="isMotion" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 18.5V6.2M20 18.5V6.2M4 12h16" />
                <circle cx="8.4" cy="8.2" r="2" />
                <circle cx="15.6" cy="15.6" r="2" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">
                <path d="M12 2.8 20.2 7v10L12 21.2 3.8 17V7z" />
                <path d="M12 8.2 16 10.4v4.2L12 16.8 8 14.6v-4.2z" />
              </svg>
              {{ submitLabel }}
            </span>
          </button>
          <p v-if="submitHint" class="build-hint">{{ submitHint }}</p>
        </div>
      </aside>

      <!-- ============================ 中央：全息组装台 ============================ -->
      <section class="stage-column">
        <div ref="stageShellRef" class="stage-shell" :class="[`phase-${taskPhase}`, { 'is-video': showVideoStage }]">
          <div class="stage-topbar">
            <div class="stage-ident">
              <span class="stage-dot" :class="`dot-${taskPhase}`" aria-hidden="true" />
              <span class="stage-ident-model">{{ model.shortName }}</span>
              <span class="stage-ident-divider" aria-hidden="true" />
              <span class="stage-ident-mode">{{ isMotion ? 'MOTION CAPTURE' : meshMode === 'text' ? 'TEXT → 3D' : meshMode === 'image' ? 'IMAGE → 3D' : 'MULTI-VIEW → 3D' }}</span>
              <span class="stage-ident-status">{{ stageStatusText }}</span>
            </div>
            <div class="stage-actions">
              <button class="stage-action" type="button" :disabled="!viewerReady" title="重置视角" @click="resetView">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 11a8 8 0 1 1 2.6 5.9" />
                  <path d="M4 5.5V11h5.4" />
                </svg>
              </button>
              <button class="stage-action" type="button" :disabled="!viewerReady" title="导出产物" @click="openExport">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 8.3h3.2L9 5.6h6l1.8 2.7H20v10.1H4z" />
                  <circle cx="12" cy="13.2" r="3.1" />
                </svg>
              </button>
              <button class="stage-action" type="button" title="全屏查看" @click="toggleFullscreen">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                </svg>
              </button>
            </div>
          </div>

          <div class="stage-viewport">
            <!-- AI 生成背景（位于透明画布之后，模型浮在场景上） -->
            <div
              v-if="bgImage && !showVideoStage"
              class="stage-backdrop"
              :style="{ backgroundImage: `url(${bgImage})` }"
              aria-hidden="true"
            />

            <!-- Three.js 画布 -->
            <div ref="stageRef" class="stage-canvas" v-show="!showVideoStage" />

            <!-- 预览视频（动捕 / 无 CORS 时的兜底） -->
            <div v-if="showVideoStage" class="stage-video-wrap">
              <video
                ref="stageVideoRef"
                class="stage-video"
                :src="stageVideoSrc"
                controls
                autoplay
                loop
                muted
                playsinline
              />
              <div class="stage-video-tag">
                <span class="live-dot" aria-hidden="true" />
                {{ isMotion ? 'MOTION PREVIEW' : 'OFFICIAL PREVIEW' }}
              </div>
            </div>

            <!-- HUD 装饰 -->
            <div class="hud" aria-hidden="true">
              <span class="hud-corner hud-corner--tl" />
              <span class="hud-corner hud-corner--tr" />
              <span class="hud-corner hud-corner--bl" />
              <span class="hud-corner hud-corner--br" />
              <span class="hud-scan" />
              <span class="hud-line hud-line--h" />
              <span class="hud-line hud-line--v" />
              <span class="hud-ticks hud-ticks--left" />
              <span class="hud-ticks hud-ticks--right" />
            </div>

            <!-- 空闲态提示 -->
            <div v-if="!showVideoStage && viewerState === 'idle' && !isRunning && !stageNotice" class="stage-idle">
              <span class="idle-title">装配台待命</span>
              <span class="idle-sub">
                {{
                  isMotion
                    ? '左侧填写视频地址或上传片段，动捕结果会在这里播放'
                    : '左侧选择模型并提交描述，生成的模型会在这里逐层显影'
                }}
              </span>
            </div>

            <!-- 任务执行中：装配台运转状态 -->
            <div v-if="!showVideoStage && isRunning && viewerState === 'idle'" class="stage-building">
              <span class="building-badge">
                <span class="live-dot" aria-hidden="true" />
                LIVE ASSEMBLY
              </span>
              <span class="building-title">正在装配模型</span>
              <span class="building-sub">{{ stageLabel }} · {{ stageStatusText }}</span>
              <div class="building-bar">
                <span class="progress-fill" :class="{ indeterminate: !hasRealProgress }" :style="{ width: `${progressPercent}%` }" />
              </div>
              <span class="building-percent">{{ progressPercent }}%</span>
            </div>

            <!-- 加载态 -->
            <div v-if="!showVideoStage && viewerState === 'loading'" class="stage-loading">
              <span class="loading-ring" aria-hidden="true" />
              <span class="loading-title">正在装配模型</span>
              <span class="loading-sub">{{ loadLabel }}</span>
              <div class="loading-bar"><span :style="{ width: `${loadProgressPercent}%` }" /></div>
            </div>

            <!-- 失败 / 兜底提示 -->
            <div v-if="stageNotice" class="stage-notice" :class="{ error: stageNoticeTone === 'error' }">
              <span class="notice-icon" aria-hidden="true">!</span>
              <div class="notice-copy">
                <span>{{ stageNotice }}</span>
                <button v-if="canRetryModel" class="notice-action" type="button" @click="retryLoadModel">重试加载模型</button>
              </div>
            </div>

            <!-- 左下角读数（仅 3D 装配台显示；动捕预览时这些数值无意义） -->
            <div v-if="!showVideoStage" class="hud-readout hud-readout--left">
              <span class="readout-key">FORMAT</span>
              <span class="readout-value">{{ statsLabel }}</span>
              <span class="readout-key">SIZE</span>
              <span class="readout-value">{{ stats ? formatBytes(stats.bytes) : '—' }}</span>
            </div>
          </div>

          <div v-if="!showVideoStage" class="stage-toolbar">
            <div class="tool-group">
              <button class="tool-chip" :class="{ active: autoRotate }" type="button" :disabled="!viewerReady" @click="toggleAutoRotate">
                <span class="chip-dot" aria-hidden="true" />自动旋转
              </button>
              <button class="tool-chip" :class="{ active: showGrid }" type="button" :disabled="!viewerReady" @click="toggleGrid">栅格</button>
            </div>

            <div class="tool-group tool-group--views">
              <span class="tool-group-label">机位</span>
              <button
                v-for="preset in VIEW_PRESETS"
                :key="preset.value"
                class="tool-chip tool-chip--compact"
                :class="{ active: viewPreset === preset.value }"
                type="button"
                :disabled="!viewerReady"
                :title="`${preset.label}视图`"
                @click="setView(preset.value)"
              >
                {{ preset.label }}
              </button>
            </div>

            <div class="tool-group">
              <button
                class="tool-chip tool-chip--bg"
                :class="{ active: Boolean(bgImage) }"
                type="button"
                :disabled="!viewerReady"
                @click="openBackground"
              >
                <span class="chip-dot" aria-hidden="true" />AI 背景
              </button>
            </div>

            <span class="tool-tip">拖拽旋转 · 滚轮缩放 · 右键平移</span>
          </div>
        </div>

        <div class="stage-steps">
          <div v-for="step in assemblySteps" :key="step.key" class="stage-step" :class="{ active: step.active, done: step.done }">
            <span class="step-index">{{ step.index }}</span>
            <span class="step-copy">
              <strong>{{ step.title }}</strong>
              <em>{{ step.sub }}</em>
            </span>
          </div>
        </div>
      </section>

      <!-- ============================ 右栏：任务 / 产物 / 历史 ============================ -->
      <aside class="model3d-rail model3d-rail--right studio-scroll">
        <section class="studio-panel rail-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Task · 04</span>
              <h2 class="studio-panel-title">任务状态</h2>
            </div>
            <span class="status-pill" :class="`status-${taskPhase}`">{{ stageStatusText }}</span>
          </header>

          <div class="panel-body">
            <div class="progress-track">
              <span class="progress-fill" :class="{ indeterminate: isRunning && !hasRealProgress }" :style="{ width: `${progressPercent}%` }" />
            </div>
            <div class="progress-meta">
              <span>{{ progressPercent }}%</span>
              <span>{{ elapsedLabel }}</span>
            </div>

            <dl class="task-meta">
              <div>
                <dt>任务 ID</dt>
                <dd>
                  <button v-if="task?.task_uuid" class="copy-btn" type="button" title="复制任务 ID" @click="copyTaskId">
                    {{ shortTaskId }}
                  </button>
                  <span v-else>—</span>
                </dd>
              </div>
              <div>
                <dt>阶段</dt>
                <dd>{{ stageLabel }}</dd>
              </div>
            </dl>

            <p v-if="errorMessage" class="inline-error">{{ errorMessage }}</p>

            <button v-if="isRunning" class="studio-btn cancel-btn" type="button" @click="stopPolling(true)">停止轮询</button>
          </div>
        </section>

        <section class="studio-panel rail-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Output · 05</span>
              <h2 class="studio-panel-title">产物</h2>
            </div>
            <span class="studio-panel-meta">{{ assets.length }} 个文件</span>
          </header>

          <div class="panel-body">
            <button
              v-if="task?.task_uuid"
              class="project-strip"
              type="button"
              title="点击重命名项目"
              @click="focusProjectName"
            >
              <span class="project-strip-label">项目</span>
              <span class="project-strip-name" :title="displayProjectName">{{ displayProjectName }}</span>
              <svg class="project-strip-pen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8z" />
                <path d="M13.6 6.2 17.8 10.4" />
              </svg>
            </button>

            <div v-if="!assets.length" class="empty-block">
              <span>任务完成后，模型文件与预览视频会出现在这里。</span>
            </div>

            <ul v-else class="asset-list">
              <li v-for="asset in pagedAssets" :key="asset.path" class="asset-item">
                <span class="asset-icon" :class="`asset-${asset.kind}`" aria-hidden="true">
                  {{ asset.kind === 'mesh' ? '◈' : asset.kind === 'video' ? '▷' : asset.kind === 'motion' ? '⌁' : '◇' }}
                </span>
                <div class="asset-copy">
                  <span class="asset-name">{{ asset.label }}</span>
                  <span class="asset-sub">{{ assetSubLabel(asset) }}</span>
                </div>
                <div class="asset-actions">
                  <button
                    class="asset-btn"
                    type="button"
                    title="下载"
                    :disabled="downloadBusy === asset.path"
                    @click="handleDownload(asset)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 4v10.5M8.2 11l3.8 3.8L15.8 11M5 19h14" />
                    </svg>
                  </button>
                  <button v-if="asset.kind === 'video' || asset.kind === 'mesh'" class="asset-btn" type="button" title="在新窗口打开" @click="openAsset(asset.url)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M13.5 5H19v5.5M19 5l-7.2 7.2M17 14.2V19H5V7h4.8" />
                    </svg>
                  </button>
                </div>
              </li>
            </ul>

            <RailPager v-if="assets.length" :page="assetPage" :page-count="assetPageCount" @update:page="assetPage = $event" />
          </div>
        </section>

        <section class="studio-panel rail-panel rail-panel--history">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">History · 06</span>
              <h2 class="studio-panel-title">历史任务</h2>
            </div>
            <button v-if="historyEntries.length" class="link-btn" type="button" @click="historyEntries = clearHistory()">清空</button>
          </header>

          <div class="panel-body">
            <div v-if="!historyEntries.length" class="empty-block">
              <span>还没有任务。提交后会保留任务 ID，方便随时回看。</span>
            </div>
            <ul v-else class="history-list">
              <li v-for="entry in pagedHistory" :key="entry.taskId" class="history-row">
                <input
                  v-if="renamingId === entry.taskId"
                  v-model.trim="renameDraft"
                  class="history-rename-input"
                  type="text"
                  maxlength="40"
                  spellcheck="false"
                  aria-label="项目名称"
                  @keydown.enter.prevent="commitRename(entry)"
                  @keydown.esc.prevent="cancelRename()"
                  @blur="commitRename(entry)"
                />
                <template v-else>
                  <button
                    class="history-item"
                    :class="{ active: task?.task_uuid === entry.taskId }"
                    type="button"
                    @click="restoreTask(entry)"
                  >
                    <span class="history-head">
                      <span class="history-name">{{ historyDisplayName(entry) }}</span>
                      <span class="history-head-right">
                        <span class="history-time">{{ formatRelativeTime(entry.createdAt) }}</span>
                        <span class="history-status" :class="`hs-${entry.status}`">{{ historyStatusText(entry.status) }}</span>
                      </span>
                    </span>
                    <span class="history-prompt">
                      <span class="history-model">{{ getModel3D(entry.modelId).shortName }}</span>
                      {{ entry.prompt || '（未填写描述）' }}
                    </span>
                  </button>
                  <button
                    class="history-rename"
                    type="button"
                    title="重命名项目"
                    aria-label="重命名项目"
                    @click="startRename(entry)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M4 20h4.2L19 9.2 14.8 5 4 15.8z" />
                      <path d="M13.6 6.2 17.8 10.4" />
                    </svg>
                  </button>
                </template>
              </li>
            </ul>

            <RailPager
              v-if="modeHistory.length"
              :page="historyPage"
              :page-count="historyPageCount"
              @update:page="historyPage = $event"
            />
          </div>
        </section>
      </aside>
    </main>

    <!-- ============================ 导出 ============================ -->
    <div v-if="exportOpen" class="studio-modal" role="dialog" aria-modal="true" aria-label="导出产物" @click.self="exportOpen = false">
      <div class="modal-card">
        <header class="modal-head">
          <div class="modal-headings">
            <span class="modal-kicker">Export · {{ exportKind === 'image' ? 'IMAGE' : exportKind === 'gif' ? 'GIF' : 'MODEL' }}</span>
            <h3 class="modal-title">{{ exportKind === 'image' ? '导出静态图' : exportKind === 'gif' ? '导出旋转动图' : '导出 3D 模型' }}</h3>
          </div>
          <button class="modal-close" type="button" aria-label="关闭" @click="exportOpen = false">×</button>
        </header>

        <div class="modal-body">
          <div class="modal-field">
            <span class="modal-label">类型</span>
            <div class="segmented">
              <button
                class="segmented-item"
                :class="{ active: exportKind === 'image' }"
                type="button"
                @click="setExportKind('image')"
              >
                图片
              </button>
              <button
                class="segmented-item"
                :class="{ active: exportKind === 'gif' }"
                type="button"
                @click="setExportKind('gif')"
              >
                动图 GIF
              </button>
              <button
                class="segmented-item"
                :class="{ active: exportKind === 'model' }"
                type="button"
                @click="setExportKind('model')"
              >
                3D 模型
              </button>
            </div>
          </div>

          <template v-if="exportKind === 'image'">
            <div class="modal-field">
              <span class="modal-label">图片格式</span>
              <div class="segmented">
                <button
                  v-for="item in EXPORT_IMAGE_FORMATS"
                  :key="item.value"
                  class="segmented-item"
                  :class="{ active: exportImageFormat === item.value }"
                  type="button"
                  @click="exportImageFormat = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
              <p class="field-hint">
                {{ EXPORT_IMAGE_FORMATS.find((item) => item.value === exportImageFormat)?.hint }}
                <template v-if="exportImageFormat === 'jpeg' && exportBackground === 'transparent'">
                  JPG 不支持透明，将自动使用白色背景。
                </template>
              </p>
            </div>

            <div class="modal-field">
              <span class="modal-label">背景</span>
              <div class="segmented">
                <button
                  v-for="item in EXPORT_BACKGROUNDS"
                  :key="item.value"
                  class="segmented-item"
                  :class="{ active: exportBackground === item.value }"
                  type="button"
                  @click="exportBackground = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div v-if="exportBackground === 'solid'" class="modal-field">
              <span class="modal-label">纯色</span>
              <div class="color-row">
                <input v-model="exportColor" class="color-input" type="color" aria-label="导出背景颜色" />
                <span class="color-value">{{ exportColor.toUpperCase() }}</span>
                <div class="swatch-row">
                  <button
                    v-for="color in EXPORT_COLORS"
                    :key="color"
                    class="swatch"
                    :class="{ active: exportColor.toLowerCase() === color.toLowerCase() }"
                    type="button"
                    :style="{ background: color }"
                    :aria-label="color"
                    @click="exportColor = color"
                  />
                </div>
              </div>
            </div>

            <p v-if="exportBackground === 'scene' && !bgImage" class="field-hint">
              还没有 AI 背景，本次会回落到蓝色舞台渐变。
            </p>
            <p v-else-if="exportBackground === 'scene' && !bgExportable" class="field-hint">
              当前背景图未走同源反代，直接导出会被浏览器拦截；请配置 /ai-image-assets 反代后重试。
            </p>
            <p class="field-hint">导出会自动隐藏栅格、地面与扫描环，只保留模型本体。</p>
          </template>

          <template v-else-if="exportKind === 'gif'">
            <div class="modal-field">
              <span class="modal-label">尺寸</span>
              <div class="segmented">
                <button
                  v-for="item in GIF_SIZES"
                  :key="item.value"
                  class="segmented-item"
                  :class="{ active: gifSize === item.value }"
                  type="button"
                  @click="gifSize = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div class="modal-field">
              <span class="modal-label">转一圈</span>
              <div class="segmented">
                <button
                  v-for="item in GIF_DURATIONS"
                  :key="item.value"
                  class="segmented-item"
                  :class="{ active: gifSeconds === item.value }"
                  type="button"
                  @click="gifSeconds = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div class="modal-field">
              <span class="modal-label">背景</span>
              <div class="segmented">
                <button
                  v-for="item in GIF_BACKGROUNDS"
                  :key="item.value"
                  class="segmented-item"
                  :class="{ active: gifBackground === item.value }"
                  type="button"
                  @click="gifBackground = item.value"
                >
                  {{ item.label }}
                </button>
              </div>
            </div>

            <div v-if="gifBackground === 'solid'" class="modal-field">
              <span class="modal-label">纯色</span>
              <div class="color-row">
                <input v-model="exportColor" class="color-input" type="color" aria-label="动图背景颜色" />
                <span class="color-value">{{ exportColor.toUpperCase() }}</span>
                <div class="swatch-row">
                  <button
                    v-for="color in EXPORT_COLORS"
                    :key="color"
                    class="swatch"
                    :class="{ active: exportColor.toLowerCase() === color.toLowerCase() }"
                    type="button"
                    :style="{ background: color }"
                    :aria-label="color"
                    @click="exportColor = color"
                  />
                </div>
              </div>
            </div>

            <p v-if="gifBackground === 'scene' && !bgImage" class="field-hint">
              还没有 AI 背景，本次会回落到蓝色舞台渐变。
            </p>
            <p class="field-hint">
              自动绕模型转一整圈：{{ gifFrames }} 帧 · {{ (gifFrames * GIF_DELAY_MS / 1000).toFixed(1) }} 秒 · 循环播放。
              GIF 只有 256 色，渐变背景可能出现轻微色带。
            </p>
          </template>

          <template v-else>
            <div class="modal-field">
              <span class="modal-label">模型格式</span>
              <div class="format-grid">
                <button
                  v-for="item in EXPORT_MODEL_FORMATS"
                  :key="item.value"
                  class="format-chip"
                  :class="{ active: exportModelFormat === item.value }"
                  type="button"
                  @click="exportModelFormat = item.value"
                >
                  <span class="format-name">{{ item.label }}</span>
                  <span class="format-hint">{{ item.hint }}</span>
                </button>
              </div>
            </div>
            <p class="field-hint">
              GLB / glTF 会带上当前预览材质与贴图，可直接导入 Blender、Maya、3ds Max、C4D 等建模软件；OBJ 仅几何与 UV，STL 仅三角面。
            </p>
            <p v-if="stats && stats.kind === 'splat'" class="field-hint">
              当前是高斯点云模型，无法转换为三角网格；请从右侧产物中下载原始 PLY。
            </p>
          </template>
        </div>

        <footer class="modal-foot">
          <button class="studio-btn" type="button" @click="exportOpen = false">取消</button>
          <button
            class="studio-btn studio-btn--primary"
            type="button"
            :disabled="exportBusy || (exportKind === 'model' && stats?.kind === 'splat')"
            @click="runExport"
          >
            {{
              exportBusy
                ? exportKind === 'gif'
                  ? `正在编码 ${gifProgress}/${gifFrames} 帧…`
                  : '正在导出…'
                : exportKind === 'image'
                  ? '导出图片'
                  : exportKind === 'gif'
                    ? '导出 GIF'
                    : `导出 ${exportModelFormat.toUpperCase()}`
            }}
          </button>
        </footer>
      </div>
    </div>

    <!-- ============================ AI 背景 ============================ -->
    <div v-if="bgOpen" class="studio-modal" role="dialog" aria-modal="true" aria-label="AI 背景" @click.self="bgOpen = false">
      <div class="modal-card modal-card--wide">
        <header class="modal-head">
          <div class="modal-headings">
            <span class="modal-kicker">Scene · AI</span>
            <h3 class="modal-title">一句话补充背景</h3>
          </div>
          <button class="modal-close" type="button" aria-label="关闭" @click="bgOpen = false">×</button>
        </header>

        <div class="modal-body">
          <div v-if="bgImage" class="bg-preview">
            <img :src="bgImage" alt="当前 AI 背景预览" />
            <button class="thumb-clear" type="button" aria-label="移除背景" @click="removeBackground">×</button>
          </div>

          <label class="modal-field">
            <span class="modal-label">背景描述</span>
            <input
              v-model.trim="bgPrompt"
              class="studio-field text-field"
              type="text"
              maxlength="200"
              placeholder="例如：月球表面，远处是蓝色地球，冷色调星空"
              spellcheck="false"
              @keydown.enter.prevent="generateBackground"
            />
          </label>

          <p class="field-hint">
            调用 {{ AI_BG_MODEL }} 生成 4:3 背景图，仅用于当前预览与图片导出，不会改写模型文件。
          </p>
          <p v-if="bgError" class="inline-error">{{ bgError }}</p>
        </div>

        <footer class="modal-foot">
          <button v-if="bgImage" class="studio-btn" type="button" @click="removeBackground">移除背景</button>
          <span class="modal-spacer" />
          <button class="studio-btn" type="button" @click="bgOpen = false">取消</button>
          <button class="studio-btn studio-btn--primary" type="button" :disabled="bgBusy || !bgPrompt" @click="generateBackground">
            {{ bgBusy ? '生成中…' : '生成背景' }}
          </button>
        </footer>
      </div>
    </div>

    <input ref="imageInputRef" class="hidden-input" type="file" accept="image/png,image/jpeg,image/webp,image/bmp" @change="onImageInputChange" />
    <input ref="videoInputRef" class="hidden-input" type="file" accept="video/mp4,video/quicktime,video/webm" @change="onVideoInputChange" />

    <p v-if="downloadNotice" class="asset-notice" role="status">{{ downloadNotice }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import StudioHeader from '@/components/StudioHeader.vue'
import AppTopNav from '@/components/AppTopNav.vue'
import RailPager from '@/components/RailPager.vue'
import {
  DEFAULT_MODEL3D_ID,
  MODEL3D_OPTIONS,
  MOTION_DURATION_LIMITS,
  MULTI_VIEW_SLOTS,
  MESH_PROMPT_PRESETS,
  getModel3D,
  type MeshInputMode,
  type Model3DOption,
  type MultiViewKey,
} from '@/features/model3d/models'
import {
  collectMeshAssets,
  collectMotionAssets,
  createMeshTask,
  createMotionTask,
  getMeshTask,
  getMotionTask,
  pickMeshAsset,
  pickPreviewVideo,
  taskFailureMessage,
  taskRequestError,
  type MeshTaskResult,
  type MotionTaskResult,
  type TaskAsset,
} from '@/api/model3d'
import { AssetError, downloadAsset, formatBytes, mediaUrl } from '@/features/model3d/assets'
import { normalizeMultiViewImages } from '@/features/model3d/multiView'
import {
  HologramViewer,
  type ModelExportFormat,
  type ViewerMaterial,
  type ViewerStats,
  type ViewerView,
} from '@/features/model3d/viewer'
import {
  addHistoryEntry,
  clearHistory,
  formatRelativeTime,
  historyDisplayName,
  loadHistory,
  renameHistoryEntry,
  updateHistoryStatus,
  type Model3DHistoryEntry,
} from '@/features/model3d/history'
import { prepareLocalImageDataUri } from '@/features/generate/localImage'
import { fileToBase64 } from '@/features/generate/files'
import { generateImage } from '@/api/aiping'
import { aspectRatioToImageSize } from '@/features/generate/aspectRatio'

type PageMode = 'mesh' | 'motion'

const MESH_MODES: { value: MeshInputMode; label: string }[] = [
  { value: 'text', label: '文生 3D' },
  { value: 'image', label: '图生 3D' },
  { value: 'multi', label: '多视角' },
]

const MATERIAL_PRESETS: { value: ViewerMaterial; label: string; hint: string; swatch: string }[] = [
  { value: 'original', label: '原始', hint: '保留模型自带贴图与颜色', swatch: 'linear-gradient(135deg, #9fb4c8, #4c637a)' },
  { value: 'matte', label: '哑光', hint: '低反光，接近手办 / 黏土', swatch: 'linear-gradient(135deg, #97a1aa, #4c5560)' },
  { value: 'ceramic', label: '陶瓷', hint: '清漆釉面，柔和高光', swatch: 'linear-gradient(135deg, #fdfaf2, #cfc8ba)' },
  { value: 'metal', label: '金属', hint: '保留贴图的金属质感', swatch: 'linear-gradient(135deg, #e2edf7, #6b7d90)' },
  { value: 'chrome', label: '镀铬', hint: '镜面反射，高对比高光', swatch: 'linear-gradient(135deg, var(--sf-surface), #8ea6bb)' },
  { value: 'gold', label: '黄金', hint: '暖金金属，适合奖杯 / 饰品', swatch: 'linear-gradient(135deg, #ffe9a8, #c79320)' },
  { value: 'glass', label: '玻璃', hint: '可调厚度的透射材质', swatch: 'linear-gradient(135deg, rgba(223,242,255,0.95), rgba(120,190,230,0.45))' },
  { value: 'jade', label: '玉石', hint: '半透青玉，温润光泽', swatch: 'linear-gradient(135deg, #b8f3d6, #2f9c72)' },
]

const VIEW_PRESETS: { value: ViewerView; label: string }[] = [
  { value: 'iso', label: '等轴' },
  { value: 'front', label: '前视' },
  { value: 'back', label: '后视' },
  { value: 'left', label: '左视' },
  { value: 'right', label: '右视' },
]

const EXPORT_BACKGROUNDS: { value: ExportBackground; label: string }[] = [
  { value: 'transparent', label: '透明' },
  { value: 'solid', label: '纯色' },
  { value: 'scene', label: 'AI 场景' },
]

type ExportBackground = 'transparent' | 'solid' | 'scene'

const EXPORT_IMAGE_FORMATS: { value: 'png' | 'jpeg' | 'webp'; label: string; hint: string }[] = [
  { value: 'png', label: 'PNG', hint: '支持透明通道，画质无损' },
  { value: 'jpeg', label: 'JPG', hint: '体积小，无透明通道' },
  { value: 'webp', label: 'WebP', hint: '体积更小，支持透明' },
]

const EXPORT_MODEL_FORMATS: { value: ModelExportFormat; label: string; hint: string }[] = [
  { value: 'glb', label: 'GLB', hint: '单文件含材质贴图，通用首选' },
  { value: 'gltf', label: 'glTF', hint: 'JSON 结构，便于二次编辑' },
  { value: 'obj', label: 'OBJ', hint: '兼容 Blender / Maya / C4D，文件较大' },
  { value: 'stl', label: 'STL', hint: '仅几何，适合 3D 打印' },
  { value: 'ply', label: 'PLY', hint: '网格 + 顶点色，适合扫描类软件' },
]

const EXPORT_COLORS = ['#0b1626', 'var(--sf-surface)', 'var(--sf-ink)', 'var(--sf-ink)', '#f5e7d0', '#1d2b36']

/** 动图导出：GIF 只有 256 色，尺寸和帧数都要控制，否则几分钟都编不完。 */
const GIF_SIZES = [
  { value: 360, label: '360' },
  { value: 480, label: '480' },
  { value: 640, label: '640' },
]
const GIF_DURATIONS = [
  { value: 3, label: '3 秒' },
  { value: 4, label: '4 秒' },
  { value: 6, label: '6 秒' },
]
const GIF_DELAY_MS = 60
const GIF_BACKGROUNDS: { value: 'scene' | 'solid'; label: string }[] = [
  { value: 'scene', label: 'AI 场景' },
  { value: 'solid', label: '纯色' },
]

type ExportKind = 'image' | 'gif' | 'model'

const AI_BG_MODEL = 'Doubao-Seedream-5.0-lite'

/* ------------------------------------------------------------- 表单状态 */

const route = useRoute()
const pageMode = computed<PageMode>(() => (route.path.startsWith('/motion') ? 'motion' : 'mesh'))
const modeModels = computed(() => MODEL3D_OPTIONS.filter((item) => item.kind === pageMode.value))

const modelId = ref(pageMode.value === 'motion' ? modeModels.value[0].id : DEFAULT_MODEL3D_ID)
const model = computed<Model3DOption>(() => getModel3D(modelId.value))
const isMotion = computed(() => model.value.kind === 'motion')

const meshMode = ref<MeshInputMode>('text')
const prompt = ref('')
const singleImage = ref<{ dataUrl: string; name: string; width: number; height: number } | null>(null)
const views = reactive<Record<MultiViewKey, { dataUrl: string; name: string } | null>>({
  front: null,
  left: null,
  back: null,
  right: null,
})

const videoSource = ref<'url' | 'file'>('url')
const videoUrl = ref('')
const videoFile = ref<{ name: string; size: number; dataUrl: string } | null>(null)
const videoMeta = ref<{ duration: number; width: number; height: number } | null>(null)
const videoObjectUrl = ref('')
const startSeconds = ref<number>(0)
const durationSeconds = ref<number>(MOTION_DURATION_LIMITS.defaultValue)

const withTexture = ref(true)
const hdTexture = ref(false)
const pbrTexture = ref(false)

const isSubmitting = ref(false)

/* ------------------------------------------------------------- 任务状态 */

const task = ref<MeshTaskResult | MotionTaskResult | null>(null)
const taskKind = ref<'mesh' | 'motion'>('mesh')
const taskPhase = ref<'idle' | 'running' | 'done' | 'failed'>('idle')
const errorMessage = ref('')
const elapsedMs = ref(0)
const historyEntries = ref<Model3DHistoryEntry[]>(loadHistory())

let pollTimer: number | null = null
let tickTimer: number | null = null
let pollBusy = false
let taskStartedAt = 0

const isRunning = computed(() => taskPhase.value === 'running')
const currentAssets = computed<TaskAsset[]>(() => {
  if (!task.value) return []
  return taskKind.value === 'motion'
    ? collectMotionAssets(task.value as MotionTaskResult)
    : collectMeshAssets(task.value as MeshTaskResult)
})
const assets = computed(() => currentAssets.value)

/* --------------------------------------------------------- 右栏翻页 */

/** 产物 / 历史都按 3 条一页展示，避免右栏无限拉长。 */
const RAIL_PAGE_SIZE = 3
const assetPage = ref(1)
const historyPage = ref(1)

const assetPageCount = computed(() => Math.max(1, Math.ceil(assets.value.length / RAIL_PAGE_SIZE)))
const pagedAssets = computed(() =>
  assets.value.slice((assetPage.value - 1) * RAIL_PAGE_SIZE, assetPage.value * RAIL_PAGE_SIZE),
)

/** 历史只展示当前分区（3D / 动捕）的任务。 */
const modeHistory = computed(() => historyEntries.value.filter((entry) => entry.kind === pageMode.value))
const historyPageCount = computed(() => Math.max(1, Math.ceil(modeHistory.value.length / RAIL_PAGE_SIZE)))
const pagedHistory = computed(() =>
  modeHistory.value.slice((historyPage.value - 1) * RAIL_PAGE_SIZE, historyPage.value * RAIL_PAGE_SIZE),
)

/** 当前任务对应的历史项（项目名称就存在这条记录里）。 */
const currentEntry = computed(
  () => historyEntries.value.find((entry) => entry.taskId === task.value?.task_uuid) ?? null,
)
/** 右栏 / 导出用的展示名：历史记录优先，输入框次之。 */
const displayProjectName = computed(
  () => historyDisplayName(currentEntry.value) || projectName.value.trim() || '未命名项目',
)

const gifFrames = computed(() => Math.max(20, Math.round((gifSeconds.value * 1000) / GIF_DELAY_MS)))

// 切换任务后产物整体变化，回到第一页；任务变少时把页码收回到最后一页。
watch(() => task.value?.task_uuid, () => {
  assetPage.value = 1
  downloadNotice.value = ''
  downloadBusy.value = ''
  if (noticeTimer) {
    window.clearTimeout(noticeTimer)
    noticeTimer = null
  }
})
watch(assetPageCount, (count) => {
  if (assetPage.value > count) assetPage.value = count
})
watch(() => modeHistory.value.length, () => {
  historyPage.value = 1
})

const hasRealProgress = computed(() => {
  const value = task.value?.progress
  return typeof value === 'number' && value > 0 && value < 1
})

const progressPercent = computed(() => {
  if (taskPhase.value === 'done') return 100
  if (taskPhase.value === 'idle') return 0
  if (taskPhase.value === 'failed') return 100
  const status = task.value?.status
  if (status === 'QUEUED') return 6
  const raw = task.value?.progress
  if (typeof raw === 'number' && raw > 0 && raw < 1) return Math.max(8, Math.round(raw * 100))
  // 上游 progress 有时直接给 1，用时间做兜底估算（90 秒左右收敛到 92%）。
  const seconds = elapsedMs.value / 1000
  return Math.min(92, 12 + Math.round((seconds / 90) * 80))
})

const stageStatusText = computed(() => {
  if (taskPhase.value === 'idle') return '待命'
  if (taskPhase.value === 'failed') return '失败'
  if (taskPhase.value === 'done') return '已完成'
  const status = task.value?.status
  if (status === 'QUEUED') return '排队中'
  return '建模中'
})

const stageLabel = computed(() => {
  if (taskPhase.value === 'idle') return '等待提交'
  if (taskPhase.value === 'failed') return '执行失败'
  if (taskPhase.value === 'done') return '装配完成'
  const status = task.value?.status
  if (status === 'QUEUED') return '排队等待 GPU'
  const stage = (task.value as MeshTaskResult | null)?.stage
  if (stage === 'mesh_generate') return '几何重建'
  if (stage === 'texture') return '纹理烘焙'
  if (stage === 'motion_detect' || stage === 'motion_detection') return '动作捕捉'
  return taskKind.value === 'motion' ? '动作捕捉' : '几何重建'
})

const elapsedLabel = computed(() => {
  if (!taskStartedAt) return '—'
  const seconds = Math.max(0, Math.round(elapsedMs.value / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
})

const shortTaskId = computed(() => {
  const id = task.value?.task_uuid || ''
  return id ? `${id.slice(0, 8)}…${id.slice(-4)}` : '—'
})

const motionUnits = computed(() => Math.max(1, Math.ceil(durationSeconds.value / 3)))
const motionEstimate = computed(() => {
  const unitPrice = model.value.id.includes('Turbo') ? 0.1 : 1
  return `¥${(unitPrice * motionUnits.value).toFixed(2)}`
})

const videoTotal = computed(() => {
  const duration = videoMeta.value?.duration || 0
  return Number.isFinite(duration) && duration > 0 ? duration : 0
})
const videoDurationLabel = computed(() =>
  videoTotal.value ? `视频总长 ${videoTotal.value.toFixed(1)}s` : '时长未知（URL 源无法预读）',
)

const maxDuration = computed(() => {
  const detected = videoTotal.value
  if (!detected) return MOTION_DURATION_LIMITS.max
  return Math.max(1, Math.min(MOTION_DURATION_LIMITS.max, Math.floor(detected - startSeconds.value)))
})
const maxStart = computed(() => {
  const detected = videoTotal.value
  if (!detected) return MOTION_DURATION_LIMITS.max
  return Math.max(0, Math.floor(detected))
})

const canSubmit = computed(() => {
  if (isSubmitting.value) return false
  if (isMotion.value) {
    const hasVideo = videoSource.value === 'file' ? Boolean(videoFile.value) : /^https?:\/\//i.test(videoUrl.value)
    return hasVideo && durationSeconds.value >= MOTION_DURATION_LIMITS.min
  }
  if (meshMode.value === 'text') return prompt.value.trim().length > 2
  if (meshMode.value === 'image') return Boolean(singleImage.value)
  return Boolean(views.front)
})

const submitLabel = computed(() => {
  if (isSubmitting.value) return '提交中…'
  if (isRunning.value) return '重新生成'
  return isMotion.value ? '开始动作捕捉' : '开始生成 3D 模型'
})

const submitHint = computed(() => {
  if (taskPhase.value === 'failed') return '可调整输入后重新提交'
  if (isMotion.value) return `${motionEstimate.value} 预估 · 异步任务，通常数十秒`
  return '异步任务，通常 40–90 秒；完成后自动装配到中央台面'
})

/* ------------------------------------------------------------- 视图状态 */

const stageShellRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const stageVideoRef = ref<HTMLVideoElement | null>(null)
const imageInputRef = ref<HTMLInputElement | null>(null)
const videoInputRef = ref<HTMLInputElement | null>(null)
const pendingImageTarget = ref<'single' | MultiViewKey>('single')

let viewer: HologramViewer | null = null
const viewerState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const viewerError = ref('')
const stats = ref<ViewerStats | null>(null)
const loadProgress = ref(0)
const previewMode = ref(false)
const previewVideoUrl = ref('')
const completedVideoUrl = ref('')

const autoRotate = ref(true)
const showGrid = ref(true)

/** 预览材质与机位（本地状态，换模型后保留用户选择）。 */
const materialPreset = ref<ViewerMaterial>('original')
const materialThickness = ref(0.6)
const viewPreset = ref<ViewerView>('iso')

/** 项目名称：新建时随任务写入历史，之后可随时改名。 */
const projectName = ref('')
const renamingId = ref('')
const renameDraft = ref('')

/** PNG / JPG / WebP / GIF 导出与 AI 背景。 */
const exportOpen = ref(false)
const exportKind = ref<ExportKind>('image')
const exportImageFormat = ref<'png' | 'jpeg' | 'webp'>('png')
const exportModelFormat = ref<ModelExportFormat>('glb')
const exportBusy = ref(false)
const exportBackground = ref<ExportBackground>('transparent')
const exportColor = ref('#0b1626')
const gifSize = ref(480)
const gifSeconds = ref(4)
const gifBackground = ref<'scene' | 'solid'>('scene')
const gifProgress = ref(0)
const bgOpen = ref(false)
const bgPrompt = ref('')
const bgBusy = ref(false)
const bgError = ref('')
const bgImage = ref('')
/** 背景图是否已换成同源 Blob（跨域原图会污染画布，导致 PNG 导出失败）。 */
const bgExportable = ref(true)
let bgObjectUrl = ''

watch([materialPreset, materialThickness], () => {
  viewer?.setMaterial(materialPreset.value, materialThickness.value)
})

// 任务进行中让装配台保持运转状态；完成后恢复待命 / 展示模型。
watch([taskPhase, progressPercent], ([phase, progress]) => {
  viewer?.setBuilding(phase === 'running', progress)
})

const viewerReady = computed(() => viewerState.value === 'ready')
const showVideoStage = computed(() => {
  if (isMotion.value) return Boolean(stageVideoSrc.value)
  return previewMode.value && Boolean(previewVideoUrl.value)
})
const stageVideoSrc = computed(() => {
  if (isMotion.value) {
    return completedVideoUrl.value || videoObjectUrl.value || (/^https?:\/\//i.test(videoUrl.value) ? videoUrl.value : '')
  }
  return previewVideoUrl.value
})
const canRetryModel = computed(() => Boolean(previewMode.value && previewVideoUrl.value && !isMotion.value))

const loadProgressPercent = computed(() => Math.round(loadProgress.value * 100))

const statsLabel = computed(() => {
  if (!stats.value) return '—'
  const count = stats.value.count.toLocaleString()
  return stats.value.kind === 'splat' ? `SPLAT · ${count} pts` : `MESH · ${count} tri`
})
const loadLabel = computed(() => {
  if (loadProgressPercent.value > 0 && loadProgressPercent.value < 100) return `正在下载点云数据 ${loadProgressPercent.value}%`
  return '解析几何与颜色属性…'
})

const stageNotice = computed(() => {
  if (isMotion.value) {
    return taskPhase.value === 'failed' ? errorMessage.value : ''
  }
  if (viewerError.value) return viewerError.value
  if (taskPhase.value === 'failed') return errorMessage.value
  return ''
})
const stageNoticeTone = computed<'info' | 'error'>(() => (viewerError.value || taskPhase.value === 'failed' ? 'error' : 'info'))

const assemblySteps = computed(() => {
  const phase = taskPhase.value
  const activeIndex = phase === 'idle' ? 1 : phase === 'running' ? (progressPercent.value > 55 ? 3 : 2) : phase === 'done' ? 4 : 0
  return [
    { key: 'parse', index: '01', title: '输入解析', sub: isMotion.value ? '视频帧率 / 片段' : '文本 · 参考图', active: activeIndex === 1, done: activeIndex > 1 },
    { key: 'geometry', index: '02', title: '几何重建', sub: isMotion.value ? '人体姿态追踪' : '点云 / 网格生成', active: activeIndex === 2, done: activeIndex > 2 },
    { key: 'texture', index: '03', title: isMotion.value ? '动作数据' : '材质与纹理', sub: isMotion.value ? 'BVH 输出' : '着色 / 贴图', active: activeIndex === 3, done: activeIndex > 3 },
    {
      key: 'deploy',
      index: '04',
      title: isMotion.value ? '动作预览' : '装配上架',
      sub: isMotion.value ? '视频 / BVH' : '全息转台',
      active: activeIndex === 4,
      done: false,
    },
  ]
})

/* ------------------------------------------------------------- 生命周期 */

onMounted(async () => {
  await nextTick()
  if (stageRef.value) {
    viewer = new HologramViewer(stageRef.value)
    viewer.onStateChange = (state) => {
      viewerState.value = state
    }
    viewer.onProgress = (loaded, total) => {
      loadProgress.value = total > 0 ? Math.min(1, loaded / total) : 0
    }
    viewer.setAutoRotate(autoRotate.value)
    viewer.setMaterial(materialPreset.value, materialThickness.value)
    viewer.setBuilding(isRunning.value, progressPercent.value)
  }

  // 刷新页面 / 重新进入时，自动续接上一次未结束的任务，避免历史记录一直停在「进行中」。
  const pending = historyEntries.value.find((entry) => entry.status === 'RUNNING')
  if (pending) restoreTask(pending)
})

onBeforeUnmount(() => {
  stopPolling(false)
  viewer?.dispose()
  viewer = null
  if (videoObjectUrl.value) URL.revokeObjectURL(videoObjectUrl.value)
  if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl)
  bgObjectUrl = ''
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = null
})

/* ------------------------------------------------------------- 模型切换 */

watch(pageMode, () => {
  if (model.value.kind !== pageMode.value) modelId.value = modeModels.value[0].id
})

function selectModel(option: Model3DOption) {
  if (modelId.value === option.id) return
  modelId.value = option.id
  if (option.kind === 'motion') {
    previewMode.value = false
    viewerError.value = ''
  }
}

watch(meshMode, () => {
  errorMessage.value = ''
})

watch(durationSeconds, (value) => {
  const min = MOTION_DURATION_LIMITS.min
  const max = maxDuration.value
  if (value < min) durationSeconds.value = min
  if (value > max) durationSeconds.value = max
})

watch(startSeconds, (value) => {
  if (value < 0) startSeconds.value = 0
  if (value > maxStart.value) startSeconds.value = maxStart.value
})

/* ------------------------------------------------------------- 图片与视频输入 */

function chooseImage(target: 'single' | MultiViewKey) {
  pendingImageTarget.value = target
  imageInputRef.value?.click()
}

async function readImageFile(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > 12 * 1024 * 1024) throw new Error('图片请控制在 12MB 以内')
  const dataUrl = await fileToBase64(file)
  const prepared = await prepareLocalImageDataUri(dataUrl)
  const dimensions = await measureImage(prepared)
  // HEIC / AVIF 等格式在部分浏览器里无法解码：此时上传只会被上游判为非法图片，提前拦下更好懂。
  if (!dimensions.width || !dimensions.height) {
    throw new Error(`无法读取这张图片（${file.type || '未知格式'}），请改用 JPG / PNG / WebP。`)
  }
  return { dataUrl: prepared, name: file.name, width: dimensions.width, height: dimensions.height }
}

function measureImage(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve({ width: 0, height: 0 })
    image.src = dataUrl
  })
}

async function onImageInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const slot = await readImageFile(file)
    if (pendingImageTarget.value === 'single') {
      singleImage.value = slot
    } else {
      views[pendingImageTarget.value] = { dataUrl: slot.dataUrl, name: slot.name }
    }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '图片读取失败'
  }
}

async function dropImage(event: DragEvent, target: 'single' | MultiViewKey) {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  try {
    const slot = await readImageFile(file)
    if (target === 'single') singleImage.value = slot
    else views[target] = { dataUrl: slot.dataUrl, name: slot.name }
    errorMessage.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '图片读取失败'
  }
}

async function loadVideoFile(file: File) {
  if (!/^video\//.test(file.type)) throw new Error('请选择视频文件')
  if (file.size > 50 * 1024 * 1024) throw new Error('视频请控制在 50MB 以内')
  const dataUrl = await fileToBase64(file)
  if (videoObjectUrl.value) URL.revokeObjectURL(videoObjectUrl.value)
  videoObjectUrl.value = URL.createObjectURL(file)
  videoFile.value = { name: file.name, size: file.size, dataUrl }
  videoMeta.value = await measureVideo(videoObjectUrl.value)
  startSeconds.value = 0
  durationSeconds.value = Math.max(1, Math.min(MOTION_DURATION_LIMITS.max, Math.round(videoMeta.value.duration) || 3))
  errorMessage.value = ''
}

function measureVideo(src: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({ duration: video.duration || 0, width: video.videoWidth, height: video.videoHeight })
    video.onerror = () => resolve({ duration: 0, width: 0, height: 0 })
    video.src = src
  })
}

async function onVideoInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    await loadVideoFile(file)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '视频读取失败'
  }
}

async function dropVideo(event: DragEvent) {
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  try {
    await loadVideoFile(file)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '视频读取失败'
  }
}

function clearVideo() {
  videoFile.value = null
  videoMeta.value = null
  if (videoObjectUrl.value) URL.revokeObjectURL(videoObjectUrl.value)
  videoObjectUrl.value = ''
}

function onSeek(value: string) {
  startSeconds.value = Number(value) || 0
  const video = stageVideoRef.value
  if (video && isMotion.value && Number.isFinite(video.duration)) {
    video.currentTime = Math.min(video.duration, startSeconds.value)
  }
}

/* ------------------------------------------------------------- 提交任务 */

async function submit() {
  if (!canSubmit.value || isSubmitting.value) return
  isSubmitting.value = true
  errorMessage.value = ''
  previewMode.value = false
  viewerError.value = ''
  completedVideoUrl.value = ''
  previewVideoUrl.value = ''
  stopPolling(false)

  try {
    if (isMotion.value) {
      const video = videoSource.value === 'file' ? videoFile.value?.dataUrl || '' : videoUrl.value
      const response = await createMotionTask({
        model: model.value.id,
        video,
        startSeconds: Number(startSeconds.value) || 0,
        durationSeconds: Math.max(1, Number(durationSeconds.value) || 1),
      })
      beginTask(response.task_uuid, 'motion', response)
    } else {
      const payload: Parameters<typeof createMeshTask>[0] = {
        model: model.value.id,
        mode: meshMode.value,
        withTexture: withTexture.value,
        hdTexture: withTexture.value && hdTexture.value,
        pbrTexture: withTexture.value && pbrTexture.value,
      }
      if (meshMode.value === 'text') payload.prompt = prompt.value.trim()
      if (meshMode.value === 'image') payload.image = singleImage.value?.dataUrl
      if (meshMode.value === 'multi') {
        // 四个视角先统一尺寸并压缩成 JPEG，避免上游因图片规格不一致直接 400。
        payload.views = await normalizeMultiViewImages({
          front: views.front?.dataUrl,
          left: views.left?.dataUrl || undefined,
          back: views.back?.dataUrl || undefined,
          right: views.right?.dataUrl || undefined,
        })
      }
      const response = await createMeshTask(payload)
      beginTask(response.task_uuid, 'mesh', response)
    }

    const name = projectName.value.trim() || deriveProjectName()
    historyEntries.value = addHistoryEntry({
      taskId: task.value?.task_uuid || '',
      kind: taskKind.value,
      modelId: modelId.value,
      prompt: historyPrompt(),
      name,
      createdAt: Date.now(),
      status: 'RUNNING',
    })
    projectName.value = name
  } catch (error) {
    if (import.meta.env.DEV) {
      const response = (error as { response?: { status?: number; data?: unknown } })?.response
      console.error('[3D] 创建任务失败', response?.status ?? '', response?.data ?? error)
    }
    errorMessage.value = taskRequestError(error, '任务创建失败，请稍后重试。')
    taskPhase.value = 'failed'
  } finally {
    isSubmitting.value = false
  }
}

function historyPrompt(): string {
  if (isMotion.value) return videoSource.value === 'file' ? videoFile.value?.name || '本地视频' : videoUrl.value
  if (meshMode.value === 'text') return prompt.value.trim()
  if (meshMode.value === 'image') return `图生 3D · ${singleImage.value?.name || '参考图'}`
  return `多视角 3D · ${views.front?.name || '正视图'}`
}

/** 没有手动命名时，用描述 / 素材文件名自动生成一个可读的项目名。 */
function deriveProjectName(): string {
  const base = (() => {
    if (isMotion.value) {
      if (videoSource.value === 'file' && videoFile.value?.name) return videoFile.value.name
      const fromUrl = videoUrl.value.trim().split(/[?#]/)[0].split('/').pop() || ''
      return fromUrl || '动作捕捉'
    }
    if (meshMode.value === 'text') return prompt.value.trim()
    if (meshMode.value === 'image') return singleImage.value?.name || '图生 3D'
    return views.front?.name || '多视角 3D'
  })()
  const cleaned = base.replace(/\.[a-z0-9]+$/i, '').trim()
  if (!cleaned) return '未命名项目'
  return cleaned.length > 32 ? `${cleaned.slice(0, 32)}…` : cleaned
}

/** 导出文件名里不能出现的字符统一替换掉，保证跨系统可落盘。 */
function fileNameBase(): string {
  const raw = (currentEntry.value?.name?.trim() || projectName.value.trim() || deriveProjectName()).slice(0, 40)
  const safe = raw
    // 自动命名常来自「图生 3D · xxx.png」这类描述，去掉尾部文件扩展名。
    .replace(/\.(png|jpe?g|webp|bmp|gif|tga|mp4|mov|webm|glb|gltf|obj|fbx|ply|stl)$/i, '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return safe || 'artrealm-3d'
}

function setExportKind(kind: ExportKind) {
  exportKind.value = kind
  if (kind === 'gif' && exportBackground.value === 'transparent') exportBackground.value = 'solid'
}

/** 左栏输入框 / 历史项共用：改名并同步当前任务的展示。 */
function applyProjectName(taskId: string, name: string) {
  historyEntries.value = renameHistoryEntry(taskId, name)
  if (taskId === task.value?.task_uuid) projectName.value = name.trim()
}

function commitProjectName() {
  const entry = currentEntry.value
  if (!entry) return
  applyProjectName(entry.taskId, projectName.value)
}

/** 产物面板里的项目名可点：直接跳到左栏输入框改名。 */
function focusProjectName() {
  const input = document.querySelector<HTMLInputElement>('.project-name-input')
  if (!input) return
  input.scrollIntoView({ block: 'center', behavior: 'smooth' })
  input.focus()
  input.select()
}

function startRename(entry: Model3DHistoryEntry) {
  renamingId.value = entry.taskId
  renameDraft.value = historyDisplayName(entry)
  void nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.history-rename-input')
    input?.focus()
    input?.select()
  })
}

function commitRename(entry: Model3DHistoryEntry) {
  if (renamingId.value !== entry.taskId) return
  const name = renameDraft.value.trim()
  renamingId.value = ''
  applyProjectName(entry.taskId, name)
}

function cancelRename() {
  renamingId.value = ''
}

function beginTask(taskId: string, kind: 'mesh' | 'motion', response: { status?: string; model?: string; task_type?: string; created_at?: number }) {
  taskKind.value = kind
  task.value = {
    task_uuid: taskId,
    status: (response.status as MeshTaskResult['status']) || 'QUEUED',
    model: response.model || model.value.id,
    task_type: response.task_type,
    created_at: response.created_at || Math.floor(Date.now() / 1000),
    progress: null,
  }
  taskPhase.value = 'running'
  taskStartedAt = Date.now()
  elapsedMs.value = 0
  viewerError.value = ''
  viewer?.resetToIdle()
  stats.value = null
  startPolling()
}

/** 查询接口限流较敏感：默认 6 秒一次，遇到 429 指数退避到 30 秒。 */
const POLL_BASE_MS = 6000
const POLL_MAX_MS = 30000
let pollDelay = POLL_BASE_MS

function isRateLimited(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 429
}

function startPolling() {
  stopPolling(false)
  taskStartedAt = Date.now()
  elapsedMs.value = 0
  pollDelay = POLL_BASE_MS
  tickTimer = window.setInterval(() => {
    elapsedMs.value = Date.now() - taskStartedAt
  }, 1000)
  void pollOnce()
}

function scheduleNextPoll() {
  if (taskPhase.value !== 'running' || !task.value?.task_uuid) return
  pollTimer = window.setTimeout(() => {
    pollTimer = null
    void pollOnce()
  }, pollDelay)
}

function stopPolling(reason?: boolean) {
  if (pollTimer) window.clearTimeout(pollTimer)
  if (tickTimer) window.clearInterval(tickTimer)
  pollTimer = null
  tickTimer = null
  if (reason && taskPhase.value === 'running') {
    taskPhase.value = 'idle'
    errorMessage.value = '已停止轮询。任务仍在服务端执行，可从历史任务重新查询。'
  }
}

async function pollOnce() {
  const id = task.value?.task_uuid
  if (!id || pollBusy || taskPhase.value !== 'running') return
  pollBusy = true
  try {
    if (taskKind.value === 'motion') {
      const result = await getMotionTask(id)
      task.value = result
      pollDelay = POLL_BASE_MS
      handleResult(result)
    } else {
      const result = await getMeshTask(id)
      task.value = result
      pollDelay = POLL_BASE_MS
      handleResult(result)
    }
  } catch (error) {
    if (isRateLimited(error)) {
      // 429 属于正常的限流反馈：静默拉长间隔，不打断任务状态。
      pollDelay = Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS * 2, pollDelay * 2))
    } else {
      const message = taskRequestError(error, '任务查询失败。')
      if (message.includes('不存在') || message.includes('过期')) {
        stopPolling(false)
        taskPhase.value = 'failed'
        errorMessage.value = message
        return
      }
      errorMessage.value = message
      pollDelay = Math.min(POLL_MAX_MS, Math.max(POLL_BASE_MS, pollDelay * 2))
    }
  } finally {
    pollBusy = false
    scheduleNextPoll()
  }
}

async function handleResult(result: MeshTaskResult | MotionTaskResult) {
  if (result.status === 'FAILED') {
    stopPolling(false)
    taskPhase.value = 'failed'
    elapsedMs.value = Date.now() - taskStartedAt
    errorMessage.value = taskFailureMessage(result)
    historyEntries.value = updateHistoryStatus(result.task_uuid, 'FAILED')
    return
  }

  if (result.status !== 'COMPLETED') return

  stopPolling(false)
  taskPhase.value = 'done'
  elapsedMs.value = Date.now() - taskStartedAt
  historyEntries.value = updateHistoryStatus(result.task_uuid, 'COMPLETED')

  if (taskKind.value === 'motion') {
    const list = collectMotionAssets(result as MotionTaskResult)
    const clip = list.find((asset) => asset.kind === 'video')
    completedVideoUrl.value = clip ? mediaUrl(clip.url) : videoObjectUrl.value
    viewerError.value = ''
    return
  }

  const meshTask = result as MeshTaskResult
  const list = collectMeshAssets(meshTask)
  const preview = pickPreviewVideo(list)
  previewVideoUrl.value = preview ? mediaUrl(preview.url) : ''
  const mesh = pickMeshAsset(list)
  if (!mesh) {
    previewMode.value = true
    viewerError.value = '本次任务没有返回可加载的 3D 文件，已展示官方预览视频。'
    return
  }
  await loadModel(mesh.url)
}

async function loadModel(url: string) {
  if (!viewer) return
  viewerError.value = ''
  loadProgress.value = 0
  try {
    const result = await viewer.loadFromUrl(url)
    stats.value = result.stats
    previewMode.value = false
    viewer.setAutoRotate(autoRotate.value)
    viewer.setGridVisible(showGrid.value)
  } catch (error) {
    previewMode.value = true
    viewerError.value = describeAssetError(error)
    stats.value = null
    // 失败后回到待命，避免加载动画一直转。
    viewer?.resetToIdle()
  }
}

function describeAssetError(error: unknown): string {
  if (error instanceof AssetError) {
    if (error.reason === 'proxy-unavailable') {
      return '同源代理未配置，无法在浏览器里读取点云文件。已切换为官方预览视频；配置 /v2fun-assets 反代后即可自由旋转查看。'
    }
    if (error.reason === 'cors') {
      return 'V2Fun OSS 未开放 CORS，模型文件被浏览器拦截。已切换为官方预览视频。'
    }
    if (error.reason === 'format') return '模型文件格式无法识别，已切换为官方预览视频。'
    return error.message
  }
  return error instanceof Error ? error.message : '模型加载失败，已切换为官方预览视频。'
}

async function retryLoadModel() {
  const mesh = pickMeshAsset(currentAssets.value)
  if (!mesh) return
  previewMode.value = true
  await loadModel(mesh.url)
}

/* ------------------------------------------------------------- 视图交互 */

function toggleAutoRotate() {
  autoRotate.value = !autoRotate.value
  viewer?.setAutoRotate(autoRotate.value)
}

function toggleGrid() {
  showGrid.value = !showGrid.value
  viewer?.setGridVisible(showGrid.value)
}

function resetView() {
  viewPreset.value = 'iso'
  viewer?.resetView()
}

function setView(view: ViewerView) {
  viewPreset.value = view
  // 切机位时关掉自动旋转，否则相机会立刻被转走。
  autoRotate.value = false
  viewer?.setAutoRotate(false)
  viewer?.setView(view)
}

function openExport() {
  if (!viewerReady.value) {
    showDownloadNotice('模型装配完成后才能导出。')
    return
  }
  exportOpen.value = true
}

async function runExport() {
  if (exportBusy.value) return
  if (!viewerReady.value) {
    showDownloadNotice('模型装配完成后才能导出。')
    return
  }
  if (exportKind.value === 'model') {
    await exportModelFile()
    return
  }
  if (exportKind.value === 'gif') {
    await exportGif()
    return
  }
  if (exportBackground.value === 'scene' && bgImage.value && !bgExportable.value) {
    showDownloadNotice('AI 背景未走同源反代，无法合成导出；请配置 /ai-image-assets 后重试。')
    return
  }
  const dataUrl = viewer?.screenshot({
    background: exportBackground.value,
    color: exportColor.value,
    format: exportImageFormat.value,
  })
  if (!dataUrl) {
    showDownloadNotice('导出失败：当前浏览器不支持画布导出，请换用 Chrome / Edge。')
    return
  }
  const ext = exportImageFormat.value === 'jpeg' ? 'jpg' : exportImageFormat.value
  triggerDownload(dataUrl, `${fileNameBase()}-${viewPreset.value}-${exportBackground.value}.${ext}`)
  exportOpen.value = false
  const label = EXPORT_IMAGE_FORMATS.find((item) => item.value === exportImageFormat.value)?.label || 'PNG'
  showDownloadNotice(`已导出 ${label} 图片`)
}

/** dataUrl / blob 统一下载，Windows 与 macOS 的文件名都按当前项目名生成。 */
function triggerDownload(href: string, filename: string) {
  const anchor = document.createElement('a')
  anchor.href = href
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

async function exportModelFile() {
  if (!viewer) return
  exportBusy.value = true
  try {
    const blob = await viewer.exportModel(exportModelFormat.value)
    const url = URL.createObjectURL(blob)
    triggerDownload(url, `${fileNameBase()}.${exportModelFormat.value}`)
    // 大模型（几十 MB）落盘可能超过 5 秒，过早释放 Blob URL 会让下载失败。
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    exportOpen.value = false
    const label = EXPORT_MODEL_FORMATS.find((item) => item.value === exportModelFormat.value)?.label || '模型'
    showDownloadNotice(`已导出 ${label} 模型（${formatBytes(blob.size)}）`)
  } catch (error) {
    showDownloadNotice(error instanceof AssetError ? error.message : '模型导出失败，请稍后重试。')
  } finally {
    exportBusy.value = false
  }
}

/**
 * 自动旋转 GIF：主线程逐帧渲染，Worker 逐帧量化编码。
 * 每帧等 Worker 回执再渲染下一帧，既能显示进度也不会把内存堆满。
 */
async function exportGif() {
  if (!viewer) return
  if (gifBackground.value === 'scene' && bgImage.value && !bgExportable.value) {
    showDownloadNotice('AI 背景未走同源反代，无法合成动图；请配置 /ai-image-assets 后重试。')
    return
  }
  const size = gifSize.value
  const frames = gifFrames.value
  exportBusy.value = true
  gifProgress.value = 0
  const worker = new Worker(new URL('../features/model3d/gifWorker.ts', import.meta.url), { type: 'module' })
  try {
    let resolveFrame: (() => void) | null = null
    let rejectFrame: ((error: Error) => void) | null = null
    let resolveDone: ((buffer: ArrayBuffer) => void) | null = null
    let rejectDone: ((error: Error) => void) | null = null

    const finished = new Promise<ArrayBuffer>((resolve, reject) => {
      resolveDone = resolve
      rejectDone = reject
    })
    // 错误路径下 captureTurntable 先抛错，避免 finished 变成未处理的 rejection。
    finished.catch(() => {})
    // 单帧编码失败时也要把 captureTurntable 的 await 放出来，否则会一直挂着。
    const fail = (message: string) => {
      const error = new Error(message)
      rejectFrame?.(error)
      rejectDone?.(error)
      resolveFrame = null
      rejectFrame = null
    }

    worker.onmessage = (event: MessageEvent<{ type: string; index?: number; buffer?: ArrayBuffer; message?: string }>) => {
      const message = event.data
      if (message.type === 'progress') {
        gifProgress.value = message.index ?? 0
        const resume = resolveFrame
        resolveFrame = null
        rejectFrame = null
        resume?.()
      } else if (message.type === 'done' && message.buffer) {
        resolveDone?.(message.buffer)
        resolveDone = null
      } else if (message.type === 'error') {
        fail(message.message || '动图编码失败')
      }
    }
    worker.onerror = () => fail('动图编码线程异常，请重试')

    worker.postMessage({ type: 'start', width: size, height: size, delay: GIF_DELAY_MS })

    await viewer.captureTurntable({
      size,
      frames,
      background: gifBackground.value,
      color: exportColor.value,
      onFrame: (rgba) =>
        new Promise<void>((resolve, reject) => {
          resolveFrame = resolve
          rejectFrame = reject
          const buffer = rgba.buffer as ArrayBuffer
          worker.postMessage({ type: 'frame', buffer }, [buffer])
        }),
    })

    worker.postMessage({ type: 'finish' })
    const buffer = await finished
    const blob = new Blob([buffer], { type: 'image/gif' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, `${fileNameBase()}-turntable.gif`)
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
    exportOpen.value = false
    showDownloadNotice(`已导出 GIF 动图（${frames} 帧 · ${formatBytes(blob.size)}）`)
  } catch (error) {
    showDownloadNotice(error instanceof Error ? error.message : '动图导出失败，请稍后重试。')
  } finally {
    worker.terminate()
    exportBusy.value = false
    gifProgress.value = 0
  }
}

/* ------------------------------------------------------------- AI 背景 */

function openBackground() {
  if (!viewerReady.value) {
    showDownloadNotice('模型装配完成后才能补充背景。')
    return
  }
  bgError.value = ''
  bgOpen.value = true
}

async function generateBackground() {
  if (bgBusy.value) return
  const phrase = bgPrompt.value.trim()
  if (!phrase) {
    bgError.value = '请先输入一句背景描述。'
    return
  }
  bgBusy.value = true
  bgError.value = ''
  try {
    const result = await generateImage({
      model: AI_BG_MODEL,
      // 明确要求「无主体、无文字」，避免生成的背景抢走模型焦点。
      prompt: `${phrase}。纯背景场景：无人、无主体、无文字水印，画面干净，景深自然虚化，适合作为 3D 模型展示背景。`,
      // Seedream 的尺寸分隔符是 x；用 * 会被上游判为非法参数。
      size: aspectRatioToImageSize('4:3', 'seedream-5-lite', 'x'),
      output_format: 'png',
      watermark: false,
      sequential_image_generation: 'disabled',
    })
    const item = result.data?.[0]
    const raw = item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url
    if (!raw) throw new Error('模型没有返回图片，请换一句描述重试。')
    const resolved = await resolveBackgroundUrl(raw)
    bgImage.value = resolved.display
    bgExportable.value = resolved.exportable
    await viewer?.setBackdrop(resolved.display)
    // 生成背景后默认用它导出，用户仍可在导出弹层里改回透明 / 纯色。
    if (exportBackground.value === 'transparent') exportBackground.value = 'scene'
    bgOpen.value = false
    bgPrompt.value = ''
    showDownloadNotice(resolved.exportable ? 'AI 背景已应用到舞台' : '背景已应用，但当前缺少 /ai-image-assets 反代，场景导出不可用')
  } catch (error) {
    bgError.value = error instanceof Error ? error.message : '背景生成失败，请稍后重试。'
  } finally {
    bgBusy.value = false
  }
}

/**
 * Seedream 返回的图片在 volces TOS 上且没有 CORS 头，直接拿 URL 画进画布会污染导出。
 * 走同源 /ai-image-assets 反代读取字节并转成 Blob URL；反代不可用时回退原图（仅预览）。
 */
async function resolveBackgroundUrl(raw: string): Promise<{ display: string; exportable: boolean }> {
  if (raw.startsWith('data:')) return { display: raw, exportable: true }
  const proxied = proxyAiImageUrl(raw)
  if (proxied === raw) return { display: raw, exportable: false }
  try {
    const response = await fetch(proxied, { credentials: 'omit' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    if (!blob.size) throw new Error('空响应')
    if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl)
    bgObjectUrl = URL.createObjectURL(blob)
    return { display: bgObjectUrl, exportable: true }
  } catch {
    return { display: raw, exportable: false }
  }
}

function proxyAiImageUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (/(^|\.)volces\.com$/i.test(url.hostname)) {
      return `/ai-image-assets${url.pathname}${url.search}`
    }
  } catch {
    // 保持原样
  }
  return raw
}

function removeBackground() {
  bgImage.value = ''
  bgExportable.value = true
  if (bgObjectUrl) URL.revokeObjectURL(bgObjectUrl)
  bgObjectUrl = ''
  void viewer?.setBackdrop(null)
  if (exportBackground.value === 'scene') exportBackground.value = 'transparent'
  bgOpen.value = false
}

function toggleFullscreen() {
  const element = stageShellRef.value
  if (!element) return
  if (document.fullscreenElement) void document.exitFullscreen()
  else void element.requestFullscreen?.()
}

/* ------------------------------------------------------------- 产物 */

const downloadBusy = ref('')
const downloadNotice = ref('')
let noticeTimer: number | null = null

/** 下载结果是短暂状态：显示 4 秒后自动淡出，避免常驻占用右栏空间。 */
function showDownloadNotice(text: string) {
  downloadNotice.value = text
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    downloadNotice.value = ''
    noticeTimer = null
  }, 4000)
}

const ASSET_FILE_LABELS: Record<TaskAsset['kind'], string> = {
  mesh: 'model',
  motion: 'motion',
  video: 'preview-video',
  audio: 'audio',
  image: 'preview-image',
  other: 'asset',
}

function fileNameOf(asset: TaskAsset): string {
  const ext = asset.ext || '.bin'
  return `${fileNameBase()}-${ASSET_FILE_LABELS[asset.kind] || 'asset'}${ext}`
}

async function handleDownload(asset: TaskAsset) {
  if (downloadBusy.value) return
  downloadBusy.value = asset.path
  try {
    const result = await downloadAsset(asset.url, fileNameOf(asset))
    if (result === 'failed') {
      showDownloadNotice('下载失败：链接可能已过期，点历史任务重新查询即可刷新链接。')
    } else if (result === 'opened') {
      showDownloadNotice('已在新标签页打开文件，可在浏览器里手动保存。')
    } else {
      showDownloadNotice(`已开始下载：${fileNameOf(asset)}`)
    }
  } catch {
    showDownloadNotice('下载失败：链接可能已过期，点历史任务重新查询即可刷新链接。')
  } finally {
    downloadBusy.value = ''
  }
}

function openAsset(url: string) {
  window.open(mediaUrl(url), '_blank', 'noopener')
}

function assetSubLabel(asset: TaskAsset): string {
  const ext = asset.ext ? asset.ext.replace('.', '').toUpperCase() : 'FILE'
  if (!asset.expiresAt) return ext
  const diff = asset.expiresAt * 1000 - Date.now()
  if (diff <= 0) return `${ext} · 链接已过期，重新查询可刷新`
  const minutes = Math.max(1, Math.round(diff / 60000))
  return `${ext} · 约 ${minutes} 分钟后过期`
}

async function copyTaskId() {
  const id = task.value?.task_uuid
  if (!id) return
  try {
    await navigator.clipboard.writeText(id)
  } catch {
    // 忽略剪贴板权限问题
  }
}

/* ------------------------------------------------------------- 历史 */

function restoreTask(entry: Model3DHistoryEntry) {
  if (isRunning.value) stopPolling(false)
  modelId.value = entry.modelId
  taskKind.value = entry.kind
  projectName.value = entry.name?.trim() || entry.prompt.trim().slice(0, 40)
  renamingId.value = ''
  task.value = {
    task_uuid: entry.taskId,
    status: 'PROCESSING',
    model: getModel3D(entry.modelId).id,
    progress: null,
  }
  taskPhase.value = 'running'
  errorMessage.value = ''
  previewMode.value = false
  viewerError.value = ''
  previewVideoUrl.value = ''
  completedVideoUrl.value = ''
  viewer?.resetToIdle()
  stats.value = null
  startPolling()
}

function historyStatusText(status: Model3DHistoryEntry['status']): string {
  if (status === 'COMPLETED') return '完成'
  if (status === 'FAILED') return '失败'
  if (status === 'QUEUED') return '排队'
  return '进行中'
}
</script>

<style scoped>
/* =========================================================================
 * 3D 建模分区：左中右三栏 + 钢铁侠式全息组装台
 * ========================================================================= */

.model3d-page {
  --stage-cyan: var(--sf-ink);
  --stage-cyan-soft: rgba(36, 31, 25, 0.080);
  --stage-line: rgba(36, 31, 25, 0.100);
}

.model3d-main {
  position: relative;
  z-index: 1;
  display: grid;
  /*
   * 桌面 App 单屏工作区：
   * 顶栏之外只剩这一块主区，三栏同高、左右栏自己滚动，
   * 中间舞台永远固定，不跟随侧栏内容上下移动。
   */
  flex: 1 1 auto;
  height: 0;
  min-height: 0;
  grid-template-columns: 320px minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: stretch;
  padding: 8px 16px 16px 10px;
  overflow: hidden;
}

.model3d-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 与主区同高，内容在栏内滚动 */
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

/* 右栏（任务 / 产物 / 历史）内容较高时在栏内滚动，避免最后一页被页面裁掉 */
.model3d-rail--right {
  gap: 8px;
  overflow-y: auto;
  scrollbar-gutter: stable;
}

/* 右栏比左栏更紧凑：任务 + 产物 + 三条历史要能在一屏内放下 */
.model3d-rail--right .studio-panel-head {
  padding: 9px 16px;
}

.model3d-rail--right .panel-body {
  gap: 10px;
  padding: 11px 14px 12px;
}

.model3d-rail--right .asset-item {
  padding: 6px 9px;
}

.model3d-rail--right .asset-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  font-size: 12px;
}

.model3d-rail--right .asset-list {
  gap: 6px;
}

.model3d-rail--right .empty-block {
  padding: 12px;
}

/* 只有面板列表滚动，提交按钮固定为左栏页脚 */
.rail-scroll {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
  padding-bottom: 4px;
}

.rail-panel {
  flex: 0 0 auto;
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
}

/* ---------- 模型卡片 ---------- */

.model-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
}

.model-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.035);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 180ms ease,
    background 180ms ease,
    transform 180ms ease;
}

.model-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(120px 80px at 100% 0%, rgba(36, 31, 25, 0.080), transparent 70%);
  opacity: 0;
  transition: opacity 220ms ease;
  pointer-events: none;
}

.model-card:hover {
  border-color: rgba(36, 31, 25, 0.144);
  background: rgba(36, 31, 25, 0.055);
}

.model-card:hover::after,
.model-card.active::after {
  opacity: 1;
}

.model-card.active {
  border-color: color-mix(in srgb, var(--stage-cyan) 62%, transparent);
  background: linear-gradient(160deg, rgba(36, 31, 25, 0.070), rgba(36, 31, 25, 0.020));
  box-shadow:
    inset 0 0 0 1px rgba(36, 31, 25, 0.100),
    0 12px 30px -18px var(--sf-ink);
}

.model-card.motion::after {
  background: radial-gradient(120px 80px at 100% 0%, rgba(36, 31, 25, 0.18), transparent 70%);
}

.model-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(36, 31, 25, 0.060);
  color: var(--sf-ink-2);
}

.model-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.model-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.model-card.motion .model-glyph {
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-ink-2);
}

.model-glyph svg {
  width: 15px;
  height: 15px;
}

.model-badge {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  color: rgba(36, 31, 25, 0.42);
}

.model-name {
  font-family: var(--font-family-display);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: rgba(36, 31, 25, 0.95);
}

.model-desc {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 10.5px;
  line-height: 1.5;
  color: rgba(36, 31, 25, 0.46);
}

.model-foot {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 8px;
  margin-top: 3px;
  font-size: 10px;
  color: rgba(36, 31, 25, 0.8);
}

.model-price {
  flex: 0 0 auto;
  white-space: nowrap;
}

.model-tags {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
  margin-left: auto;
}

/* 单个 chip 不参与收缩，也不允许文字折行；放不下时整组换到下一行右对齐。 */
.model-tags em {
  flex: 0 0 auto;
  font-style: normal;
  font-size: 9px;
  line-height: 1.4;
  padding: 1px 5px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.06);
  color: rgba(36, 31, 25, 0.5);
  white-space: nowrap;
}

/* ---------- 分段控件 ---------- */

.segmented {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.03);
}

.segmented-item {
  flex: 1;
  min-height: 30px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: rgba(36, 31, 25, 0.52);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease;
}

.segmented-item:hover {
  color: rgba(36, 31, 25, 0.82);
}

.segmented-item.active {
  background: var(--sf-ink);
  color: var(--sf-surface);
  box-shadow: inset 0 0 0 1px rgba(36, 31, 25, 0.126);
}

/* ---------- 文本输入 ---------- */

.input-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-input {
  min-height: 118px;
  padding: 12px 14px;
  font-size: 12.5px;
  line-height: 1.65;
}

.text-field {
  height: 40px;
  padding: 0 14px;
  font-size: 12.5px;
}

.field-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.36);
}

.field-hint {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.55;
  color: rgba(36, 31, 25, 0.34);
}

.preset-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 2px;
}

.preset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(36, 31, 25, 0.42);
}

.preset-hint {
  font-weight: 400;
  letter-spacing: 0;
  color: rgba(36, 31, 25, 0.28);
}

.preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-chip {
  padding: 4px 9px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.03);
  color: rgba(36, 31, 25, 0.6);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.preset-chip:hover {
  border-color: rgba(36, 31, 25, 0.180);
  background: rgba(36, 31, 25, 0.050);
  color: var(--sf-ink);
}

/* ---------- 上传区 ---------- */

.dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 148px;
  padding: 14px;
  border: 1px dashed rgba(36, 31, 25, 0.126);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.022);
  color: rgba(36, 31, 25, 0.6);
  text-align: center;
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 180ms ease,
    background 180ms ease;
}

.dropzone:hover {
  border-color: rgba(36, 31, 25, 0.248);
  background: rgba(36, 31, 25, 0.045);
}

.dropzone.filled {
  border-style: solid;
  border-color: rgba(36, 31, 25, 0.135);
  padding: 0;
}

.dropzone--video {
  min-height: 118px;
}

.dropzone-icon svg {
  width: 26px;
  height: 26px;
  color: rgba(36, 31, 25, 0.75);
}

.dropzone-title {
  max-width: 100%;
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.82);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropzone-sub {
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.36);
}

.video-file-icon {
  font-size: 20px;
  color: rgba(36, 31, 25, 0.8);
}

.dropzone-thumb {
  width: 100%;
  height: 148px;
  object-fit: contain;
  background: radial-gradient(circle at 50% 44%, rgba(36, 31, 25, 0.070), transparent 70%);
}

.dropzone-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  font-size: 10.5px;
  color: var(--sf-ink);
  background: linear-gradient(180deg, transparent, rgba(255, 255, 255, 0.94));
}

.thumb-clear {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--sf-ink);
  box-shadow: 0 1px 4px rgba(36, 31, 25, 0.12);
  font: inherit;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
}

.thumb-clear:hover {
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.view-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.view-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  aspect-ratio: 1 / 1;
  border: 1px dashed rgba(36, 31, 25, 0.14);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.03);
  color: rgba(36, 31, 25, 0.5);
  cursor: pointer;
  overflow: hidden;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.view-slot.required {
  border-color: rgba(36, 31, 25, 0.171);
}

.view-slot:hover {
  border-color: rgba(36, 31, 25, 0.225);
  background: rgba(36, 31, 25, 0.035);
}

.view-slot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.view-slot-label {
  font-size: 12px;
  font-weight: 600;
}

.view-slot-hint {
  font-size: 10px;
  color: rgba(36, 31, 25, 0.3);
}

/* ---------- 动捕时间轴 ---------- */

.time-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.025);
}

.time-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.time-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.42);
}

.time-input {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.04);
}

.time-input input {
  width: 100%;
  border: 0;
  background: transparent;
  color: rgba(36, 31, 25, 0.9);
  font: inherit;
  font-size: 12.5px;
  outline: none;
}

.time-input em {
  font-style: normal;
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.36);
}

.time-range {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  appearance: none;
  background: linear-gradient(90deg, var(--sf-ink), rgba(36, 31, 25, 0.070));
  outline: none;
}

.time-range::-webkit-slider-thumb {
  appearance: none;
  width: 13px;
  height: 13px;
  border: 2px solid var(--sf-surface);
  border-radius: 50%;
  background: var(--sf-ink);
  box-shadow: 0 0 10px var(--sf-ink);
  cursor: pointer;
}

.time-range::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border: 2px solid var(--sf-surface);
  border-radius: 50%;
  background: var(--sf-ink);
  cursor: pointer;
}

.time-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 10px;
  color: rgba(36, 31, 25, 0.34);
}

/* ---------- 开关与参数 ---------- */

.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.025);
  cursor: pointer;
  transition: border-color 160ms ease;
}

.switch-row:hover {
  border-color: rgba(36, 31, 25, 0.117);
}

.switch-row.disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.switch-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.switch-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.84);
}

.switch-sub {
  font-size: 10px;
  color: rgba(36, 31, 25, 0.36);
}

.switch-row input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 21px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.12);
  transition: background 180ms ease;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.75);
  transition:
    transform 180ms ease,
    background 180ms ease;
}

.switch-row input:checked + .switch-track {
  background: var(--sf-ink);
  box-shadow: 0 0 14px -2px var(--sf-ink);
}

.switch-row input:checked + .switch-track .switch-thumb {
  transform: translateX(17px);
  background: var(--sf-surface);
}

.param-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 4px;
}

.param-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: rgba(36, 31, 25, 0.62);
}

.param-label em {
  font-style: normal;
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.82);
}

.billing-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid rgba(36, 31, 25, 0.24);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.07);
}

.billing-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: rgba(36, 31, 25, 0.55);
}

.billing-row strong {
  font-size: 12.5px;
  color: var(--sf-ink);
}

.billing-note {
  margin: 0;
  font-size: 10px;
  line-height: 1.5;
  color: rgba(36, 31, 25, 0.32);
}

/* ---------- 生成按钮 ---------- */

.rail-actions {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 7px;
  padding: 2px 2px 4px;
}

.build-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  border: 1px solid #d9d9d2;
  border-radius: 16px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
  overflow: hidden;
  box-shadow:
    0 18px 36px -20px var(--sf-ink),
    inset 0 1px 0 rgba(255, 255, 255, 0.4);
  transition:
    filter 180ms ease,
    transform 180ms ease;
}

.build-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}

.build-btn:disabled {
  cursor: not-allowed;
  filter: grayscale(0.5);
  opacity: 0.5;
}

.build-btn-glow {
  position: absolute;
  inset: -40% -10%;
  background: linear-gradient(100deg, transparent 20%, rgba(255, 255, 255, 0.55) 46%, transparent 62%);
  transform: translateX(-120%);
  animation: build-sweep 3.6s ease-in-out infinite;
}

@keyframes build-sweep {
  0%,
  55% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

.build-btn-label {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.build-btn-label svg {
  width: 16px;
  height: 16px;
}

.build-hint {
  margin: 0;
  text-align: center;
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.34);
}

/* ============================ 中央组装台 ============================ */

.stage-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  /* 中央舞台不参与侧栏滚动，固定在主区内 */
  position: relative;
}

.stage-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  max-height: none;
  border: 1px solid rgba(125, 211, 252, 0.16);
  border-radius: 26px;
  background:
    radial-gradient(120% 80% at 50% 0%, rgba(56, 189, 248, 0.12), transparent 58%),
    radial-gradient(80% 60% at 50% 100%, rgba(37, 99, 235, 0.14), transparent 62%),
    linear-gradient(180deg, rgba(8, 14, 22, 0.9), rgba(4, 8, 14, 0.96));
  box-shadow:
    0 40px 90px -50px rgba(56, 189, 248, 0.6),
    inset 0 1px 0 rgba(36, 31, 25, 0.06);
  overflow: hidden;
}

.stage-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(125, 211, 252, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(125, 211, 252, 0.05) 1px, transparent 1px);
  background-size: 54px 54px;
  mask-image: radial-gradient(circle at 50% 46%, var(--sf-ink) 0 42%, transparent 82%);
}

.stage-shell.is-video::before {
  opacity: 0.4;
}

.stage-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px 10px;
}

.stage-ident {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(36, 31, 25, 0.5);
}

.stage-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
}

.stage-dot.dot-running {
  background: var(--sf-ink);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.16);
  animation: dot-pulse 1.6s ease-in-out infinite;
}

.stage-dot.dot-done {
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.16);
}

.stage-dot.dot-failed {
  background: #fb7185;
  box-shadow: 0 0 0 3px rgba(251, 113, 133, 0.16);
}

@keyframes dot-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.stage-ident-model {
  font-size: 12px;
  font-weight: 700;
  color: rgba(36, 31, 25, 0.86);
  white-space: nowrap;
}

.stage-ident-divider {
  width: 1px;
  height: 11px;
  background: rgba(36, 31, 25, 0.14);
}

.stage-ident-mode {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.13em;
  color: rgba(159, 228, 255, 0.72);
  white-space: nowrap;
}

.stage-ident-status {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.06);
  font-size: 10px;
  white-space: nowrap;
}

.stage-actions {
  display: flex;
  gap: 6px;
}

.stage-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.035);
  color: rgba(36, 31, 25, 0.6);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.stage-action svg {
  width: 15px;
  height: 15px;
}

.stage-action:hover:not(:disabled) {
  border-color: rgba(125, 211, 252, 0.4);
  background: rgba(56, 189, 248, 0.12);
  color: var(--sf-ink);
}

.stage-action:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.stage-viewport {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  margin: 0 10px;
  border-radius: 18px;
  background: radial-gradient(circle at 50% 58%, rgba(14, 45, 66, 0.55), rgba(4, 8, 14, 0.9) 72%);
  overflow: hidden;
}

.stage-canvas {
  position: absolute;
  inset: 0;
  z-index: 1;
}

/* AI 背景层：透明画布叠在其上，模型像是站在生成场景里 */
.stage-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
}

.stage-backdrop::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 50% 68%, rgba(3, 8, 14, 0) 32%, rgba(3, 8, 14, 0.46) 100%),
    linear-gradient(180deg, rgba(3, 8, 14, 0.18), rgba(3, 8, 14, 0.3));
}

/* 画布是 z-index:1，HUD / 状态层统一抬到 2，避免被模型盖住。 */
.hud,
.stage-idle,
.stage-loading,
.stage-notice,
.hud-readout,
.stage-video-wrap {
  z-index: 2;
}

.stage-video-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 26px 22px 30px;
  background: radial-gradient(circle at 50% 52%, rgba(14, 45, 66, 0.5), rgba(3, 7, 12, 0.92) 74%);
}

.stage-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 12px;
  background: var(--sf-ink);
}

.stage-video-tag {
  position: absolute;
  left: 26px;
  top: 24px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 9px;
  border: 1px solid rgba(125, 211, 252, 0.3);
  border-radius: 999px;
  background: rgba(4, 10, 18, 0.72);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: rgba(159, 228, 255, 0.9);
  backdrop-filter: blur(8px);
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.9);
}

/* HUD 装饰 */

.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.hud-corner {
  position: absolute;
  width: 26px;
  height: 26px;
  border-color: rgba(125, 211, 252, 0.42);
  border-style: solid;
  border-width: 0;
}

.hud-corner--tl {
  top: 12px;
  left: 12px;
  border-top-width: 1px;
  border-left-width: 1px;
}

.hud-corner--tr {
  top: 12px;
  right: 12px;
  border-top-width: 1px;
  border-right-width: 1px;
}

.hud-corner--bl {
  bottom: 12px;
  left: 12px;
  border-bottom-width: 1px;
  border-left-width: 1px;
}

.hud-corner--br {
  bottom: 12px;
  right: 12px;
  border-bottom-width: 1px;
  border-right-width: 1px;
}

.hud-scan {
  position: absolute;
  left: 0;
  right: 0;
  height: 22%;
  background: linear-gradient(180deg, transparent, rgba(56, 189, 248, 0.055), transparent);
  animation: hud-scan 7.5s linear infinite;
}

@keyframes hud-scan {
  0% {
    transform: translateY(-30%);
  }
  100% {
    transform: translateY(460%);
  }
}

.hud-line {
  position: absolute;
  background: rgba(125, 211, 252, 0.1);
}

.hud-line--h {
  left: 8%;
  right: 8%;
  top: 50%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(125, 211, 252, 0.16), transparent);
}

.hud-line--v {
  top: 10%;
  bottom: 10%;
  left: 50%;
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(125, 211, 252, 0.14), transparent);
}

.hud-ticks {
  position: absolute;
  top: 22%;
  bottom: 22%;
  width: 6px;
  background-image: repeating-linear-gradient(180deg, rgba(125, 211, 252, 0.34) 0 1px, transparent 1px 9px);
  opacity: 0.6;
}

.hud-ticks--left {
  left: 13px;
}

.hud-ticks--right {
  right: 13px;
}

.hud-readout {
  position: absolute;
  bottom: 14px;
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 8px;
  padding: 7px 10px;
  border: 1px solid rgba(125, 211, 252, 0.14);
  border-radius: 9px;
  background: rgba(3, 8, 14, 0.55);
  font-size: 9px;
  letter-spacing: 0.08em;
  backdrop-filter: blur(6px);
  pointer-events: none;
}

.hud-readout--left {
  left: 16px;
}

.readout-key {
  color: rgba(125, 211, 252, 0.45);
}

.readout-value {
  color: rgba(36, 31, 25, 0.66);
  font-variant-numeric: tabular-nums;
}

/* 中央提示 */

.stage-idle,
.stage-loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  text-align: center;
  pointer-events: none;
  padding: 0 36px;
}

.stage-idle {
  justify-content: flex-end;
  padding-bottom: 78px;
}

/* 任务执行中：装配台覆盖层 */
.stage-building {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  padding: 0 32px 72px;
  text-align: center;
  pointer-events: none;
}

.building-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  padding: 3px 9px;
  border: 1px solid rgba(125, 211, 252, 0.3);
  border-radius: 999px;
  background: rgba(8, 24, 38, 0.72);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  letter-spacing: 0.16em;
  color: rgba(186, 230, 253, 0.92);
  backdrop-filter: blur(8px);
}

.building-badge .live-dot {
  background: #7dd3fc;
  box-shadow: 0 0 8px rgba(125, 211, 252, 0.95);
  animation: building-pulse 1.1s ease-in-out infinite;
}

.building-title {
  font-family: var(--font-family-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(226, 244, 255, 0.9);
}

.building-sub {
  font-size: 11px;
  color: rgba(36, 31, 25, 0.42);
}

.building-bar {
  width: 230px;
  height: 3px;
  margin-top: 5px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.08);
  overflow: hidden;
}

.building-bar .progress-fill {
  transition: width 240ms ease;
}

.building-percent {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(125, 211, 252, 0.76);
}

@keyframes building-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.85);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}

.idle-title,
.loading-title {
  font-family: var(--font-family-display);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(36, 31, 25, 0.78);
}

.idle-sub,
.loading-sub {
  max-width: 320px;
  font-size: 11px;
  line-height: 1.6;
  color: rgba(36, 31, 25, 0.36);
}

.loading-ring {
  width: 46px;
  height: 46px;
  margin-bottom: 8px;
  border: 1px solid rgba(125, 211, 252, 0.18);
  border-top-color: #7dd3fc;
  border-radius: 50%;
  animation: ring-spin 1.1s linear infinite;
}

@keyframes ring-spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-bar {
  width: 220px;
  height: 3px;
  margin-top: 6px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.08);
  overflow: hidden;
}

.loading-bar span {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, rgba(56, 189, 248, 0.4), #7dd3fc);
  transition: width 200ms ease;
}

.stage-notice {
  position: absolute;
  left: 50%;
  bottom: 62px;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  gap: 8px;
  width: min(560px, calc(100% - 48px));
  padding: 10px 12px;
  border: 1px solid rgba(251, 191, 36, 0.28);
  border-radius: 12px;
  background: rgba(24, 18, 4, 0.78);
  color: rgba(255, 236, 200, 0.9);
  font-size: 11px;
  line-height: 1.6;
  backdrop-filter: blur(10px);
}

.notice-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(251, 191, 36, 0.2);
  font-size: 10px;
  font-weight: 800;
}

.notice-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.notice-action {
  align-self: flex-start;
  padding: 3px 9px;
  border: 1px solid rgba(251, 191, 36, 0.4);
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 236, 200, 0.95);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.notice-action:hover {
  background: rgba(251, 191, 36, 0.14);
}

/* 底部工具条 */

.stage-toolbar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 16px 12px;
  flex-wrap: wrap;
}

.tool-group {
  display: flex;
  gap: 5px;
}

.tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.03);
  color: rgba(36, 31, 25, 0.55);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.tool-chip:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.158);
  color: var(--sf-ink);
}

.tool-chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.tool-chip:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.tool-tip {
  margin-left: auto;
  font-size: 10px;
  letter-spacing: 0.02em;
  color: rgba(36, 31, 25, 0.26);
}

/* 装配步骤 */

.stage-steps {
  display: grid;
  flex: none;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.stage-step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 11px;
  border: 1px solid rgba(36, 31, 25, 0.06);
  border-radius: 13px;
  background: rgba(36, 31, 25, 0.022);
  opacity: 0.55;
  transition:
    border-color 220ms ease,
    opacity 220ms ease,
    background 220ms ease;
}

.stage-step.active {
  opacity: 1;
  border-color: rgba(36, 31, 25, 0.180);
  background: rgba(36, 31, 25, 0.045);
}

.stage-step.done {
  opacity: 0.9;
}

.stage-step.done .step-index {
  color: #34d399;
}

.step-index {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(36, 31, 25, 0.300);
}

.step-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.step-copy strong {
  font-size: 11px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.82);
}

.step-copy em {
  font-style: normal;
  font-size: 9.5px;
  color: rgba(36, 31, 25, 0.36);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ============================ 右栏 ============================ */

.status-pill {
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  background: rgba(36, 31, 25, 0.07);
  color: rgba(36, 31, 25, 0.6);
}

.status-pill.status-running {
  background: rgba(36, 31, 25, 0.080);
  color: var(--sf-ink);
}

.status-pill.status-done {
  background: rgba(52, 211, 153, 0.16);
  color: var(--sf-success);
}

.status-pill.status-failed {
  background: rgba(251, 113, 133, 0.16);
  color: var(--sf-terra-strong);
}

.progress-track {
  position: relative;
  height: 4px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.08);
  overflow: hidden;
}

.progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--sf-ink), var(--sf-ink));
  transition: width 400ms ease;
}

.progress-fill.indeterminate {
  background: linear-gradient(90deg, rgba(36, 31, 25, 0.080), var(--sf-ink), rgba(36, 31, 25, 0.080));
  background-size: 200% 100%;
  animation: progress-flow 1.8s linear infinite;
}

@keyframes progress-flow {
  from {
    background-position: 0% 0;
  }
  to {
    background-position: -200% 0;
  }
}

.progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: -6px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: rgba(36, 31, 25, 0.4);
}

.task-meta {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 12px;
  border: 1px solid rgba(36, 31, 25, 0.06);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.022);
}

.task-meta > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.task-meta dt {
  font-size: 10.5px;
  color: rgba(36, 31, 25, 0.36);
}

.task-meta dd {
  margin: 0;
  max-width: 62%;
  font-size: 11px;
  color: rgba(36, 31, 25, 0.72);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-btn {
  padding: 2px 7px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 7px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.9);
  font: inherit;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.copy-btn:hover {
  border-color: rgba(36, 31, 25, 0.180);
}

.inline-error {
  margin: 0;
  padding: 9px 11px;
  border: 1px solid rgba(251, 113, 133, 0.28);
  border-radius: 11px;
  background: rgba(251, 113, 133, 0.08);
  font-size: 11px;
  line-height: 1.6;
  color: var(--sf-terra-strong);
}

.cancel-btn {
  width: 100%;
}

.empty-block {
  padding: 16px 12px;
  border: 1px dashed rgba(36, 31, 25, 0.09);
  border-radius: 13px;
  text-align: center;
  font-size: 10.5px;
  line-height: 1.7;
  color: rgba(36, 31, 25, 0.32);
}

.asset-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.028);
}

.asset-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(36, 31, 25, 0.060);
  color: var(--sf-ink-2);
  font-size: 13px;
}

.asset-icon.asset-motion {
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-ink-2);
}

.asset-icon.asset-video {
  background: rgba(52, 211, 153, 0.12);
  color: var(--sf-success);
}

.asset-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.asset-name {
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.82);
}

.asset-sub {
  font-size: 9.5px;
  color: rgba(36, 31, 25, 0.34);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-actions {
  display: flex;
  gap: 4px;
}

.asset-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 8px;
  background: transparent;
  color: rgba(36, 31, 25, 0.5);
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease,
    background 160ms ease;
}

.asset-btn svg {
  width: 13px;
  height: 13px;
}

.asset-btn:hover {
  border-color: rgba(36, 31, 25, 0.180);
  background: rgba(36, 31, 25, 0.060);
  color: var(--sf-ink);
}

/* 下载结果提示：浮在右下角的短时 toast，不参与右栏布局、不影响历史可见性 */
.asset-notice {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 60;
  max-width: 340px;
  margin: 0;
  padding: 9px 13px;
  border: 1px solid rgba(36, 31, 25, 0.108);
  border-radius: 11px;
  background: var(--sf-surface);
  box-shadow: 0 12px 34px rgba(36, 31, 25, 0.14);
  backdrop-filter: blur(10px);
  font-size: 11px;
  line-height: 1.5;
  color: var(--sf-ink);
  word-break: break-all;
}

.link-btn {
  border: 0;
  background: transparent;
  color: rgba(36, 31, 25, 0.7);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.link-btn:hover {
  color: var(--sf-ink);
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 9px 10px;
  border: 1px solid rgba(36, 31, 25, 0.06);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.022);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.history-item:hover {
  border-color: rgba(36, 31, 25, 0.135);
  background: rgba(36, 31, 25, 0.030);
}

.history-item.active {
  border-color: rgba(36, 31, 25, 0.189);
  background: rgba(36, 31, 25, 0.050);
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-model {
  margin-right: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgba(36, 31, 25, 0.060);
  color: rgba(36, 31, 25, 0.82);
  font-size: 9px;
  font-weight: 600;
}

.history-status {
  font-size: 9.5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.07);
  color: rgba(36, 31, 25, 0.5);
}

.history-status.hs-COMPLETED {
  background: rgba(52, 211, 153, 0.14);
  color: var(--sf-success);
}

.history-status.hs-FAILED {
  background: rgba(251, 113, 133, 0.14);
  color: var(--sf-terra-strong);
}

.history-prompt {
  font-size: 10.5px;
  line-height: 1.45;
  color: rgba(36, 31, 25, 0.44);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  font-size: 9.5px;
  color: rgba(36, 31, 25, 0.28);
}

/* 历史面板不参与 flex 收缩：整条右栏滚动，避免被压缩成空壳 */
.rail-panel--history {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
}

.rail-panel--history .history-list {
  gap: 6px;
}

.rail-panel--history .history-item {
  gap: 2px;
  padding: 6px 9px;
}

.rail-panel--history .history-prompt {
  font-size: 10px;
}

.history-head-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

/* ---------- 项目命名 ---------- */

.project-name-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.project-name-label {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(36, 31, 25, 0.36);
}

.project-name-input {
  height: 34px;
  font-size: 12px;
}

/* 产物面板顶部的项目名：让「这堆文件属于哪个项目」一眼可见 */
.project-strip {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  min-width: 0;
  padding: 6px 9px;
  border: 1px solid rgba(36, 31, 25, 0.100);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.030);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background 160ms ease;
}

.project-strip:hover {
  border-color: rgba(36, 31, 25, 0.171);
  background: rgba(36, 31, 25, 0.055);
}

.project-strip-pen {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  color: rgba(36, 31, 25, 0.207);
}

.project-strip-label {
  flex: 0 0 auto;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: rgba(36, 31, 25, 0.279);
}

.project-strip-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.82);
}

.history-row {
  position: relative;
}

.history-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.86);
}

.rail-panel--history .history-name {
  font-size: 11px;
}

.history-rename {
  position: absolute;
  right: 5px;
  bottom: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(36, 31, 25, 0.26);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 140ms ease,
    color 140ms ease,
    background 140ms ease;
}

.history-row:hover .history-rename,
.history-rename:focus-visible {
  opacity: 1;
}

.history-rename:hover {
  background: var(--sf-surface-3);
  color: var(--sf-ink);
}

.history-rename svg {
  width: 12px;
  height: 12px;
}

/* 触屏设备没有 hover，重命名按钮常驻显示 */
@media (hover: none) {
  .history-rename {
    opacity: 1;
  }
}

.history-rename-input {
  width: 100%;
  height: 30px;
  padding: 0 9px;
  border: 1px solid rgba(36, 31, 25, 0.203);
  border-radius: 10px;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font: inherit;
  font-size: 11.5px;
  outline: none;
}

.history-prompt {
  padding-right: 18px;
}

.rail-panel--history .rail-pager {
  flex: 0 0 auto;
}

.hidden-input {
  display: none;
}

/* Fullscreen */

.stage-shell:fullscreen {
  height: 100dvh;
  max-height: none;
  border-radius: 0;
  border: 0;
}

/* ============================ 响应式 ============================ */

@media (max-width: 1360px) {
  .model3d-main {
    /* 左栏最多 328px：模型卡底部的价格 + 三个 tag 才放得下一行 */
    grid-template-columns: minmax(292px, 328px) minmax(360px, 1fr) minmax(256px, 286px);
    gap: 12px;
    padding-right: 16px;
  }

  .stage-shell {
    min-height: 0;
  }
}

@media (max-width: 1180px) {
  /* 桌面最小窗口：保持单屏三栏，只把栏宽收紧，不退回整页下拉 */
  .model3d-main {
    grid-template-columns: 280px minmax(0, 1fr) 280px;
    gap: 12px;
    padding: 6px 12px 12px 8px;
  }
}

@media (max-width: 900px) {
  /* 窄屏：中央舞台在上、参数在下，允许内容区内部滚动 */
  .model3d-main {
    display: flex;
    height: auto;
    flex-direction: column;
    overflow-y: auto;
  }

  .stage-column {
    order: -1;
    height: 58dvh;
    min-height: 380px;
  }

  .model3d-rail {
    height: auto;
    overflow: visible;
  }

  .rail-scroll {
    overflow: visible;
    padding-right: 0;
  }

  .stage-steps {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .model3d-main {
    padding: 0 12px 16px;
  }

  .stage-shell {
    min-height: 0;
  }

  .stage-toolbar {
    gap: 8px;
  }
}
/* ---------- 预览材质 ---------- */

.material-block {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding-top: 13px;
  border-top: 1px solid rgba(36, 31, 25, 0.07);
}

.material-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.material-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.82);
}

.material-hint {
  font-size: 10px;
  letter-spacing: 0.02em;
  color: rgba(36, 31, 25, 0.32);
}

.segmented--compact {
  padding: 3px;
  border-radius: 11px;
}

.segmented--compact .segmented-item {
  min-height: 26px;
  border-radius: 8px;
  font-size: 11.5px;
}

.material-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.material-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 30px;
  padding: 0 6px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 9px;
  background: rgba(36, 31, 25, 0.03);
  color: rgba(36, 31, 25, 0.55);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.material-chip:hover {
  border-color: rgba(36, 31, 25, 0.16);
  color: rgba(36, 31, 25, 0.82);
}

.material-chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.material-swatch {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(36, 31, 25, 0.22);
}

.format-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.format-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  padding: 10px 12px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.03);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease;
}

.format-chip:hover {
  border-color: rgba(36, 31, 25, 0.16);
}

.format-chip.active {
  border-color: transparent;
  background: var(--sf-ink);
}

.format-chip:last-child {
  grid-column: 1 / -1;
}

.format-name {
  font-size: 12.5px;
  font-weight: 700;
  color: rgba(36, 31, 25, 0.8);
}

.format-chip.active .format-name,
.format-chip.active .format-hint {
  color: var(--sf-surface);
}

.format-hint {
  font-size: 10.5px;
  line-height: 1.45;
  color: rgba(36, 31, 25, 0.36);
}

.material-thickness {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.material-thickness-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(36, 31, 25, 0.5);
}

.material-thickness-head span:last-child {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: rgba(36, 31, 25, 0.300);
}

/* ---------- 机位快捷组 ---------- */

.tool-group--views {
  align-items: center;
  gap: 4px;
  padding-left: 12px;
  border-left: 1px solid rgba(36, 31, 25, 0.08);
}

.tool-group-label {
  margin-right: 2px;
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: rgba(36, 31, 25, 0.26);
}

.tool-chip--compact {
  padding: 5px 9px;
}

.tool-chip--bg {
  border-color: rgba(36, 31, 25, 0.100);
}

/* ---------- 弹层：导出 / AI 背景 ---------- */

.studio-modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(6px);
}

.modal-card {
  display: flex;
  flex-direction: column;
  width: min(420px, 100%);
  max-height: min(86dvh, 760px);
  border: 1px solid var(--sf-line);
  border-radius: 20px;
  background: var(--sf-surface);
  box-shadow: 0 24px 70px rgba(36, 31, 25, 0.16);
  overflow: hidden;
}

.modal-card--wide {
  width: min(520px, 100%);
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.07);
}

.modal-headings {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.modal-kicker {
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(36, 31, 25, 0.279);
}

.modal-title {
  margin: 0;
  font-family: var(--font-family-display);
  font-size: 15px;
  font-weight: 600;
  color: rgba(36, 31, 25, 0.94);
}

.modal-close {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 9px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.6);
  font: inherit;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    color 160ms ease;
}

.modal-close:hover {
  border-color: rgba(36, 31, 25, 0.158);
  color: var(--sf-ink);
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px;
  overflow-y: auto;
}

.modal-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.modal-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: rgba(36, 31, 25, 0.52);
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.color-input {
  width: 38px;
  height: 32px;
  padding: 2px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 9px;
  background: transparent;
  cursor: pointer;
}

.color-value {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  color: rgba(36, 31, 25, 0.6);
}

.swatch-row {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(36, 31, 25, 0.18);
  border-radius: 7px;
  cursor: pointer;
}

.swatch.active {
  outline: 2px solid rgba(36, 31, 25, 0.300);
  outline-offset: 1px;
}

.modal-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid rgba(36, 31, 25, 0.07);
}

.modal-spacer {
  flex: 1 1 auto;
}

.bg-preview {
  position: relative;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 14px;
  background: var(--sf-surface-3);
  overflow: hidden;
}

.bg-preview img {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
}

@media (max-width: 560px) {
  .studio-modal {
    padding: 14px;
  }

  .tool-group--views {
    padding-left: 0;
    border-left: 0;
  }
}


</style>
