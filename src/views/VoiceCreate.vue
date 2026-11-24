<template>
  <div class="studio-page voice-page" :style="{ '--studio-accent': accent }">
    <StudioIsland />

    <StudioHeader
      kicker="Voice Studio"
      title="配音创作"
      subtitle="文本转语音、音色设计与声音复刻：50+ 普通话音色，也能用一段描述造一个新声音"
      accent="var(--sf-ink)"
    >
      <template #actions>
        <span class="studio-chip">{{ model.displayName }}</span>
      </template>
    </StudioHeader>

    <main class="voice-main">
      <!-- ---------- 分区切换 ---------- -->
      <div class="voice-tabs" role="tablist" aria-label="配音创作功能">
        <button
          class="voice-tab"
          :class="{ active: activeTab === 'speech' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'speech'"
          @click="switchTab('speech')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 6h16M4 12h10M4 18h13" />
          </svg>
          文本转语音
        </button>
        <button
          class="voice-tab"
          :class="{ active: activeTab === 'design' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'design'"
          @click="switchTab('design')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3.4l1.9 4.4 4.7.5-3.5 3.2.9 4.7-4-2.4-4 2.4.9-4.7L5.4 8.3l4.7-.5L12 3.4Z" />
            <path d="M18.4 16.6l.8 1.9 2 .2-1.5 1.4.4 2-1.7-1-1.7 1 .4-2-1.5-1.4 2-.2.8-1.9Z" />
          </svg>
          音色设计
        </button>
        <button
          class="voice-tab"
          :class="{ active: activeTab === 'clone' }"
          type="button"
          role="tab"
          :aria-selected="activeTab === 'clone'"
          @click="switchTab('clone')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="3.2" width="6" height="11" rx="3" />
            <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3" />
          </svg>
          声音克隆
          <span v-if="myVoices.length" class="tab-badge">{{ myVoices.length }}</span>
        </button>

        <div v-if="catalogState === 'loading' || catalogState === 'error'" class="tabs-meta">
          <span v-if="catalogState === 'loading'">音色加载中…</span>
          <span v-else class="tabs-meta-warn">音色列表加载失败，已用内置音色</span>
        </div>
      </div>

      <!-- ================= 文本转语音 ================= -->
      <div v-show="activeTab === 'speech'" class="speech-layout">
        <div class="speech-col">
          <!-- 脚本 -->
          <section class="studio-panel script-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Script · 01</span>
                <h2 class="studio-panel-title">待配音文本</h2>
              </div>
              <span class="studio-panel-meta" :class="{ 'is-over': charCount >= maxChars }">
                {{ charCount }} / {{ maxChars }}
              </span>
            </header>

            <div class="script-body">
              <textarea
                ref="scriptRef"
                v-model="text"
                class="studio-field script-input"
                :maxlength="maxChars"
                placeholder="把要配音的文字粘进来。支持段落换行、<#1.2#> 停顿时长与 (laughs) 语气词，也可以点下方快捷标签插入。"
                spellcheck="false"
                @keydown.meta.enter.prevent="handleGenerate"
                @keydown.ctrl.enter.prevent="handleGenerate"
                @input="rememberScriptSelection"
                @select="rememberScriptSelection"
                @keyup="rememberScriptSelection"
                @mouseup="rememberScriptSelection"
                @focus="rememberScriptSelection"
                @blur="rememberScriptSelection"
              />

              <div class="script-foot">
                <div class="script-tips">
                  <span><kbd>⌘</kbd><kbd>↵</kbd> 快速生成</span>
                  <span v-if="translateStatus" class="script-translate-status">{{ translateStatus }}</span>
                </div>
                <div class="script-actions">
                  <span v-if="charCount > model.capability.streamSuggestChars" class="script-warn">
                    超过 {{ model.capability.streamSuggestChars }} 字，合成会慢一些
                  </span>
                  <button
                    ref="translateBtnRef"
                    class="ghost-btn translate-btn"
                    type="button"
                    title="翻译当前文案（可选）"
                    :disabled="!text.trim() || translating"
                    :aria-busy="translating"
                    @click="openTranslatePicker"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M4 5h9M8.5 5v2c0 3.2-2 6-5 7.5M6.2 9.5c1.3 2.2 3.1 3.8 5.4 4.8M14 20l4-10 4 10M15.7 16h4.6" />
                    </svg>
                    {{ translating ? '翻译中…' : '翻译' }}
                  </button>
                  <button class="ghost-btn" type="button" :disabled="!text" @click="clearScript">清空</button>
                </div>
              </div>

              <p v-if="translateError" class="inline-error script-translate-error">{{ translateError }}</p>

              <!-- 停顿 / 语气词快捷插入 -->
              <div class="tag-panel">
                <div class="tag-panel-head">
                  <div class="tag-panel-title">
                    <span class="tag-panel-dot" aria-hidden="true" />
                    快捷插入
                    <em>停顿 · 19 种语气词</em>
                  </div>
                  <span class="tag-panel-hint">点击写入光标处</span>
                </div>

                <div class="tag-panel-body">
                  <div class="tag-group">
                    <span class="tag-group-label">停顿</span>
                    <div class="tag-chips">
                      <button
                        v-for="seconds in PAUSE_PRESETS"
                        :key="seconds"
                        class="tag-chip tag-chip--pause"
                        type="button"
                        :title="`插入 ${formatPauseTag(seconds)} 停顿`"
                        @mousedown.prevent
                        @click="insertPause(seconds)"
                      >
                        +{{ seconds }}s
                      </button>
                      <span class="tag-custom">
                        <input
                          v-model.number="customPauseSeconds"
                          type="number"
                          min="0.01"
                          max="99.99"
                          step="0.1"
                          aria-label="自定义停顿时长（秒）"
                          @keydown.enter.prevent="insertPause(customPauseSeconds)"
                        />
                        <button
                          class="tag-chip tag-chip--pause"
                          type="button"
                          @mousedown.prevent
                          @click="insertPause(customPauseSeconds)"
                        >
                          自定义
                        </button>
                      </span>
                    </div>
                  </div>

                  <div class="tag-group">
                    <span class="tag-group-label">语气词</span>
                    <div class="tag-chips">
                      <button
                        v-for="tag in INTERJECTION_TAGS"
                        :key="tag.code"
                        class="tag-chip"
                        type="button"
                        :title="`${tag.hint} · (${tag.code})`"
                        @mousedown.prevent
                        @click="insertInterjection(tag.code)"
                      >
                        {{ tag.label }}<em>{{ tag.code }}</em>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="preset-row">
                <button
                  v-for="preset in TEXT_PRESETS"
                  :key="preset.title"
                  class="preset-card"
                  type="button"
                  :title="`套用「${preset.title}」文案与音色「${preset.voiceName}」`"
                  @click="applyPreset(preset)"
                >
                  <span class="preset-card-head">
                    <strong>{{ preset.title }}</strong>
                    <em class="preset-voice">音色 · {{ preset.voiceName }}</em>
                  </span>
                  <span>{{ preset.desc }}</span>
                </button>
              </div>
            </div>
          </section>

          <!-- 结果 -->
          <section ref="resultPanelRef" class="studio-panel result-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Output · 02</span>
                <h2 class="studio-panel-title">生成结果</h2>
              </div>
              <span class="studio-panel-meta">{{ result ? resultMeta : '等待生成' }}</span>
            </header>

            <div class="result-body">
              <div v-if="generating" class="result-loading">
                <span class="loading-ring" aria-hidden="true" />
                <div>
                  <strong>正在合成语音…</strong>
                  <p>{{ charCount }} 个字符 · {{ selectedVoice.name }} · {{ generatingHint }}</p>
                </div>
              </div>

              <template v-else-if="result">
                <VoicePlayer
                  :key="result.url"
                  :src="result.url"
                  :duration-ms="result.durationMs"
                  :waveform="resultWaveform"
                  autoplay
                >
                  <template #actions>
                    <button class="mini-btn" type="button" @click="downloadResult">下载</button>
                    <button class="mini-btn" type="button" @click="addResultToProject">加入项目</button>
                    <button class="mini-btn" type="button" @click="handleGenerate">重新生成</button>
                  </template>
                </VoicePlayer>

                <div class="result-meta-row">
                  <span class="meta-pill">{{ resultVoiceName }}</span>
                  <span class="meta-pill">{{ formatDurationMs(result.durationMs) }}</span>
                  <span class="meta-pill">{{ result.format.toUpperCase() }}</span>
                  <span class="meta-pill">{{ formatBytes(result.size) }}</span>
                  <span class="meta-pill">计费字符 {{ result.usageCharacters }}</span>
                </div>

                <p class="result-text">{{ resultText }}</p>
              </template>

              <div v-else class="result-empty">
                <span class="empty-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12v-1a8 8 0 0 1 16 0v1" />
                    <rect x="3.2" y="12.4" width="4" height="7" rx="2" />
                    <rect x="16.8" y="12.4" width="4" height="7" rx="2" />
                  </svg>
                </span>
                <p>写好文本、选好音色，点「生成配音」。</p>
              </div>

              <p v-if="generateError" class="inline-error">{{ generateError }}</p>
            </div>
          </section>

          <!-- 配音音频库（持久化，可被视频多模态引用） -->
          <section v-if="history.length" class="studio-panel history-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Voice Library</span>
                <h2 class="studio-panel-title">配音音频库</h2>
              </div>
              <div class="history-head-actions">
                <span class="studio-panel-meta">共 {{ history.length }} 条</span>
                <button class="ghost-btn" type="button" @click="clearHistory">清空</button>
              </div>
            </header>

            <ul class="history-list">
              <li v-for="item in pagedHistory" :key="item.id" class="history-item">
                <div class="history-top">
                  <span class="history-voice">{{ item.voiceName }}</span>
                  <span class="history-tags">
                    <span v-if="historyParamHint(item)" class="history-param">{{ historyParamHint(item) }}</span>
                    <span class="history-time">{{ formatClock(item.createdAt) }}</span>
                  </span>
                </div>
                <p class="history-text">{{ item.text }}</p>
                <VoicePlayer
                  :src="item.audioUrl"
                  :duration-ms="item.durationMs"
                  :bars="48"
                  compact
                >
                  <template #actions>
                    <button class="mini-btn" type="button" @click="reuseHistory(item)">复用</button>
                    <button class="mini-btn" type="button" @click="downloadHistory(item)">下载</button>
                    <button class="mini-btn" type="button" @click="addHistoryToProject(item)">加入项目</button>
                    <button class="mini-btn" type="button" @click="removeHistory(item)">删除</button>
                  </template>
                </VoicePlayer>
              </li>
            </ul>

            <footer v-if="historyPageCount > 1" class="history-pager">
              <button
                class="pager-btn"
                type="button"
                :disabled="historyPage <= 1"
                @click="historyPage -= 1"
              >
                上一页
              </button>
              <div class="pager-pages">
                <button
                  v-for="page in historyPageCount"
                  :key="page"
                  class="pager-dot"
                  :class="{ active: page === historyPage }"
                  type="button"
                  :aria-label="`第 ${page} 页`"
                  :aria-current="page === historyPage ? 'page' : undefined"
                  @click="historyPage = page"
                >
                  {{ page }}
                </button>
              </div>
              <button
                class="pager-btn"
                type="button"
                :disabled="historyPage >= historyPageCount"
                @click="historyPage += 1"
              >
                下一页
              </button>
            </footer>
          </section>
        </div>

        <!-- 声音与参数 -->
        <aside class="studio-panel control-panel">
          <header class="studio-panel-head control-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Voice &amp; Params</span>
              <h2 class="studio-panel-title">声音与参数</h2>
            </div>
            <button class="ghost-btn" type="button" @click="resetParams">重置</button>
          </header>

          <div class="control-body studio-scroll">
            <!-- 01 声音 -->
            <section class="side-card">
              <header class="side-card-head">
                <span class="side-index">01</span>
                <div class="side-card-titles">
                  <h3>声音</h3>
                  <p>{{ model.displayName }} · 已接入</p>
                </div>
              </header>

              <div class="side-card-body">
                <div class="voice-current">
                  <div class="voice-current-main">
                    <span class="voice-current-label">当前音色</span>
                    <strong>{{ selectedVoice.name }}</strong>
                    <p>{{ selectedVoice.description || selectedVoice.voiceId }}</p>
                  </div>
                  <button class="mini-btn" type="button" :disabled="previewing" @click="handlePreviewVoice">
                    {{ previewing ? '合成中…' : '试听' }}
                  </button>
                </div>

                <VoicePlayer
                  v-if="preview && preview.voiceId === selectedVoice.voiceId && !voiceModalOpen"
                  :key="preview.url"
                  :src="preview.url"
                  :duration-ms="preview.durationMs"
                  :waveform="preview.waveform"
                  :bars="40"
                  compact
                  autoplay
                />

                <p v-if="previewHint" class="field-hint field-hint--flush">{{ previewHint }}</p>

                <button ref="voiceChangeBtnRef" class="voice-change-btn" type="button" @click="openVoicePicker">
                  <svg
                    class="voice-change-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    aria-hidden="true"
                  >
                    <path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4" />
                  </svg>
                  <span>更换音色</span>
                  <em>{{ catalogState === 'loading' ? '加载中…' : `${allVoices.length} 个可选` }}</em>
                  <svg
                    class="voice-change-arrow"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              </div>
            </section>

            <!-- 02 演绎 -->
            <section class="side-card">
              <header class="side-card-head">
                <span class="side-index">02</span>
                <div class="side-card-titles">
                  <h3>演绎</h3>
                  <p>语速 · 语调 · 音量 · 情绪</p>
                </div>
              </header>

              <div class="side-card-body side-card-body--params">
                <div class="param-row">
                  <div class="param-head">
                    <span class="field-label">语速</span>
                    <span class="param-value">{{ speed.toFixed(2) }}×</span>
                  </div>
                  <input
                    v-model.number="speed"
                    class="voice-range"
                    type="range"
                    :min="speedRange.min"
                    :max="speedRange.max"
                    :step="speedRange.step"
                    :style="{ '--fill': percentOf(speed, speedRange) }"
                    aria-label="语速"
                  />
                </div>

                <div class="param-row">
                  <div class="param-head">
                    <span class="field-label">语调</span>
                    <span class="param-value">{{ pitch > 0 ? '+' : '' }}{{ pitch }}</span>
                  </div>
                  <input
                    v-model.number="pitch"
                    class="voice-range"
                    type="range"
                    :min="pitchRange.min"
                    :max="pitchRange.max"
                    :step="pitchRange.step"
                    :style="{ '--fill': percentOf(pitch, pitchRange) }"
                    aria-label="语调"
                  />
                </div>

                <div class="param-row">
                  <div class="param-head">
                    <span class="field-label">音量</span>
                    <span class="param-value">{{ vol.toFixed(1) }}</span>
                  </div>
                  <input
                    v-model.number="vol"
                    class="voice-range"
                    type="range"
                    :min="volRange.min"
                    :max="volRange.max"
                    :step="volRange.step"
                    :style="{ '--fill': percentOf(vol, volRange) }"
                    aria-label="音量"
                  />
                </div>

                <div class="param-row">
                  <div class="param-head">
                    <span class="field-label">情绪</span>
                    <span class="field-note">7 种可选 · 不指定则自动判断</span>
                  </div>
                  <div class="emotion-grid">
                    <button
                      class="emotion-chip"
                      :class="{ active: emotion === '' }"
                      type="button"
                      @click="emotion = ''"
                    >
                      不指定
                    </button>
                    <button
                      v-for="item in VOICE_EMOTIONS"
                      :key="item.value"
                      class="emotion-chip"
                      :class="{ active: emotion === item.value }"
                      type="button"
                      @click="emotion = emotion === item.value ? '' : item.value"
                    >
                      <span aria-hidden="true">{{ item.icon }}</span>{{ item.label }}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 03 输出 -->
            <details class="side-card side-card--collapsible">
              <summary class="side-card-head side-card-summary">
                <span class="side-index">03</span>
                <div class="side-card-titles">
                  <h3>输出</h3>
                  <p>格式与音质</p>
                </div>
                <span class="side-card-meta">{{ audioSummary }}</span>
                <svg
                  class="toggle-chevron"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </summary>

              <div class="side-card-body">
                <div class="output-grid">
                  <label class="adv-field">
                    <span>格式</span>
                    <select v-model="audioFormat" class="voice-select">
                      <option v-for="item in SPEECH_FORMATS" :key="item.value" :value="item.value">{{ item.label }}</option>
                    </select>
                  </label>
                  <label class="adv-field">
                    <span>采样率</span>
                    <select v-model.number="sampleRate" class="voice-select">
                      <option v-for="rate in SPEECH_SAMPLE_RATES" :key="rate" :value="rate">{{ rate }} Hz</option>
                    </select>
                  </label>
                  <label class="adv-field">
                    <span>比特率</span>
                    <select v-model.number="bitrate" class="voice-select" :disabled="audioFormat !== 'mp3'">
                      <option v-for="rate in SPEECH_BITRATES" :key="rate" :value="rate">{{ rate / 1000 }} kbps</option>
                    </select>
                  </label>
                  <label class="adv-field">
                    <span>声道</span>
                    <select v-model.number="channel" class="voice-select">
                      <option :value="1">单声道</option>
                      <option :value="2">双声道</option>
                    </select>
                  </label>
                </div>

                <label class="switch-row">
                  <input v-model="textNormalization" type="checkbox" />
                  <span>中英文文本规范化（数字、单位读法）</span>
                </label>

                <p class="field-hint field-hint--flush">MP3 体积最小，最适合入片；WAV / FLAC 无损但体积更大。</p>
              </div>
            </details>
          </div>

          <footer class="control-footer">
            <div class="cost-line">
              <span>{{ charCount }} 字符</span>
              <span class="dot" aria-hidden="true">·</span>
              <span class="cost-voice">{{ selectedVoice.name }}</span>
            </div>
            <button
              class="studio-btn studio-btn--primary generate-btn"
              type="button"
              :disabled="!canGenerate"
              @click="handleGenerate"
            >
              {{ generating ? '合成中…' : '生成配音' }}
              <svg v-if="!generating" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </button>
            <p v-if="generateError" class="control-error">{{ generateError }}</p>
          </footer>
        </aside>
      </div>

      <!-- ================= 声音克隆 ================= -->
            <!-- ================= 音色设计 ================= -->
      <div v-show="activeTab === 'design'" class="design-layout">
        <section class="studio-panel design-preset-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Voice Design</span>
              <h2 class="studio-panel-title">音色配方 · 从一段描述生成新声音</h2>
            </div>
            <span class="studio-panel-meta">{{ designPresets.length }} 个配方</span>
          </header>

          <div class="design-preset-body">
            <p class="design-lead">
              借鉴 VoiceStudio 的 voice gallery：把「性别 + 年龄 + 音色质感 + 语速 + 场景」写成描述，
              挑一个配方填入右侧直接生成试听；不满意就改两个字再试。
            </p>

            <div class="voice-modal-scenes design-scene-row">
              <button
                v-for="scene in designSceneOptions"
                :key="scene.key"
                class="voice-filter-chip"
                :class="{ active: designSceneFilter === scene.key }"
                type="button"
                @click="designSceneFilter = scene.key"
              >
                {{ scene.label }}
              </button>
            </div>

            <div class="design-preset-grid">
              <button
                v-for="preset in designPresets"
                :key="preset.id"
                class="design-preset-card"
                :class="{ active: designPrompt === preset.prompt }"
                type="button"
                @click="applyDesignPreset(preset)"
              >
                <span class="design-preset-top">
                  <strong>{{ preset.name }}</strong>
                  <em>{{ VOICE_SCENE_LABELS[preset.scenes[0]] }}</em>
                </span>
                <span class="design-preset-blurb">{{ preset.blurb }}</span>
                <span class="design-preset-tags">
                  <em v-for="tag in preset.tags" :key="tag">{{ tag }}</em>
                </span>
              </button>
            </div>
          </div>
        </section>

        <div class="design-side">
          <section class="studio-panel design-form-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Design</span>
                <h2 class="studio-panel-title">描述你想要的声音</h2>
              </div>
              <span class="studio-panel-meta">按试听字数计费</span>
            </header>

            <div class="design-form-body">
              <label class="design-field">
                <span class="design-field-head">
                  <span class="design-field-label">音色名称</span>
                  <span class="design-field-hint">仅保存在本机</span>
                </span>
                <input
                  v-model="designName"
                  class="studio-field design-input"
                  type="text"
                  maxlength="20"
                  placeholder="例如：深夜电台"
                />
              </label>

              <label class="design-field">
                <span class="design-field-head">
                  <span class="design-field-label">音色描述</span>
                  <span class="design-field-count">{{ designPrompt.length }} / 300</span>
                </span>
                <textarea
                  v-model="designPrompt"
                  class="studio-field design-input design-textarea"
                  rows="5"
                  maxlength="300"
                  placeholder="例如：温柔松弛的青年女性声音，带一点气声，语速很慢，像深夜电台主播在耳边说话。"
                />
              </label>

              <label class="design-field">
                <span class="design-field-head">
                  <span class="design-field-label">试听文本</span>
                  <span class="design-field-count">{{ designPreviewText.length }} / 200</span>
                </span>
                <textarea
                  v-model="designPreviewText"
                  class="studio-field design-input design-textarea design-textarea--short"
                  rows="3"
                  maxlength="200"
                />
              </label>

              <button
                class="studio-btn studio-btn--primary design-submit"
                type="button"
                :disabled="!canDesign"
                @click="handleDesignVoice"
              >
                {{ designing ? '正在设计音色…' : '生成音色与试听' }}
              </button>

              <div class="design-estimate">
                <span>预计计费约 {{ designEstimate }} 字符</span>
                <span v-if="designPrompt.trim().length < 6" class="design-estimate-warn">
                  描述再写详细一点效果更好
                </span>
              </div>

              <p v-if="designError" class="inline-error">{{ designError }}</p>
              <p class="field-hint">
                设计出的音色 7 天内未用于合成会被上游删除；用它合成过一次就会长期保留。
              </p>

              <div v-if="designResult" ref="designResultRef" class="design-result">
                <div class="clone-result-head">
                  <strong>{{ designResult.name }}</strong>
                  <span class="clone-id">{{ designResult.voiceId }}</span>
                </div>
                <VoicePlayer
                  v-if="designResult.url"
                  :key="designResult.url"
                  :src="designResult.url"
                  :duration-ms="designResult.durationMs"
                  :bars="48"
                  compact
                  autoplay
                />
                <p v-if="designResult.usageCharacters" class="design-result-meta">
                  本次计费 {{ designResult.usageCharacters }} 个字符 · 已保存到「我的音色」
                </p>
                <div class="clone-result-actions">
                  <button class="mini-btn" type="button" @click="useVoiceForSpeech(designResult.voiceId)">
                    用它配音
                  </button>
                  <button
                    class="mini-btn"
                    type="button"
                    :disabled="!canDesign"
                    @click="handleDesignVoice"
                  >
                    再生成一个
                  </button>
                  <button class="mini-btn" type="button" @click="designResult = null">收起</button>
                </div>
              </div>
            </div>
          </section>

          <section class="studio-panel my-voices-panel">
            <header class="studio-panel-head">
              <div class="studio-panel-headings">
                <span class="studio-kicker">Designed</span>
                <h2 class="studio-panel-title">我设计的音色</h2>
              </div>
              <span class="studio-panel-meta">{{ designedVoices.length }} 个</span>
            </header>

            <div class="my-voices-body">
              <p v-if="!designedVoices.length" class="voice-empty">
                还没有设计音色。从左侧挑一个配方，或直接写一段描述。
              </p>

              <ul v-else class="my-voices-list">
                <li v-for="voice in designedVoices" :key="voice.voiceId" class="my-voice-card">
                  <div class="my-voice-head">
                    <strong>{{ voice.name }}</strong>
                    <span class="my-voice-date">{{ formatDate(voice.createdAt) }}</span>
                  </div>
                  <code class="my-voice-id">{{ voice.voiceId }}</code>
                  <p v-if="voice.prompt" class="my-voice-prompt">{{ voice.prompt }}</p>

                  <VoicePlayer
                    v-if="voice.demoDataUrl || voice.demoUrl"
                    :key="voice.demoDataUrl || voice.demoUrl"
                    :src="voice.demoDataUrl || voice.demoUrl"
                    :duration-ms="voice.durationMs || 0"
                    :bars="40"
                    compact
                  />
                  <p v-else class="field-hint">
                    {{ voice.used ? '已经用于合成，可长期使用。' : '没有本地试听音频，可以直接用于配音。' }}
                  </p>

                  <div class="my-voice-actions">
                    <button class="mini-btn" type="button" @click="useVoiceForSpeech(voice.voiceId)">
                      用于配音
                    </button>
                    <button
                      class="mini-btn danger"
                      type="button"
                      :disabled="deletingDesignedId === voice.voiceId"
                      @click="handleDeleteDesignedVoice(voice)"
                    >
                      {{ deletingDesignedId === voice.voiceId ? '删除中…' : '删除' }}
                    </button>
                  </div>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>

      <div v-show="activeTab === 'clone'" class="clone-layout">
        <!-- 样本 -->
        <section class="studio-panel sample-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Sample</span>
              <h2 class="studio-panel-title">第一步 · 准备样本音频</h2>
            </div>
            <span class="studio-panel-meta">10 秒 ~ 5 分钟</span>
          </header>

          <div class="sample-body">
            <div
              class="dropzone"
              :class="{ 'is-over': dragOver, 'has-sample': !!sample }"
              role="button"
              tabindex="0"
              @click="openFilePicker"
              @keydown.enter.prevent="openFilePicker"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="handleDrop"
            >
              <span class="dropzone-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 16V4m0 0L7.6 8.4M12 4l4.4 4.4" />
                  <path d="M4.4 15.2v2.4a2.4 2.4 0 0 0 2.4 2.4h10.4a2.4 2.4 0 0 0 2.4-2.4v-2.4" />
                </svg>
              </span>
              <strong>{{ sample ? '重新选择样本音频' : '拖入音频，或点击选择文件' }}</strong>
              <p>支持 mp3 / m4a / wav，≤ 20MB。单人、安静、无背景音乐的人声效果最好。</p>
              <input
                ref="sampleInputRef"
                type="file"
                accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav,audio/x-wav"
                class="file-input"
                @change="handleFileChange"
              />
            </div>

            <div class="record-box">
              <div class="record-head">
                <div>
                  <strong>或者直接录一段</strong>
                  <p>点击开始，录满 10 秒后停止；录音会自动转成 WAV 上传。</p>
                </div>
                <span class="record-timer" :class="{ 'is-live': recorder.isRecording.value }">
                  {{ formatDurationMs(recorder.elapsedMs.value) }}
                </span>
              </div>

              <div class="record-controls">
                <button
                  class="record-btn"
                  :class="{ 'is-recording': recorder.isRecording.value }"
                  type="button"
                  :disabled="recorder.isProcessing.value || recorder.isRequesting.value || sampleProcessing"
                  @click="toggleRecord"
                >
                  <span class="record-dot" aria-hidden="true" />
                  {{
                    recorder.isRequesting.value
                      ? '等待麦克风授权…'
                      : recorder.isProcessing.value
                        ? '处理中…'
                        : recorder.isRecording.value
                          ? '停止录音'
                          : recorder.elapsedMs.value
                            ? '重新录制'
                            : '开始录音'
                  }}
                </button>

                <div class="level-meter" aria-hidden="true">
                  <span
                    v-for="index in 16"
                    :key="index"
                    :style="{ opacity: recorder.isRecording.value ? Math.max(0.14, recorder.level.value * 1.6 - index * 0.04) : 0.14 }"
                  />
                </div>
              </div>

              <p v-if="recorder.error.value" class="inline-error">{{ recorder.error.value }}</p>
            </div>

            <div v-if="sample" class="sample-card">
              <div class="sample-card-head">
                <div>
                  <strong>{{ sample.name }}</strong>
                  <p>
                    {{ formatDurationMs(sample.durationSec * 1000) }} · {{ formatBytes(sample.size) }} ·
                    {{ sample.source === 'record' ? '麦克风录音' : '上传文件' }}
                  </p>
                </div>
                <div class="sample-card-actions">
                  <button class="mini-btn" type="button" @click="openFilePicker">更换</button>
                  <button class="mini-btn danger" type="button" @click="clearSample">移除</button>
                </div>
              </div>
              <VoicePlayer
                :key="sample.previewUrl"
                :src="sample.previewUrl"
                :duration-ms="sample.durationSec * 1000"
                :bars="56"
                compact
              />
            </div>

            <p v-if="sampleError" class="inline-error">{{ sampleError }}</p>

            <ul class="sample-tips">
              <li>时长 10 秒 ~ 5 分钟，文件 ≤ 20MB</li>
              <li>单人说话、无其他人声与背景音乐</li>
              <li>复刻音色 7 天内未被使用会被上游自动删除</li>
            </ul>
          </div>
        </section>

        <!-- 复刻 -->
        <section class="studio-panel clone-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">Clone</span>
              <h2 class="studio-panel-title">第二步 · 复刻音色</h2>
            </div>
            <span class="studio-panel-meta">不占本地存储</span>
          </header>

          <div class="clone-body">
            <label class="adv-field">
              <span>音色名称（只存在本机）</span>
              <input
                v-model="cloneName"
                class="studio-field clone-input"
                type="text"
                maxlength="24"
                :placeholder="`我的音色 ${myVoices.length + 1}`"
              />
            </label>

            <label class="adv-field">
              <span>复刻试听文本</span>
              <textarea
                v-model="cloneDemoText"
                class="studio-field clone-input clone-textarea"
                maxlength="200"
                rows="3"
              />
            </label>

            <div class="switch-group">
              <label class="switch-row">
                <input v-model="noiseReduction" type="checkbox" />
                <span>样本降噪</span>
              </label>
              <label class="switch-row">
                <input v-model="volumeNormalization" type="checkbox" />
                <span>音量归一化</span>
              </label>
            </div>

            <ol class="clone-steps">
              <li :class="stepClass('uploading')">
                <span class="step-index">1</span>
                <div>
                  <strong>上传样本</strong>
                  <p>{{ cloneStage === 'uploading' ? '正在上传音频…' : '拿到 file_id' }}</p>
                </div>
              </li>
              <li :class="stepClass('cloning')">
                <span class="step-index">2</span>
                <div>
                  <strong>复刻音色</strong>
                  <p>{{ cloneStage === 'cloning' ? '上游正在训练音色…' : '生成 voice_id' }}</p>
                </div>
              </li>
              <li :class="stepClass('done')">
                <span class="step-index">3</span>
                <div>
                  <strong>试听确认</strong>
                  <p>{{ cloneStage === 'done' ? '可以直接拿去配音' : '自动合成一句试听' }}</p>
                </div>
              </li>
            </ol>

            <button
              class="studio-btn studio-btn--primary clone-submit"
              type="button"
              :disabled="!canClone"
              @click="handleClone"
            >
              {{ cloneBusy ? (cloneStage === 'uploading' ? '上传中…' : '复刻中…') : '开始复刻' }}
            </button>

            <p v-if="!sample" class="field-hint">先在上面准备一段样本音频。</p>
            <p v-if="cloneError" class="inline-error">{{ cloneError }}</p>

            <div v-if="cloneResult" class="clone-result">
              <div class="clone-result-head">
                <strong>复刻完成</strong>
                <span class="clone-id">{{ cloneResult.voiceId }}</span>
              </div>

              <VoicePlayer
                v-if="cloneResult.demoDataUrl || cloneResult.demoUrl"
                :key="cloneResult.demoDataUrl || cloneResult.demoUrl"
                :src="cloneResult.demoDataUrl || cloneResult.demoUrl"
                :duration-ms="cloneResult.durationMs || 0"
                :bars="48"
                compact
                autoplay
              />

              <div class="clone-result-actions">
                <button class="mini-btn" type="button" @click="useVoiceForSpeech(cloneResult.voiceId)">
                  用它配音
                </button>
                <button class="mini-btn" type="button" @click="clearSample">再录一段</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 我的音色 -->
        <section class="studio-panel my-voices-panel">
          <header class="studio-panel-head">
            <div class="studio-panel-headings">
              <span class="studio-kicker">My Voices</span>
              <h2 class="studio-panel-title">我的音色</h2>
            </div>
            <span class="studio-panel-meta">{{ myVoices.length }} 个</span>
          </header>

          <div class="my-voices-body">
            <p v-if="!myVoices.length" class="voice-empty">
              还没有复刻音色。录一段或上传一段人声，10 秒就能得到自己的声音。
            </p>

            <ul v-else class="my-voices-list">
              <li v-for="voice in myVoices" :key="voice.voiceId" class="my-voice-card">
                <div class="my-voice-head">
                  <strong>{{ voice.name }}</strong>
                  <span class="my-voice-date">{{ formatDate(voice.createdAt) }}</span>
                </div>
                <code class="my-voice-id">{{ voice.voiceId }}</code>

                <VoicePlayer
                  v-if="voice.demoDataUrl || voice.demoUrl"
                  :key="voice.demoDataUrl || voice.demoUrl"
                  :src="voice.demoDataUrl || voice.demoUrl"
                  :duration-ms="voice.durationMs || 0"
                  :bars="40"
                  compact
                />
                <p v-else class="field-hint">这个音色没有可用的试听音频。</p>

                <div class="my-voice-actions">
                  <button class="mini-btn" type="button" @click="useVoiceForSpeech(voice.voiceId)">用于配音</button>
                  <button
                    class="mini-btn danger"
                    type="button"
                    :disabled="deletingVoiceId === voice.voiceId"
                    @click="handleDeleteVoice(voice)"
                  >
                    {{ deletingVoiceId === voice.voiceId ? '删除中…' : '删除' }}
                  </button>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </main>

    <!-- ================= 翻译语言选择 ================= -->
    <Teleport to="body">
      <div v-if="translateOpen" class="voice-modal-layer translate-layer" @click.self="closeTranslatePicker">
        <section
          ref="translateDialogRef"
          class="translate-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="translate-dialog-title"
          tabindex="-1"
        >
          <header class="translate-head">
            <div class="translate-headings">
              <span class="studio-kicker">Translate</span>
              <h2 id="translate-dialog-title">翻译配音文案</h2>
              <p>选择目标语言，换一种语言继续配音。停顿和语气词标记会保留。</p>
            </div>
            <button class="voice-modal-close" type="button" aria-label="关闭翻译语言选择" @click="closeTranslatePicker">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div class="translate-body studio-scroll">
            <div class="translate-grid">
              <button
                v-for="language in TRANSLATION_LANGUAGES"
                :key="language.code"
                class="translate-option"
                type="button"
                @click="handleTranslate(language)"
              >
                <strong>{{ language.label }}</strong>
                <span>{{ language.nativeLabel }}</span>
              </button>
            </div>

            <p class="translate-model">翻译模型 · {{ translationModelLabel }}</p>
          </div>
        </section>
      </div>
    </Teleport>

    <!-- ================= 音色选择（大面板） ================= -->
    <Teleport to="body">
      <div v-if="voiceModalOpen" class="voice-modal-layer" @click.self="closeVoicePicker">
        <section
          ref="voiceModalRef"
          class="voice-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="voice-modal-title"
          tabindex="-1"
        >
          <header class="voice-modal-head">
            <div class="voice-modal-headings">
              <span class="studio-kicker">Voice Library</span>
              <h2 id="voice-modal-title">选择音色</h2>
              <p>搜索或按语言筛选，点选后可直接试听；确认后回到创作。</p>
            </div>
            <div class="voice-modal-head-actions">
              <span class="voice-modal-count">
                {{ catalogState === 'loading' ? '加载中…' : `${allVoices.length} 个音色` }}
              </span>
              <button class="voice-modal-close" type="button" aria-label="关闭音色选择" @click="closeVoicePicker">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          </header>

          <div class="voice-modal-toolbar">
            <label class="voice-modal-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 4 4" />
              </svg>
              <input
                ref="voiceSearchRef"
                v-model="voiceQuery"
                type="search"
                placeholder="搜索音色名称 / ID / 描述"
                aria-label="搜索音色"
                @keydown.enter.prevent="pickFirstVisibleVoice"
              />
              <button v-if="voiceQuery" class="voice-search-clear" type="button" @click="clearVoiceQuery">
                清除
              </button>
            </label>
            <button
              class="mini-btn voice-refresh"
              type="button"
              :disabled="catalogState === 'loading'"
              @click="loadCatalog(true)"
            >
              {{ catalogState === 'loading' ? '刷新中…' : '刷新' }}
            </button>
          </div>

          <div class="voice-modal-filters">
            <div class="lang-tabs">
              <button
                v-for="language in languageOptions"
                :key="language.key"
                class="lang-tab"
                :class="{ active: languageFilter === language.key }"
                type="button"
                @click="languageFilter = language.key"
              >
                {{ language.label }}
              </button>
            </div>
            <span class="voice-modal-result">{{ visibleVoiceCount }} 个匹配</span>
          </div>

          <div v-if="showMetaFilters" class="voice-modal-meta">
            <div class="voice-modal-scenes">
              <button
                class="voice-filter-chip"
                :class="{ active: sceneFilter === 'all' }"
                type="button"
                @click="sceneFilter = 'all'"
              >
                全部场景
              </button>
              <button
                v-for="scene in VOICE_SCENES"
                :key="scene.key"
                class="voice-filter-chip"
                :class="{ active: sceneFilter === scene.key }"
                type="button"
                @click="sceneFilter = sceneFilter === scene.key ? 'all' : scene.key"
              >
                {{ scene.label }}
              </button>
            </div>
            <div class="voice-modal-genders">
              <button
                v-for="gender in genderOptions"
                :key="gender.key"
                class="voice-filter-chip is-gender"
                :class="{ active: genderFilter === gender.key }"
                type="button"
                @click="genderFilter = gender.key"
              >
                {{ gender.label }}
              </button>
            </div>
          </div>

          <div class="voice-modal-list studio-scroll">
            <template v-if="filteredClonedVoices.length">
              <p class="voice-group-label">
                我的音色 · 复刻
                <em>{{ filteredClonedVoices.length }}</em>
              </p>
              <div class="voice-grid">
                <div
                  v-for="voice in filteredClonedVoices"
                  :key="voice.voiceId"
                  class="voice-option"
                  :class="{ active: voice.voiceId === selectedVoiceId }"
                  role="button"
                  tabindex="0"
                  :aria-pressed="voice.voiceId === selectedVoiceId"
                  @click="selectVoice(voice.voiceId)"
                  @keydown.enter.prevent="selectVoice(voice.voiceId)"
                  @keydown.space.prevent="selectVoice(voice.voiceId)"
                >
                  <span class="voice-option-top">
                    <strong>{{ voice.name }}</strong>
                    <span class="voice-option-meta">
                      <svg
                        v-if="voice.voiceId === selectedVoiceId"
                        class="voice-option-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                      <em
                        class="voice-lang-tag is-clone"
                        title="复刻音色"
                      >
                        {{ getVoiceLanguageTag(voice) }}
                      </em>
                    </span>
                  </span>
                  <span class="voice-option-desc">{{ voice.voiceId }}</span>
                  <button
                    class="voice-option-play"
                    type="button"
                    :disabled="previewing"
                    :aria-label="`试听 ${voice.name}`"
                    :title="`试听 ${voice.name}`"
                    @click.stop="previewVoice(voice.voiceId)"
                  >
                    <span
                      v-if="previewingVoiceId === voice.voiceId"
                      class="voice-option-spinner"
                      aria-hidden="true"
                    />
                    <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8.4 5.2v13.6L19.5 12 8.4 5.2Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </template>

            <template v-if="filteredDesignedVoices.length">
              <p class="voice-group-label">
                我的音色 · 设计
                <em>{{ filteredDesignedVoices.length }}</em>
              </p>
              <div class="voice-grid">
                <div
                  v-for="voice in filteredDesignedVoices"
                  :key="voice.voiceId"
                  class="voice-option"
                  :class="{ active: voice.voiceId === selectedVoiceId }"
                  role="button"
                  tabindex="0"
                  :aria-pressed="voice.voiceId === selectedVoiceId"
                  @click="selectVoice(voice.voiceId)"
                  @keydown.enter.prevent="selectVoice(voice.voiceId)"
                  @keydown.space.prevent="selectVoice(voice.voiceId)"
                >
                  <span class="voice-option-top">
                    <strong>{{ voice.name }}</strong>
                    <span class="voice-option-meta">
                      <svg
                        v-if="voice.voiceId === selectedVoiceId"
                        class="voice-option-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                      <em class="voice-lang-tag is-clone" title="设计音色">设计</em>
                    </span>
                  </span>
                  <span class="voice-option-desc">{{ voice.prompt || '账号里已有的设计音色' }}</span>
                  <button
                    class="voice-option-play"
                    type="button"
                    :disabled="previewing"
                    :aria-label="`试听 ${voice.name}`"
                    :title="`试听 ${voice.name}`"
                    @click.stop="previewVoice(voice.voiceId)"
                  >
                    <span
                      v-if="previewingVoiceId === voice.voiceId"
                      class="voice-option-spinner"
                      aria-hidden="true"
                    />
                    <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8.4 5.2v13.6L19.5 12 8.4 5.2Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </template>

            <template v-for="group in groupedVoices" :key="group.key">
              <p class="voice-group-label">
                {{ group.label }}
                <em>{{ group.voices.length }}</em>
              </p>
              <div class="voice-grid">
                <div
                  v-for="voice in group.voices"
                  :key="voice.voiceId"
                  class="voice-option"
                  :class="{ active: voice.voiceId === selectedVoiceId }"
                  role="button"
                  tabindex="0"
                  :aria-pressed="voice.voiceId === selectedVoiceId"
                  @click="selectVoice(voice.voiceId)"
                  @keydown.enter.prevent="selectVoice(voice.voiceId)"
                  @keydown.space.prevent="selectVoice(voice.voiceId)"
                >
                  <span class="voice-option-top">
                    <strong>{{ voice.name }}</strong>
                    <span class="voice-option-meta">
                      <svg
                        v-if="voice.voiceId === selectedVoiceId"
                        class="voice-option-check"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        aria-hidden="true"
                      >
                        <path d="m5 12 4 4L19 6" />
                      </svg>
                      <em
                        class="voice-lang-tag"
                        :title="getVoiceLanguageTag(voice)"
                      >
                        {{ getVoiceLanguageTag(voice) }}
                      </em>
                    </span>
                  </span>
                  <span class="voice-option-chips">
                    <em v-for="chip in getVoiceMetaChips(voice)" :key="chip">{{ chip }}</em>
                  </span>
                  <span class="voice-option-desc">{{ voice.description || voice.voiceId }}</span>
                  <button
                    class="voice-option-play"
                    type="button"
                    :disabled="previewing"
                    :aria-label="`试听 ${voice.name}`"
                    :title="`试听 ${voice.name}`"
                    @click.stop="previewVoice(voice.voiceId)"
                  >
                    <span
                      v-if="previewingVoiceId === voice.voiceId"
                      class="voice-option-spinner"
                      aria-hidden="true"
                    />
                    <svg v-else viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8.4 5.2v13.6L19.5 12 8.4 5.2Z" />
                    </svg>
                  </button>
                </div>
              </div>
            </template>

            <div v-if="!filteredClonedVoices.length && !filteredDesignedVoices.length && !groupedVoices.length" class="voice-empty">
              <p>没有匹配的音色，换个关键词或切换语言分组试试。</p>
              <div class="voice-empty-actions">
                <button
                  v-if="voiceQuery || sceneFilter !== 'all' || genderFilter !== 'all'"
                  class="link-btn"
                  type="button"
                  @click="resetVoiceFilters"
                >
                  清除筛选
                </button>
                <button class="link-btn" type="button" @click="openDesignFromPicker">
                  用音色设计造一个
                </button>
              </div>
            </div>
          </div>

          <div v-if="preview && preview.voiceId === selectedVoice.voiceId" class="voice-modal-preview">
            <VoicePlayer
              :key="preview.url"
              :src="preview.url"
              :duration-ms="preview.durationMs"
              :waveform="preview.waveform"
              :bars="80"
              compact
              autoplay
            />
          </div>

          <footer class="voice-modal-foot">
            <div class="voice-modal-current">
              <span class="voice-current-label">当前音色</span>
              <strong>{{ selectedVoice.name }}</strong>
              <p>{{ selectedVoice.description || selectedVoice.voiceId }}</p>
              <p v-if="previewHint" class="voice-modal-hint">{{ previewHint }}</p>
            </div>
            <div class="voice-modal-actions">
              <button class="mini-btn" type="button" @click="openDesignFromPicker">音色设计</button>
              <button class="mini-btn" type="button" :disabled="previewing" @click="handlePreviewVoice">
                {{ previewing ? '合成中…' : '试听' }}
              </button>
              <button class="studio-btn studio-btn--primary" type="button" @click="closeVoicePicker">完成</button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { confirmDialog, alertDialog } from '@/features/ui/dialog'
import StudioHeader from '@/components/StudioHeader.vue'
import StudioIsland from '@/components/StudioIsland.vue'
import VoicePlayer from '@/components/VoicePlayer.vue'
import { useAssetInboxStore } from '@/stores/assetInboxStore'
import { chatCompletion } from '@/api/aiping'
import { cloneVoice, deleteClonedVoice, designVoice, fetchVoiceCatalog, synthesizeSpeech, uploadCloneAudio } from '@/api/voice'
import {
  CLONE_SAMPLE_MAX_BYTES,
  CLONE_SAMPLE_MAX_SECONDS,
  CLONE_SAMPLE_MIN_SECONDS,
  computeWaveform,
  formatBytes,
  formatDurationMs,
  getAudioDurationMs,
  isCloneSampleFile,
  normalizeCloneFileName,
  remoteAudioToDataUrl,
} from '@/features/voice/audio'
import {
  DEFAULT_AUDIO_SETTING,
  SPEECH_BITRATES,
  SPEECH_FORMATS,
  SPEECH_SAMPLE_RATES,
  VOICE_EMOTIONS,
  VOICE_MODELS,
  VOICE_PARAM_LIMITS,
  clampVoiceParam,
  getCloneDemoModel,
} from '@/features/voice/models'
import { useVoiceRecorder } from '@/features/voice/recorder'
import {
  loadClonedVoices,
  loadDesignedVoices,
  loadVoiceSettings,
  markDesignedVoiceUsed,
  removeStoredClonedVoice,
  removeStoredDesignedVoice,
  saveVoiceSettings,
  syncClonedVoicesFromRemote,
  syncDesignedVoicesFromRemote,
  upsertClonedVoice,
  upsertDesignedVoice,
} from '@/features/voice/storage'
import {
  clearVoiceLibrary,
  deleteVoiceLibraryItems,
  loadVoiceLibrary,
  saveVoiceLibraryItem,
  VOICE_LIBRARY_LIMIT,
} from '@/features/voice/library'
import { INTERJECTION_TAGS, PAUSE_PRESETS, formatPauseTag } from '@/features/voice/tags'
import {
  TRANSLATION_LANGUAGES,
  buildTranslationMessages,
  cleanTranslationOutput,
} from '@/features/voice/translation'
import type { TranslationLanguage } from '@/features/voice/translation'
import { DEFAULT_TRANSLATION_MODEL, useSettingsStore } from '@/stores/settingsStore'
import {
  CLONE_DEMO_TEXT,
  DEFAULT_VOICE_ID,
  FALLBACK_SYSTEM_VOICES,
  TEXT_PRESETS,
  VOICE_LANGUAGES,
  buildPreviewText,
  getVoiceLanguageTag,
  groupVoicesByLanguage,
  matchesVoiceQuery,
} from '@/features/voice/voices'
import type { VoiceLanguageKey } from '@/features/voice/voices'
import {
  VOICE_GENDER_LABELS,
  VOICE_SCENE_LABELS,
  VOICE_SCENES,
  getVoiceMetaChips,
  matchesVoiceMeta,
} from '@/features/voice/catalogMeta'
import type { VoiceGender, VoiceSceneKey } from '@/features/voice/catalogMeta'
import {
  DEFAULT_DESIGN_PREVIEW_TEXT,
  VOICE_DESIGN_PRESETS,
  getDesignSceneOptions,
} from '@/features/voice/designPresets'
import type { VoiceDesignPreset } from '@/features/voice/designPresets'
import type {
  CloneResult,
  CloneSample,
  CloneStage,
  RemoteClonedVoice,
  SpeechAudioFormat,
  SpeechResult,
  StoredClonedVoice,
  StoredDesignedVoice,
  SystemVoice,
  VoiceEmotion,
  VoiceHistoryItem,
  VoicePreview,
} from '@/features/voice/types'

const accent = 'var(--studio-accent-voice)'
const model = VOICE_MODELS[0]
const maxChars = model.capability.maxChars
const settingsStore = useSettingsStore()
const assetInbox = useAssetInboxStore()

const speedRange = VOICE_PARAM_LIMITS.speed
const pitchRange = VOICE_PARAM_LIMITS.pitch
const volRange = VOICE_PARAM_LIMITS.vol

const saved = loadVoiceSettings()

/* ---------------- 基础状态 ---------------- */

const activeTab = ref<'speech' | 'design' | 'clone'>('speech')
const text = ref('')
const speed = ref(saved.speed)
const pitch = ref(saved.pitch)
const vol = ref(saved.vol)
const emotion = ref<VoiceEmotion | ''>(saved.emotion)
const audioFormat = ref<SpeechAudioFormat>(saved.format)
const sampleRate = ref(saved.sampleRate)
const bitrate = ref(saved.bitrate)
const channel = ref<1 | 2>(saved.channel)
const textNormalization = ref(saved.textNormalization)
const validLanguageKeys: VoiceLanguageKey[] = ['all', 'zh', 'yue', 'en', 'ja', 'ko', 'other']
const languageFilter = ref<VoiceLanguageKey>(
  validLanguageKeys.includes(saved.languageFilter as VoiceLanguageKey)
    ? (saved.languageFilter as VoiceLanguageKey)
    : 'zh',
)

const selectedVoiceId = ref(saved.voiceId || DEFAULT_VOICE_ID)
const voiceQuery = ref('')

/** 选择库的场景 / 性别筛选（只对内置音色生效）。 */
const sceneFilter = ref<VoiceSceneKey | 'all'>('all')
const genderFilter = ref<VoiceGender | 'all'>('all')
const genderOptions: { key: VoiceGender | 'all'; label: string }[] = [
  { key: 'all', label: '不限性别' },
  ...(Object.keys(VOICE_GENDER_LABELS) as VoiceGender[]).map((key) => ({
    key,
    label: VOICE_GENDER_LABELS[key],
  })),
]
/** 场景 / 性别元数据只覆盖中文音色，切到外语分组时隐藏这两行筛选。 */
const showMetaFilters = computed(() => languageFilter.value === 'zh' || languageFilter.value === 'yue')

watch(languageFilter, (key) => {
  if (key !== 'zh' && key !== 'yue') {
    sceneFilter.value = 'all'
    genderFilter.value = 'all'
  }
})

const audioSummary = computed(
  () => `${audioFormat.value.toUpperCase()} · ${Number((sampleRate.value / 1000).toFixed(2))}kHz`,
)

const scriptRef = ref<HTMLTextAreaElement | null>(null)
const resultPanelRef = ref<HTMLElement | null>(null)
const voiceModalOpen = ref(false)
const voiceSearchRef = ref<HTMLInputElement | null>(null)
const voiceChangeBtnRef = ref<HTMLButtonElement | null>(null)

const charCount = computed(() => text.value.length)

/* ---------------- 文案翻译 ---------------- */

const translateBtnRef = ref<HTMLButtonElement | null>(null)
const translateDialogRef = ref<HTMLElement | null>(null)
const translateOpen = ref(false)
const translating = ref(false)
const translateError = ref('')
const translateStatus = ref('')

const translationModelLabel = computed(
  () => settingsStore.translationModel.trim() || DEFAULT_TRANSLATION_MODEL,
)

/* ---------------- 脚本快捷插入 ---------------- */

const customPauseSeconds = ref(1)

/**
 * textarea 失焦前的光标 / 选区。
 *
 * 点击标签按钮时浏览器会先把焦点移到按钮上，此时再读 textarea 的 selectionStart
 * 已经拿不到原来的位置；所以在 input / select / keyup / mouseup / blur 时先记下来。
 */
const scriptSelection = ref<{ start: number; end: number } | null>(null)

function rememberScriptSelection() {
  const el = scriptRef.value
  if (!el) return
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? start
  scriptSelection.value = { start, end }
}

/**
 * 把标记写进光标处（有选区则替换）；textarea 从未聚焦时追加到末尾。
 * 超出字数上限时按上限截断，避免绕过 maxlength。
 */
function insertSnippet(snippet: string) {
  const el = scriptRef.value
  const current = text.value
  const focused = !!el && document.activeElement === el
  const remembered = scriptSelection.value
  const fallback = current.length
  const rawStart = focused ? el!.selectionStart ?? fallback : remembered?.start ?? fallback
  const rawEnd = focused ? el!.selectionEnd ?? rawStart : remembered?.end ?? rawStart
  const start = Math.min(Math.max(0, rawStart), current.length)
  const end = Math.min(Math.max(start, rawEnd), current.length)
  const next = (current.slice(0, start) + snippet + current.slice(end)).slice(0, maxChars)
  const caret = Math.min(start + snippet.length, next.length)

  text.value = next
  // 连续点击多个标签时，以最新插入点为准。
  scriptSelection.value = { start: caret, end: caret }

  void nextTick(() => {
    const target = scriptRef.value
    if (!target) return
    target.focus()
    target.setSelectionRange(caret, caret)
  })
}

function insertPause(seconds: number) {
  insertSnippet(formatPauseTag(seconds))
}

function insertInterjection(code: string) {
  insertSnippet(`(${code})`)
}

/* ---------------- 文案翻译 ---------------- */

watch(translateOpen, (open) => {
  document.body.classList.toggle('voice-modal-open', open)
  if (open) {
    window.addEventListener('keydown', handleTranslateKeydown)
    void nextTick(() => translateDialogRef.value?.focus())
  } else {
    window.removeEventListener('keydown', handleTranslateKeydown)
  }
})

function handleTranslateKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeTranslatePicker()
    return
  }
  trapFocus(event, translateDialogRef.value)
}

/**
 * 键盘焦点锁在弹层内：Tab / Shift+Tab 到首尾时循环，
 * 避免焦点跑到被遮罩的页面上（读屏和纯键盘操作都会踩到）。
 */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function trapFocus(event: KeyboardEvent, container: HTMLElement | null | undefined) {
  if (event.key !== 'Tab' || !container) return

  const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.getClientRects().length > 0,
  )
  if (!nodes.length) return

  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  const active = document.activeElement as HTMLElement | null
  const inside = !!active && container.contains(active)

  if (event.shiftKey) {
    if (!inside || active === first) {
      event.preventDefault()
      last.focus()
    }
  } else if (!inside || active === last) {
    event.preventDefault()
    first.focus()
  }
}

function openTranslatePicker() {
  if (!text.value.trim() || translating.value) return
  translateError.value = ''
  translateStatus.value = ''
  translateOpen.value = true
}

function closeTranslatePicker() {
  translateOpen.value = false
  void nextTick(() => translateBtnRef.value?.focus())
}

async function handleTranslate(language: TranslationLanguage) {
  const source = text.value.trim()
  if (!source || translating.value) return

  closeTranslatePicker()
  translating.value = true
  translateError.value = ''
  translateStatus.value = ''

  try {
    const raw = await chatCompletion({
      model: translationModelLabel.value,
      messages: buildTranslationMessages(source, language),
      temperature: 0.2,
    })
    const translated = cleanTranslationOutput(raw)
    if (!translated) {
      throw new Error('翻译模型没有返回有效内容，请更换模型或稍后重试。')
    }

    const truncated = translated.length > maxChars
    const nextText = truncated ? translated.slice(0, maxChars) : translated
    text.value = nextText
    scriptSelection.value = { start: nextText.length, end: nextText.length }
    translateStatus.value = truncated
      ? `已翻译为${language.label}，超出 ${maxChars} 字已截断`
      : `已翻译为${language.label}`

    await nextTick()
    scriptRef.value?.focus()
    scriptRef.value?.setSelectionRange(nextText.length, nextText.length)
  } catch (error) {
    translateError.value = error instanceof Error ? error.message : '翻译失败，请稍后重试。'
  } finally {
    translating.value = false
  }
}

/* ---------------- 音色目录 ---------------- */

const systemVoices = ref<SystemVoice[]>([])
const remoteCloned = ref<RemoteClonedVoice[]>([])
const myVoices = ref<StoredClonedVoice[]>(loadClonedVoices())
const designedVoices = ref<StoredDesignedVoice[]>(loadDesignedVoices())
const catalogState = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

/** 本地复刻音色 + 账号里有、但本地没记录的音色。 */
const mergedClonedVoices = computed<SystemVoice[]>(() => {
  const local = myVoices.value.map((voice) => ({
    voiceId: voice.voiceId,
    name: voice.name,
    description: '我用样本复刻的音色',
    createdAt: '',
    language: 'clone',
  }))

  const localIds = new Set(local.map((voice) => voice.voiceId))
  const extra = remoteCloned.value
    .filter((voice) => !localIds.has(voice.voiceId))
    .map((voice) => ({
      voiceId: voice.voiceId,
      name: voice.name || voice.voiceId,
      description: '账号里的复刻音色（本机没有记录名称）',
      createdAt: voice.createdAt,
      language: 'clone',
    }))

  return [...local, ...extra]
})

const allVoices = computed<SystemVoice[]>(() => [
  ...mergedClonedVoices.value,
  ...designedVoices.value.map<SystemVoice>((voice) => ({
    voiceId: voice.voiceId,
    name: voice.name,
    description: voice.prompt || '我之前用音色设计生成的音色',
    createdAt: '',
    language: 'design',
  })),
  ...systemVoices.value,
])

const selectedVoice = computed<SystemVoice>(() => {
  return (
    allVoices.value.find((voice) => voice.voiceId === selectedVoiceId.value) || {
      voiceId: selectedVoiceId.value,
      name: selectedVoiceId.value,
      description: '',
      createdAt: '',
      language: 'zh',
    }
  )
})

const filteredClonedVoices = computed(() => {
  return mergedClonedVoices.value.filter((voice) => {
    const keyword = voiceQuery.value.trim().toLowerCase()
    if (!keyword) return true
    return voice.name.toLowerCase().includes(keyword) || voice.voiceId.toLowerCase().includes(keyword)
  })
})

const filteredDesignedVoices = computed(() => {
  return designedVoices.value.filter((voice) => {
    const keyword = voiceQuery.value.trim().toLowerCase()
    if (!keyword) return true
    return (
      voice.name.toLowerCase().includes(keyword) ||
      voice.voiceId.toLowerCase().includes(keyword) ||
      voice.prompt.toLowerCase().includes(keyword)
    )
  })
})

const groupedVoices = computed(() => {
  const filtered = systemVoices.value.filter(
    (voice) =>
      matchesVoiceQuery(voice, voiceQuery.value) &&
      matchesVoiceMeta(voice, sceneFilter.value, genderFilter.value),
  )
  return groupVoicesByLanguage(filtered, languageFilter.value)
})

const visibleVoiceCount = computed(
  () =>
    filteredClonedVoices.value.length +
    filteredDesignedVoices.value.length +
    groupedVoices.value.reduce((sum, group) => sum + group.voices.length, 0),
)

/** 搜索框回车时选中的第一个结果：优先自己造的音色，其次系统音色。 */
const firstVisibleVoiceId = computed(() => {
  return (
    filteredDesignedVoices.value[0]?.voiceId ||
    filteredClonedVoices.value[0]?.voiceId ||
    groupedVoices.value.find((group) => group.voices.length)?.voices[0]?.voiceId ||
    ''
  )
})

function resetVoiceFilters() {
  voiceQuery.value = ''
  languageFilter.value = 'zh'
  sceneFilter.value = 'all'
  genderFilter.value = 'all'
}

const languageOptions = computed(() => [{ key: 'all' as VoiceLanguageKey, label: '全部' }, ...VOICE_LANGUAGES])

async function loadCatalog(force = false) {
  if (catalogState.value === 'loading') return
  if (catalogState.value === 'ready' && !force) return

  catalogState.value = 'loading'
  try {
    const catalog = await fetchVoiceCatalog()
    systemVoices.value = catalog.system.length ? catalog.system : FALLBACK_SYSTEM_VOICES
    remoteCloned.value = catalog.cloned
    myVoices.value = syncClonedVoicesFromRemote(catalog.cloned)
    designedVoices.value = syncDesignedVoicesFromRemote(catalog.designed || [])
    catalogState.value = 'ready'

    // 上次选中的音色可能已过期（复刻音色 7 天未使用会被上游删除），回落到默认音色。
    if (!allVoices.value.some((voice) => voice.voiceId === selectedVoiceId.value)) {
      selectedVoiceId.value = DEFAULT_VOICE_ID
    }
  } catch (error) {
    systemVoices.value = FALLBACK_SYSTEM_VOICES
    catalogState.value = 'error'
    generateError.value = error instanceof Error ? error.message : '音色列表加载失败，已使用内置音色。'
  }
}

function selectVoice(voiceId: string) {
  selectedVoiceId.value = voiceId
  preview.value = null
  previewHint.value = ''
}

/* ---------------- 音色选择大面板 ---------------- */

watch(voiceModalOpen, (open) => {
  document.body.classList.toggle('voice-modal-open', open)
  if (open) {
    window.addEventListener('keydown', handleVoiceModalKeydown)
    void nextTick(() => voiceSearchRef.value?.focus())
  } else {
    window.removeEventListener('keydown', handleVoiceModalKeydown)
  }
})

function handleVoiceModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    // 有搜索词时先清空，第二次按 Esc 才关闭面板。
    if (voiceQuery.value) {
      clearVoiceQuery()
      return
    }
    closeVoicePicker()
    return
  }
  trapFocus(event, voiceModalRef.value)
}

function clearVoiceQuery() {
  voiceQuery.value = ''
  voiceSearchRef.value?.focus()
}

/** 搜索框回车：直接选中第一个匹配的音色，少点一次。 */
function pickFirstVisibleVoice() {
  const voiceId = firstVisibleVoiceId.value
  if (voiceId) selectVoice(voiceId)
}

function openVoicePicker() {
  voiceQuery.value = ''
  voiceModalOpen.value = true
  void loadCatalog()
}

function closeVoicePicker() {
  voiceModalOpen.value = false
  void nextTick(() => voiceChangeBtnRef.value?.focus())
}

/** 选择库里没有合适的？直接跳到音色设计自己造一个。 */
function openDesignFromPicker() {
  voiceModalOpen.value = false
  switchTab('design')
}

/* ---------------- 试听 ---------------- */

const previewing = ref(false)
const previewingVoiceId = ref('')
const voiceModalRef = ref<HTMLElement | null>(null)
const preview = ref<VoicePreview | null>(null)
const previewHint = ref('')

/**
 * 试听按字符计费，同一个音色在一次会话里反复听没必要重复花钱。
 * 这里按 voiceId 缓存已合成的试听，命中缓存直接回放。
 */
const previewCache = new Map<string, VoicePreview>()
const PREVIEW_CACHE_LIMIT = 16

function rememberPreview(voiceId: string, entry: VoicePreview) {
  previewCache.set(voiceId, entry)
  if (previewCache.size <= PREVIEW_CACHE_LIMIT) return

  for (const [key, value] of previewCache) {
    if (previewCache.size <= PREVIEW_CACHE_LIMIT) break
    if (key === voiceId || value.url === preview.value?.url) continue
    revokeUrl(value.url)
    previewCache.delete(key)
  }
}

/** 试听指定音色（不传则试听当前音色）；选择库卡片上的播放键也走这里。 */
async function previewVoice(voiceId?: string) {
  if (previewing.value) return

  const targetId = voiceId || selectedVoiceId.value
  const voice = allVoices.value.find((item) => item.voiceId === targetId) || selectedVoice.value

  if (voice.voiceId !== selectedVoiceId.value) selectVoice(voice.voiceId)
  previewHint.value = ''

  const cached = previewCache.get(voice.voiceId)
  if (cached) {
    preview.value = cached
    previewHint.value = '本次会话已缓存这条试听，回放不再计费。'
    return
  }

  previewing.value = true
  previewingVoiceId.value = voice.voiceId
  try {
    const result = await synthesizeSpeech({
      model: model.id,
      text: buildPreviewText(voice.name),
      voice: {
        voiceId: voice.voiceId,
        speed: 1,
        vol: 1,
        pitch: 0,
        emotion: '',
      },
      audio: { format: 'mp3', sampleRate: 32000, bitrate: 128000, channel: 1 },
      textNormalization: true,
    })

    const entry: VoicePreview = {
      url: result.url,
      durationMs: result.durationMs,
      format: result.format,
      createdAt: Date.now(),
      waveform: await computeWaveform(result.blob, 160),
      voiceId: voice.voiceId,
    }
    rememberPreview(voice.voiceId, entry)
    preview.value = entry
    previewHint.value = `试听按 ${result.usageCharacters} 个字符计费，本次会话内重复回放不再收费。`
  } catch (error) {
    previewHint.value = error instanceof Error ? error.message : '试听失败，请稍后重试。'
  } finally {
    previewing.value = false
    previewingVoiceId.value = ''
  }
}

function handlePreviewVoice() {
  void previewVoice()
}

/* ---------------- 音色设计（Voice Design） ---------------- */

const designPresetsAll = VOICE_DESIGN_PRESETS
const designSceneOptions = getDesignSceneOptions()
const designSceneFilter = ref<VoiceSceneKey | 'all'>('all')
const designPresets = computed(() =>
  designSceneFilter.value === 'all'
    ? designPresetsAll
    : designPresetsAll.filter((preset) => preset.scenes.includes(designSceneFilter.value as VoiceSceneKey)),
)

const designName = ref('')
const designPrompt = ref('')
const designPreviewText = ref(DEFAULT_DESIGN_PREVIEW_TEXT)
const designing = ref(false)
const designError = ref('')
const deletingDesignedId = ref('')
const designResultRef = ref<HTMLElement | null>(null)
const designResult = ref<{
  voiceId: string
  name: string
  url: string
  durationMs: number
  usageCharacters: number
} | null>(null)

const canDesign = computed(
  () => !designing.value && designPrompt.value.trim().length >= 6 && !!designPreviewText.value.trim(),
)

/** 上游按「描述 + 试听文本」的字符数计费，生成前先让用户看到大概花多少。 */
const designEstimate = computed(
  () => designPrompt.value.trim().length + designPreviewText.value.trim().length,
)

/** 名称重复时自动加序号，避免「我设计的音色」里出现两个同名条目。 */
function uniqueDesignedName(base: string): string {
  const names = new Set(designedVoices.value.map((item) => item.name))
  if (!names.has(base)) return base
  let index = 2
  while (names.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function applyDesignPreset(preset: VoiceDesignPreset) {
  designPrompt.value = preset.prompt
  designName.value = preset.name
  designPreviewText.value = preset.previewText
  designError.value = ''
}

async function handleDesignVoice() {
  if (!canDesign.value) return

  designing.value = true
  designError.value = ''
  try {
    const result = await designVoice({
      prompt: designPrompt.value.trim(),
      previewText: designPreviewText.value.trim(),
    })

    const name = uniqueDesignedName(designName.value.trim() || `设计音色 ${designedVoices.value.length + 1}`)
    revokeUrl(designResult.value?.url)
    designResult.value = {
      voiceId: result.voiceId,
      name,
      url: result.url,
      durationMs: result.durationMs,
      usageCharacters: result.usageCharacters,
    }

    // 试听音频转成 dataURL 存本地：临时音色 7 天后可能被清理，试听仍要能回放。
    const demoDataUrl = result.blob.size ? await remoteAudioToDataUrl(result.url) : undefined
    designedVoices.value = upsertDesignedVoice({
      voiceId: result.voiceId,
      name,
      prompt: designPrompt.value.trim(),
      createdAt: Date.now(),
      demoDataUrl,
      durationMs: result.durationMs,
      used: false,
    })

    await nextTick()
    designResultRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  } catch (error) {
    designError.value = error instanceof Error ? error.message : '音色设计失败，请稍后重试。'
  } finally {
    designing.value = false
  }
}

async function handleDeleteDesignedVoice(voice: StoredDesignedVoice) {
  const ok = await confirmDialog({
    title: '删除音色',
    message: `删除音色「${voice.name}」？删除后该音色将无法再用于合成。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  deletingDesignedId.value = voice.voiceId
  let remoteMessage = ''
  try {
    // 没用于合成过的设计音色在上游只是临时音色，删不到也没关系，7 天后会自动过期。
    if (voice.used) await deleteClonedVoice(voice.voiceId, 'voice_generation')
  } catch (error) {
    remoteMessage = error instanceof Error ? error.message : '服务端删除没有成功。'
  } finally {
    designedVoices.value = removeStoredDesignedVoice(voice.voiceId)
    if (selectedVoiceId.value === voice.voiceId) selectedVoiceId.value = DEFAULT_VOICE_ID
    if (designResult.value?.voiceId === voice.voiceId) {
      revokeUrl(designResult.value.url)
      designResult.value = null
    }
    deletingDesignedId.value = ''
  }

  if (remoteMessage) {
    await alertDialog({
      title: '已从本机列表移除',
      message: `${remoteMessage}\n未用于合成的远端音色会在 7 天后自动过期。`,
    })
  }
}

/* ---------------- 语音合成 ---------------- */

const generating = ref(false)
const generateError = ref('')
const result = ref<(SpeechResult & { waveform?: number[] }) | null>(null)
const resultWaveform = ref<number[]>([])
const resultVoiceName = ref('')
const resultText = ref('')
const history = ref<(VoiceHistoryItem & { blob: Blob })[]>([])

/** 生成记录每页 3 条，超出后翻页。 */
const HISTORY_PAGE_SIZE = 3
const historyPage = ref(1)
const historyPageCount = computed(() => Math.max(1, Math.ceil(history.value.length / HISTORY_PAGE_SIZE)))
const pagedHistory = computed(() => {
  const page = Math.min(Math.max(1, historyPage.value), historyPageCount.value)
  const start = (page - 1) * HISTORY_PAGE_SIZE
  return history.value.slice(start, start + HISTORY_PAGE_SIZE)
})

watch(historyPageCount, (count) => {
  if (historyPage.value > count) historyPage.value = count
})

/** 进入页面时从 IndexedDB 恢复音频库；已在内存里的新结果不会被覆盖。 */
async function loadHistoryFromLibrary() {
  const items = await loadVoiceLibrary()
  if (!items.length) return

  const existingIds = new Set(history.value.map((item) => item.id))
  const restored = items
    .filter((item) => !existingIds.has(item.id))
    .map((item) => ({
      ...item,
      audioUrl: URL.createObjectURL(item.blob),
    }))

  if (!restored.length) return

  const merged = [...history.value, ...restored].sort((a, b) => b.createdAt - a.createdAt)
  merged.slice(VOICE_LIBRARY_LIMIT).forEach((item) => revokeUrl(item.audioUrl))
  history.value = merged.slice(0, VOICE_LIBRARY_LIMIT)
  historyPage.value = 1
}

const generatingHint = computed(() =>
  charCount.value > model.capability.streamSuggestChars ? '长文本需要多等一会儿' : '通常几秒内完成',
)

const resultMeta = computed(() => {
  if (!result.value) return '等待生成'
  return `${formatDurationMs(result.value.durationMs)} · ${formatBytes(result.value.size)}`
})

const canGenerate = computed(() => !generating.value && charCount.value > 0 && !!selectedVoiceId.value)

function applyPreset(preset: (typeof TEXT_PRESETS)[number]) {
  text.value = preset.text
  scriptSelection.value = { start: preset.text.length, end: preset.text.length }

  // 文案和配套音色一起切换：点一下就能直接生成。
  voiceQuery.value = ''
  languageFilter.value = 'zh'
  selectVoice(preset.voiceId)

  void nextTick(() => {
    const el = scriptRef.value
    if (!el) return
    el.focus()
    el.setSelectionRange(preset.text.length, preset.text.length)
  })
}

function clearScript() {
  text.value = ''
  scriptSelection.value = { start: 0, end: 0 }
  translateStatus.value = ''
  translateError.value = ''
}

async function handleGenerate() {
  if (!canGenerate.value) {
    if (!charCount.value) generateError.value = '先写一点要配音的文字。'
    return
  }

  generating.value = true
  generateError.value = ''
  const voice = { ...selectedVoice.value }
  const sourceText = text.value.trim()

  try {
    const generated = await synthesizeSpeech({
      model: model.id,
      text: sourceText,
      voice: {
        voiceId: voice.voiceId,
        speed: speed.value,
        vol: vol.value,
        pitch: pitch.value,
        emotion: emotion.value,
      },
      audio: {
        format: audioFormat.value,
        sampleRate: sampleRate.value,
        bitrate: bitrate.value,
        channel: channel.value,
      },
      textNormalization: textNormalization.value,
    })

    revokeUrl(result.value?.url)
    result.value = generated
    resultWaveform.value = await computeWaveform(generated.blob, 160)
    resultVoiceName.value = voice.name
    resultText.value = sourceText

    await pushHistory(generated, voice.name, sourceText)

    // 设计音色只要真正用于合成一次，就会长期保留在账号里。
    if (designedVoices.value.some((item) => item.voiceId === voice.voiceId)) {
      designedVoices.value = markDesignedVoiceUsed(voice.voiceId)
    }

    await nextTick()
    resultPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  } catch (error) {
    generateError.value = error instanceof Error ? error.message : '语音合成失败，请稍后重试。'
  } finally {
    generating.value = false
  }
}

async function pushHistory(generated: SpeechResult, voiceName: string, sourceText: string): Promise<boolean> {
  const item: VoiceHistoryItem & { blob: Blob } = {
    id: `${generated.createdAt}-${Math.random().toString(36).slice(2, 6)}`,
    text: sourceText,
    voiceId: selectedVoiceId.value,
    voiceName,
    model: model.id,
    createdAt: generated.createdAt,
    durationMs: generated.durationMs,
    usageCharacters: generated.usageCharacters,
    audioUrl: URL.createObjectURL(generated.blob),
    format: generated.format,
    size: generated.size,
    speed: speed.value,
    pitch: pitch.value,
    vol: vol.value,
    emotion: emotion.value,
    blob: generated.blob,
  }

  const next = [item, ...history.value]
  next.slice(VOICE_LIBRARY_LIMIT).forEach((dropped) => revokeUrl(dropped.audioUrl))
  history.value = next.slice(0, VOICE_LIBRARY_LIMIT)

  // 写入共享音频库，供「图片视频生成」的多模态参考选择。
  const saved = await saveVoiceLibraryItem({
    id: item.id,
    text: item.text,
    voiceId: item.voiceId,
    voiceName: item.voiceName,
    model: item.model,
    createdAt: item.createdAt,
    durationMs: item.durationMs,
    usageCharacters: item.usageCharacters,
    format: item.format,
    size: item.size,
    blob: item.blob,
  })

  // 新生成的内容在第 1 页最前面。
  historyPage.value = 1
  return saved
}

async function clearHistory() {
  if (!history.value.length) return
  const ok = await confirmDialog({
    title: '清空音频库',
    message: '清空配音音频库？清空后，视频多模态参考里也不能再选择这些音频。',
    confirmText: '清空',
    danger: true,
  })
  if (!ok) return

  history.value.forEach((item) => revokeUrl(item.audioUrl))
  history.value = []
  historyPage.value = 1
  void clearVoiceLibrary()
}

function downloadBlob(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `artrealm-voice-${Date.now()}.${extension}`
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function downloadResult() {
  if (!result.value) return
  downloadBlob(result.value.blob, result.value.format)
}

function downloadHistory(item: VoiceHistoryItem & { blob: Blob }) {
  downloadBlob(item.blob, item.format)
}

/** 配音是 blob 地址，转成 data URL 才能跨刷新保存在项目里。 */
function addAudioToProject(blob: Blob, text: string, durationMs: number) {
  const reader = new FileReader()
  reader.onload = () => {
    const url = typeof reader.result === 'string' ? reader.result : ''
    if (!url) return
    assetInbox.open({
      name: text.replace(/\s+/g, ' ').trim().slice(0, 24) || '生成配音',
      kind: 'audio',
      url,
      duration: durationMs / 1000,
      source: 'library',
    })
  }
  reader.readAsDataURL(blob)
}

function addResultToProject() {
  if (!result.value) return
  addAudioToProject(result.value.blob, resultText.value, result.value.durationMs)
}

function addHistoryToProject(item: VoiceHistoryItem & { blob: Blob }) {
  addAudioToProject(item.blob, item.text, item.durationMs)
}

/** 单条删除：只从本地音频库移除，不影响账号与音色。 */
async function removeHistory(item: VoiceHistoryItem & { blob: Blob }) {
  revokeUrl(item.audioUrl)
  history.value = history.value.filter((entry) => entry.id !== item.id)
  if (historyPage.value > historyPageCount.value) historyPage.value = Math.max(1, historyPageCount.value)
  await deleteVoiceLibraryItems([item.id])
}

/** 历史记录的演绎参数提示；全默认时不显示，避免每条都挂一串 1.0×。 */
function historyParamHint(item: VoiceHistoryItem): string {
  const parts: string[] = []
  if (typeof item.speed === 'number' && Math.abs(item.speed - speedRange.defaultValue) > 0.001) {
    parts.push(`${item.speed.toFixed(2)}×`)
  }
  if (typeof item.pitch === 'number' && item.pitch !== pitchRange.defaultValue) {
    parts.push(`语调 ${item.pitch > 0 ? '+' : ''}${item.pitch}`)
  }
  if (typeof item.vol === 'number' && Math.abs(item.vol - volRange.defaultValue) > 0.001) {
    parts.push(`音量 ${item.vol.toFixed(1)}`)
  }
  if (item.emotion) {
    const emotionLabel = VOICE_EMOTIONS.find((entry) => entry.value === item.emotion)?.label
    parts.push(emotionLabel ?? item.emotion)
  }
  return parts.join(' · ')
}

/** 复用一条生成记录：文案、音色、演绎参数一起恢复，方便反复调整。 */
function reuseHistory(item: VoiceHistoryItem & { blob: Blob }) {
  text.value = item.text
  scriptSelection.value = { start: item.text.length, end: item.text.length }
  selectedVoiceId.value = item.voiceId
  preview.value = null
  previewHint.value = ''

  if (typeof item.speed === 'number') speed.value = clampVoiceParam('speed', item.speed)
  if (typeof item.pitch === 'number') pitch.value = clampVoiceParam('pitch', item.pitch)
  if (typeof item.vol === 'number') vol.value = clampVoiceParam('vol', item.vol)
  if (item.emotion !== undefined) emotion.value = item.emotion

  switchTab('speech')
  void nextTick(() => {
    scriptRef.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    scriptRef.value?.focus()
    scriptRef.value?.setSelectionRange(item.text.length, item.text.length)
  })
}

/* ---------------- 参数 ---------------- */

function percentOf(value: number, range: { min: number; max: number }): string {
  const ratio = (value - range.min) / (range.max - range.min)
  return `${Math.min(100, Math.max(0, ratio * 100))}%`
}

function resetParams() {
  speed.value = speedRange.defaultValue
  pitch.value = pitchRange.defaultValue
  vol.value = volRange.defaultValue
  emotion.value = ''
  audioFormat.value = DEFAULT_AUDIO_SETTING.format
  sampleRate.value = DEFAULT_AUDIO_SETTING.sampleRate
  bitrate.value = DEFAULT_AUDIO_SETTING.bitrate
  channel.value = 1
  textNormalization.value = true
}

watch([speed, pitch, vol, emotion, audioFormat, sampleRate, bitrate, channel, textNormalization, selectedVoiceId, languageFilter], () => {
  saveVoiceSettings({
    voiceId: selectedVoiceId.value,
    speed: speed.value,
    vol: vol.value,
    pitch: pitch.value,
    emotion: emotion.value,
    format: audioFormat.value,
    sampleRate: sampleRate.value,
    bitrate: bitrate.value,
    channel: channel.value,
    textNormalization: textNormalization.value,
    languageFilter: languageFilter.value,
  })
})

/* ---------------- 声音克隆 ---------------- */

const recorder = useVoiceRecorder()
const sampleInputRef = ref<HTMLInputElement | null>(null)
const sample = ref<CloneSample | null>(null)
const sampleProcessing = ref(false)
const sampleError = ref('')
const dragOver = ref(false)

const cloneName = ref('')
const cloneDemoText = ref(CLONE_DEMO_TEXT)
const noiseReduction = ref(true)
const volumeNormalization = ref(true)
const cloneStage = ref<CloneStage>('idle')
const cloneError = ref('')
const cloneResult = ref<CloneResult | null>(null)
const deletingVoiceId = ref('')

const cloneBusy = computed(() => cloneStage.value === 'uploading' || cloneStage.value === 'cloning')
const canClone = computed(() => !!sample.value && !cloneBusy.value)

function openFilePicker() {
  sampleInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (!isCloneSampleFile(file)) {
    sampleError.value = '只支持 mp3 / m4a / wav 三种格式。'
    return
  }
  await acceptSample(file, file.name, 'upload')
}

async function handleDrop(event: DragEvent) {
  dragOver.value = false
  const file = event.dataTransfer?.files?.[0]
  if (!file) return
  if (!isCloneSampleFile(file)) {
    sampleError.value = '只支持 mp3 / m4a / wav 三种格式。'
    return
  }
  await acceptSample(file, file.name, 'upload')
}

async function acceptSample(blob: Blob, name: string, source: 'upload' | 'record') {
  sampleError.value = ''
  if (blob.size > CLONE_SAMPLE_MAX_BYTES) {
    sampleError.value = `音频 ${formatBytes(blob.size)}，超过 20MB 上限，请压缩后再试。`
    return
  }

  sampleProcessing.value = true
  try {
    const durationMs = await getAudioDurationMs(blob)
    const durationSec = durationMs / 1000

    if (durationSec && durationSec < CLONE_SAMPLE_MIN_SECONDS) {
      sampleError.value = `这段音频只有 ${durationSec.toFixed(1)} 秒，至少需要 ${CLONE_SAMPLE_MIN_SECONDS} 秒。`
      return
    }
    if (durationSec && durationSec > CLONE_SAMPLE_MAX_SECONDS) {
      sampleError.value = `这段音频有 ${Math.round(durationSec / 60)} 分钟，最长支持 5 分钟。`
      return
    }

    revokeUrl(sample.value?.previewUrl)
    sample.value = {
      blob,
      name: name || 'sample',
      durationSec,
      size: blob.size,
      source,
      previewUrl: URL.createObjectURL(blob),
    }
    cloneResult.value = null
    cloneStage.value = 'idle'
  } finally {
    sampleProcessing.value = false
  }
}

function clearSample() {
  revokeUrl(sample.value?.previewUrl)
  sample.value = null
  cloneResult.value = null
  cloneStage.value = 'idle'
  sampleError.value = ''
}

async function toggleRecord() {
  if (recorder.isRequesting.value) return

  if (recorder.isRecording.value) {
    const take = await recorder.stop()
    if (!take) return

    if (take.durationMs / 1000 < CLONE_SAMPLE_MIN_SECONDS) {
      sampleError.value = `录音只有 ${(take.durationMs / 1000).toFixed(1)} 秒，请录满 ${CLONE_SAMPLE_MIN_SECONDS} 秒以上。`
      return
    }

    await acceptSample(take.blob, `录音-${Date.now()}`, 'record')
    return
  }

  sampleError.value = ''
  await recorder.start()
}

async function handleClone() {
  if (!sample.value || cloneBusy.value) return

  cloneError.value = ''
  cloneResult.value = null
  cloneStage.value = 'uploading'

  try {
    const fileName = normalizeCloneFileName(sample.value.name, sample.value.source)
    const fileId = await uploadCloneAudio(sample.value.blob, fileName)

    cloneStage.value = 'cloning'
    const demoText = cloneDemoText.value.trim()
    const cloned = await cloneVoice({
      fileId,
      demoText: demoText || undefined,
      demoModel: demoText ? getCloneDemoModel(model.id) : undefined,
      needNoiseReduction: noiseReduction.value,
      needVolumeNormalization: volumeNormalization.value,
    })

    let demoDataUrl: string | undefined
    if (cloned.demoUrl) demoDataUrl = await remoteAudioToDataUrl(cloned.demoUrl, 200 * 1024)

    const name = cloneName.value.trim() || `我的音色 ${myVoices.value.length + 1}`
    myVoices.value = upsertClonedVoice({
      voiceId: cloned.voiceId,
      name,
      createdAt: Date.now(),
      demoDataUrl,
      demoUrl: cloned.demoUrl,
      durationMs: cloned.durationMs,
    })

    cloneResult.value = { ...cloned, demoDataUrl }
    cloneStage.value = 'done'
    cloneName.value = ''
    selectedVoiceId.value = cloned.voiceId
  } catch (error) {
    cloneError.value = error instanceof Error ? error.message : '音色复刻失败，请稍后重试。'
    cloneStage.value = 'idle'
  }
}

function stepClass(step: CloneStage) {
  if (cloneStage.value === 'done') return { 'is-done': step !== 'idle', 'is-active': false }

  const order: CloneStage[] = ['idle', 'uploading', 'cloning', 'done']
  const current = order.indexOf(cloneStage.value)
  const target = order.indexOf(step)
  return {
    'is-done': current > target && target > 0,
    'is-active': current === target,
  }
}

function useVoiceForSpeech(voiceId: string) {
  selectedVoiceId.value = voiceId
  preview.value = null
  switchTab('speech')
  void nextTick(() => scriptRef.value?.focus())
}

async function handleDeleteVoice(voice: StoredClonedVoice) {
  const ok = await confirmDialog({
    title: '删除音色',
    message: `删除音色「${voice.name}」？删除后该音色将无法再用于合成。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return

  deletingVoiceId.value = voice.voiceId
  let remoteMessage = ''
  try {
    await deleteClonedVoice(voice.voiceId)
  } catch (error) {
    remoteMessage = error instanceof Error ? error.message : '服务端删除没有成功。'
  } finally {
    myVoices.value = removeStoredClonedVoice(voice.voiceId)
    remoteCloned.value = remoteCloned.value.filter((item) => item.voiceId !== voice.voiceId)
    if (selectedVoiceId.value === voice.voiceId) selectedVoiceId.value = DEFAULT_VOICE_ID
    deletingVoiceId.value = ''
  }

  if (remoteMessage) {
    await alertDialog({
      title: '已从本机列表移除',
      message: `${remoteMessage}\n未保存的远端音色会在 7 天后自动过期。`,
    })
  }
}

/* ---------------- 待确认：试听数据 ---------------- */

function switchTab(tab: 'speech' | 'design' | 'clone') {
  // 切到配音页时停掉正在进行的录音，避免麦克风在后台一直占用。
  if (tab === 'speech' && recorder.isRecording.value) recorder.cancel()
  activeTab.value = tab
}

/* ---------------- 工具 ---------------- */

function revokeUrl(url?: string) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

/* ---------------- 生命周期 ---------------- */

onMounted(() => {
  settingsStore.loadFromStorage()
  void loadCatalog()
  void loadHistoryFromLibrary()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleVoiceModalKeydown)
  window.removeEventListener('keydown', handleTranslateKeydown)
  document.body.classList.remove('voice-modal-open')
  revokeUrl(result.value?.url)
  revokeUrl(preview.value?.url)
  previewCache.forEach((entry) => revokeUrl(entry.url))
  previewCache.clear()
  revokeUrl(designResult.value?.url)
  history.value.forEach((item) => revokeUrl(item.audioUrl))
  revokeUrl(sample.value?.previewUrl)
  recorder.cancel()
})
</script>

<style scoped>
/* ========================= 页面骨架 ========================= */

.voice-page {
  color: var(--sf-ink);
}

.voice-main {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 10px;
  width: min(100% - 40px, 1440px);
  min-height: 0;
  margin: 0 auto;
  padding: 8px 0 14px;
  overflow: hidden;
}

/* 两栏区占满剩余高度，各自在栏内滚动 */
.voice-main > .speech-layout,
.voice-main > .clone-layout,
.voice-main > .design-layout {
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

/* ========================= 分区切换 ========================= */

.voice-tabs {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--studio-panel-border);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.035);
  backdrop-filter: blur(20px);
  align-self: flex-start;
}

.voice-tab {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 0 18px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 13px;
  font-weight: 650;
  cursor: pointer;
  transition: background var(--transition-base), color var(--transition-base);
}

.voice-tab svg {
  width: 15px;
  height: 15px;
}

.voice-tab:hover {
  color: var(--sf-ink);
}

.voice-tab.active {
  background: var(--sf-ink);
  color: var(--sf-surface);
  box-shadow: 0 10px 28px rgba(36, 31, 25, 0.22);
}

.tab-badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.16);
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
  white-space: nowrap;
}

.voice-tab.active .tab-badge {
  background: rgba(255, 255, 255, 0.18);
}

.tabs-meta {
  margin-left: auto;
  padding-right: 12px;
  color: var(--studio-text-hint);
  font-size: 12px;
  white-space: nowrap;
}

.tabs-meta-warn {
  color: var(--sf-ink-3);
}

/* ========================= 通用块 ========================= */

.speech-layout,
.clone-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 14px;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}

/* 左栏：脚本为主，结果和历史按内容占小比例，整体不再翻页 */
.speech-col {
  display: grid;
  min-width: 0;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr) auto;
  gap: 12px;
  overflow: hidden;
}

.speech-col > .script-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.speech-col > .result-panel {
  /* 结果面板只占一小块，脚本编辑占主空间；需要查看时内部滚动 */
  max-height: 150px;
  overflow-y: auto;
}

.speech-col > .history-panel {
  max-height: 170px;
  overflow-y: auto;
}

.speech-col > .history-panel:only-of-type {
  max-height: 160px;
}

/* 脚本内部：文本区占满剩余高度，快捷插入在下方，不用长滚动 */
.speech-col .script-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
}

.speech-col .script-input {
  min-height: 0;
  flex: 1 1 auto;
  padding: 14px 16px;
  font-size: 15px;
  line-height: 1.8;
  resize: none;
}

/* 用头部色带强化每个分区的起点，避免几块面板糊成一片 */
.script-panel .studio-panel-head,
.result-panel .studio-panel-head,
.history-panel .studio-panel-head,
.control-panel .studio-panel-head {
  background: linear-gradient(90deg, rgba(36, 31, 25, 0.075), rgba(36, 31, 25, 0) 62%);
}

.script-panel,
.result-panel,
.history-panel,
.control-panel {
  border-color: rgba(36, 31, 25, 0.08);
}

.ghost-btn,
.link-btn,
.mini-btn {
  border: 0;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: color var(--transition-base), background var(--transition-base), border-color var(--transition-base);
}

.ghost-btn {
  padding: 6px 10px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 999px;
}

.ghost-btn:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.2);
  color: var(--sf-ink);
}

.link-btn:hover:not(:disabled) {
  color: var(--sf-ink);
}

.mini-btn {
  padding: 6px 12px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.76);
  white-space: nowrap;
}

.mini-btn:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.22);
  background: rgba(36, 31, 25, 0.09);
  color: var(--sf-ink);
}

.mini-btn:disabled,
.ghost-btn:disabled,
.link-btn:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.mini-btn.danger:hover:not(:disabled) {
  border-color: var(--sf-danger-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.inline-error {
  margin-top: 10px;
  color: var(--sf-terra-strong);
  font-size: 12.5px;
  line-height: 1.6;
}

.field-hint {
  margin-top: 8px;
  color: var(--studio-text-hint);
  font-size: 11.5px;
  line-height: 1.6;
}

/* ========================= 脚本 ========================= */

.script-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 18px 18px;
}

.script-input {
  min-height: clamp(180px, 26vh, 280px);
  padding: 16px 18px;
  font-size: 15px;
  line-height: 1.9;
  letter-spacing: 0.01em;
}

.script-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.script-tips {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  color: var(--studio-text-hint);
  font-size: 11.5px;
}

.script-tips code {
  padding: 2px 6px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 7px;
  background: rgba(36, 31, 25, 0.05);
  color: var(--sf-ink);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}

.script-tips kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  margin-right: 2px;
  padding: 0 4px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 5px;
  background: rgba(36, 31, 25, 0.05);
  color: var(--studio-text-soft);
  font-family: inherit;
  font-size: 10.5px;
}

.tag-panel {
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.075);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.022);
}

.tag-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 13px;
}

.tag-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(36, 31, 25, 0.74);
  font-size: 12px;
  font-weight: 650;
}

.tag-panel-title em {
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-style: normal;
  font-weight: 500;
}

.tag-panel-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--sf-ink);
  box-shadow: 0 0 0 3px rgba(36, 31, 25, 0.16);
}

.tag-panel-hint {
  flex: 0 0 auto;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-weight: 500;
}

.tag-panel-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 11px 13px 13px;
  border-top: 1px solid rgba(36, 31, 25, 0.055);
}

.tag-group {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tag-group-label {
  flex: 0 0 40px;
  padding-top: 4px;
  color: rgba(36, 31, 25, 0.34);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.tag-chips {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 0;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 8px;
  background: rgba(36, 31, 25, 0.035);
  color: rgba(36, 31, 25, 0.72);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base), color var(--transition-base);
}

.tag-chip:hover {
  border-color: rgba(36, 31, 25, 0.45);
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-surface);
}

.tag-chip em {
  color: rgba(36, 31, 25, 0.28);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-style: normal;
  font-weight: 500;
}

.tag-chip--pause {
  border-color: rgba(36, 31, 25, 0.22);
  color: var(--sf-ink);
  font-variant-numeric: tabular-nums;
}

.tag-custom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding-left: 3px;
}

.tag-custom input {
  width: 58px;
  padding: 4px 6px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 8px;
  background: rgba(36, 31, 25, 0.04);
  color: var(--sf-ink);
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  outline: none;
}

.tag-custom input:focus {
  border-color: rgba(36, 31, 25, 0.5);
}

.script-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.translate-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

/* 有文案时给一个轻量的可翻译提示，不抢「生成配音」的主操作层级 */
.translate-btn:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.34);
  background: rgba(36, 31, 25, 0.09);
  color: var(--sf-ink);
}

.translate-btn:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.54);
  background: rgba(36, 31, 25, 0.15);
  color: var(--sf-ink);
}

.translate-btn:not(:disabled) svg {
  color: var(--sf-ink-2);
}

.translate-btn svg {
  width: 13px;
  height: 13px;
}

.script-translate-status {
  color: var(--sf-success);
  font-size: 11.5px;
}

.script-translate-error {
  margin-top: 8px;
}

.script-warn {
  color: var(--sf-ink-2);
  font-size: 11.5px;
}

.preset-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 11px 13px;
  border: 1px solid rgba(36, 31, 25, 0.075);
  border-radius: 13px;
  background: rgba(36, 31, 25, 0.028);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-base), border-color var(--transition-base), transform var(--transition-base);
}

.preset-card:hover {
  border-color: rgba(36, 31, 25, 0.4);
  background: rgba(36, 31, 25, 0.08);
  transform: translateY(-1px);
}

.preset-card strong {
  color: rgba(36, 31, 25, 0.84);
  font-size: 12.5px;
  font-weight: 650;
}

.preset-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}

.preset-voice {
  flex: 0 0 auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
  font-size: 9.5px;
  font-style: normal;
  font-weight: 650;
  white-space: nowrap;
}

.preset-card span {
  color: var(--studio-text-hint);
  font-size: 11px;
}

/* ========================= 结果 ========================= */

.result-body {
  padding: 16px 18px 18px;
}

.result-loading {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px;
  border: 1px dashed rgba(36, 31, 25, 0.32);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.05);
}

.result-loading strong {
  display: block;
  font-size: 13.5px;
  font-weight: 650;
}

.result-loading p {
  margin-top: 4px;
  color: var(--studio-text-hint);
  font-size: 11.5px;
}

.loading-ring {
  width: 26px;
  height: 26px;
  border: 2px solid rgba(36, 31, 25, 0.24);
  border-top-color: var(--sf-ink);
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.result-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.meta-pill {
  padding: 4px 10px;
  border: 1px solid rgba(36, 31, 25, 0.085);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.035);
  color: var(--studio-text-soft);
  font-size: 11px;
  font-weight: 600;
}

.result-text {
  margin-top: 12px;
  padding: 12px 14px;
  border-left: 2px solid rgba(36, 31, 25, 0.5);
  border-radius: 0 12px 12px 0;
  background: rgba(36, 31, 25, 0.022);
  color: var(--sf-ink-2);
  font-size: 12.5px;
  line-height: 1.75;
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  white-space: pre-line;
}

.result-empty {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 18px;
  border: 1px dashed rgba(36, 31, 25, 0.09);
  border-radius: 14px;
  color: var(--studio-text-hint);
  font-size: 12px;
  text-align: left;
}

.empty-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--sf-line);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.08);
  color: var(--sf-ink-3);
}

.empty-icon svg {
  width: 15px;
  height: 15px;
}

/* ========================= 记录 ========================= */

.history-list {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  margin: 0;
  padding: 14px 16px 16px;
  list-style: none;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  padding: 12px 14px;
  border: 1px solid rgba(36, 31, 25, 0.06);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.025);
}

.history-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.history-voice {
  color: rgba(36, 31, 25, 0.78);
  font-size: 12px;
  font-weight: 650;
}

.history-time {
  color: var(--studio-text-hint);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.history-tags {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.history-param {
  padding: 1px 7px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.03);
  color: var(--sf-ink-2);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.history-text {
  max-width: 100%;
  min-width: 0;
  color: var(--sf-ink-3);
  font-size: 12px;
  line-height: 1.6;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.history-head-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.history-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 16px 16px;
}

.pager-btn {
  padding: 6px 12px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.7);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base), color var(--transition-base);
}

.pager-btn:hover:not(:disabled) {
  border-color: rgba(36, 31, 25, 0.42);
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-surface);
}

.pager-btn:disabled {
  opacity: 0.32;
  cursor: not-allowed;
}

.pager-pages {
  display: flex;
  align-items: center;
  gap: 5px;
}

.pager-dot {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: all var(--transition-base);
}

.pager-dot:hover {
  color: var(--sf-ink);
}

.pager-dot.active {
  border-color: rgba(36, 31, 25, 0.45);
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-surface);
}

/* ========================= 参数面板 ========================= */

.control-panel {
  position: relative;
  top: auto;
  /* 跟随两栏区高度，栏内自己滚动 */
  height: 100%;
  max-height: none;
  min-height: 0;
  overflow: hidden;
}

.control-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 14px 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.34) transparent;
}

.control-body::-webkit-scrollbar {
  width: 6px;
}

.control-body::-webkit-scrollbar-track {
  background: transparent;
}

.control-body::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.34);
}

.control-body > * {
  flex: 0 0 auto;
}

.control-head,
.control-footer {
  flex: 0 0 auto;
}

/* ---------- 右侧分区卡（01 声音 / 02 演绎 / 03 输出） ---------- */

.side-card {
  border: 1px solid rgba(36, 31, 25, 0.075);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.022);
}

.side-card--collapsible {
  overflow: hidden;
}

.side-card-summary {
  padding-bottom: 12px;
  list-style: none;
  cursor: pointer;
  user-select: none;
  transition: background var(--transition-base);
}

.side-card-summary::-webkit-details-marker {
  display: none;
}

.side-card-summary:hover {
  background: rgba(36, 31, 25, 0.025);
}

.side-card--collapsible[open] .side-card-summary {
  padding-bottom: 4px;
}

.side-card--collapsible[open] .side-card-summary .toggle-chevron {
  transform: rotate(180deg);
}

.side-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px 4px;
}

.side-index {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid rgba(36, 31, 25, 0.32);
  border-radius: 7px;
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
  font-size: 10px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.side-card-titles {
  min-width: 0;
  flex: 1;
}

.side-card-titles h3 {
  color: rgba(36, 31, 25, 0.86);
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.side-card-titles p {
  margin-top: 1px;
  color: var(--studio-text-hint);
  font-size: 10.5px;
}

.side-card-meta {
  flex: 0 0 auto;
  color: var(--sf-ink-2);
  font-size: 10px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}

.side-card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 14px 14px;
}

.side-card-body--params {
  gap: 0;
  padding-top: 10px;
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.field-label {
  color: rgba(36, 31, 25, 0.72);
  font-size: 12px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.field-note {
  color: var(--studio-text-hint);
  font-size: 10.5px;
}

.param-value {
  color: var(--sf-ink);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.voice-current {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 13px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.04);
}

.voice-current-main {
  min-width: 0;
}

.voice-current-label {
  display: block;
  margin-bottom: 3px;
  color: rgba(36, 31, 25, 0.36);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.voice-current-main strong {
  display: block;
  color: var(--sf-ink);
  font-size: 13px;
  font-weight: 650;
}

.voice-current-main p {
  margin-top: 3px;
  color: var(--studio-text-hint);
  font-size: 11px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.voice-search {
  padding: 9px 13px;
  border-radius: 12px;
  font-size: 12px;
}

.voice-change-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid rgba(36, 31, 25, 0.26);
  border-radius: 11px;
  background: rgba(36, 31, 25, 0.07);
  color: var(--sf-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 650;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base), color var(--transition-base);
}

.voice-change-btn:hover {
  border-color: rgba(36, 31, 25, 0.48);
  background: rgba(36, 31, 25, 0.12);
  color: var(--sf-ink);
}

.voice-change-icon {
  flex: 0 0 auto;
  width: 16px;
  height: 16px;
  opacity: 0.85;
}

.voice-change-btn em {
  margin-left: auto;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-style: normal;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.voice-change-arrow {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--studio-text-hint);
}

.toggle-chevron {
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  color: var(--studio-text-hint);
  transition: transform var(--transition-base);
}

.toggle-chevron.open {
  transform: rotate(180deg);
}

.field-hint--flush {
  margin-top: 0;
}

.lang-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.lang-tab {
  padding: 4px 8px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-base);
}

.lang-tab:hover {
  color: var(--sf-ink);
}

.lang-tab.active {
  border-color: rgba(36, 31, 25, 0.45);
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-surface);
}

.voice-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 176px;
  padding-right: 4px;
  overflow-y: auto;
  mask-image: linear-gradient(180deg, var(--sf-ink) calc(100% - 18px), transparent 100%);
}

.voice-group-label {
  padding: 7px 2px 3px;
  color: rgba(36, 31, 25, 0.32);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.voice-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 11px;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background var(--transition-base), border-color var(--transition-base);
}

.voice-item:hover {
  background: rgba(36, 31, 25, 0.045);
}

.voice-item.active {
  border-color: rgba(36, 31, 25, 0.4);
  background: rgba(36, 31, 25, 0.1);
}

.voice-item-name {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(36, 31, 25, 0.8);
  font-size: 12.5px;
  font-weight: 600;
}

.voice-item.active .voice-item-name {
  color: var(--sf-ink);
}

.voice-item-desc {
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.5;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.voice-lang-tag {
  flex: 0 0 auto;
  padding: 1px 6px;
  border: 1px solid rgba(36, 31, 25, 0.075);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.045);
  color: rgba(36, 31, 25, 0.42);
  font-size: 9.5px;
  font-style: normal;
  font-weight: 600;
  line-height: 1.55;
  white-space: nowrap;
}

.voice-option.active .voice-lang-tag {
  border-color: rgba(36, 31, 25, 0.28);
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-ink);
}

.voice-lang-tag.is-clone {
  border-color: rgba(36, 31, 25, 0.2);
  background: rgba(36, 31, 25, 0.13);
  color: var(--sf-ink-2);
}

.voice-empty {
  padding: 18px 6px;
  color: var(--studio-text-hint);
  font-size: 12px;
  line-height: 1.7;
  text-align: center;
}

.voice-empty p {
  margin: 0;
}

.voice-empty-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}

.voice-empty-actions .link-btn {
  padding: 5px 12px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.04);
  color: rgba(36, 31, 25, 0.72);
}

.voice-empty-actions .link-btn:hover {
  border-color: rgba(36, 31, 25, 0.42);
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-ink);
}

/* ========================= 音色选择大面板 ========================= */

:global(body.voice-modal-open) {
  overflow: hidden;
}

.voice-modal-layer {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(36, 31, 25, 0.28);
  backdrop-filter: blur(14px);
  animation: voice-modal-fade 0.18s ease both;
}

.voice-modal {
  display: flex;
  flex-direction: column;
  width: min(900px, 100%);
  height: min(760px, calc(100dvh - 48px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 22px;
  outline: none;
  background: var(--sf-surface);
  box-shadow:
    0 24px 80px rgba(36, 31, 25, 0.16),
    inset 0 1px 0 rgba(36, 31, 25, 0.04);
  animation: voice-modal-rise 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.voice-modal-head {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.07);
}

.voice-modal-headings {
  min-width: 0;
}

.voice-modal-headings h2 {
  margin-top: 4px;
  font-family: var(--font-family-display);
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--sf-ink);
}

.voice-modal-headings p {
  margin-top: 5px;
  color: var(--studio-text-hint);
  font-size: 11.5px;
  line-height: 1.6;
}

.voice-modal-head-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
}

.voice-modal-count {
  color: var(--sf-ink-2);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.voice-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 50%;
  background: rgba(36, 31, 25, 0.04);
  color: var(--studio-text-soft);
  cursor: pointer;
  transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
}

.voice-modal-close:hover {
  border-color: rgba(36, 31, 25, 0.4);
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-surface);
}

.voice-modal-close svg {
  width: 15px;
  height: 15px;
}

/* ---------- 翻译语言选择 ---------- */

.translate-layer {
  z-index: 130;
}

.translate-dialog {
  display: flex;
  flex-direction: column;
  width: min(680px, 100%);
  max-height: min(760px, calc(100dvh - 48px));
  overflow: hidden;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 22px;
  outline: none;
  background: var(--sf-surface);
  box-shadow:
    0 24px 80px rgba(36, 31, 25, 0.16),
    inset 0 1px 0 rgba(36, 31, 25, 0.04);
  animation: voice-modal-rise 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.translate-head {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  padding: 20px 22px 16px;
  border-bottom: 1px solid rgba(36, 31, 25, 0.07);
}

.translate-headings {
  min-width: 0;
}

.translate-headings h2 {
  margin-top: 4px;
  font-family: var(--font-family-display);
  font-size: 19px;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--sf-ink);
}

.translate-headings p {
  margin-top: 5px;
  color: var(--studio-text-hint);
  font-size: 11.5px;
  line-height: 1.6;
}

.translate-body {
  overflow-y: auto;
  padding: 18px 22px 20px;
}

.translate-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.translate-option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 11px 13px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 13px;
  background: rgba(36, 31, 25, 0.025);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--transition-base),
    background var(--transition-base),
    transform var(--transition-base);
}

.translate-option:hover {
  border-color: rgba(36, 31, 25, 0.36);
  background: rgba(36, 31, 25, 0.075);
  transform: translateY(-1px);
}

.translate-option:focus-visible {
  outline: 2px solid rgba(36, 31, 25, 0.55);
  outline-offset: 2px;
}

.translate-option strong {
  overflow: hidden;
  color: rgba(36, 31, 25, 0.86);
  font-size: 12.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.translate-option span {
  overflow: hidden;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.translate-model {
  margin-top: 14px;
  color: rgba(36, 31, 25, 0.38);
  font-size: 10.5px;
  line-height: 1.6;
}

.voice-modal-toolbar {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  padding: 14px 22px 0;
}

.voice-modal-search {
  position: relative;
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
}

.voice-modal-search svg {
  position: absolute;
  left: 13px;
  width: 16px;
  height: 16px;
  color: var(--studio-text-hint);
  pointer-events: none;
}

.voice-modal-search input {
  width: 100%;
  padding: 11px 62px 11px 38px;
  border: 1px solid var(--studio-field-border);
  border-radius: 12px;
  outline: none;
  background: var(--studio-field-bg);
  color: var(--sf-ink);
  font: inherit;
  font-size: 12.5px;
  transition: border-color var(--transition-base), background var(--transition-base);
}

.voice-modal-search input:focus {
  border-color: rgba(36, 31, 25, 0.45);
  background: rgba(36, 31, 25, 0.05);
}

.voice-modal-search input::-webkit-search-cancel-button {
  appearance: none;
}

.voice-search-clear {
  position: absolute;
  right: 10px;
  padding: 4px;
  border: 0;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 10.5px;
  cursor: pointer;
}

.voice-search-clear:hover {
  color: var(--sf-ink);
}

.voice-refresh {
  flex: 0 0 auto;
  padding: 8px 12px;
  border: 1px solid rgba(36, 31, 25, 0.1);
  border-radius: 10px;
  white-space: nowrap;
}

.voice-modal-filters {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 22px;
}

.voice-modal-result {
  flex: 0 0 auto;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.voice-modal-list {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 22px 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(36, 31, 25, 0.34) transparent;
}

.voice-modal-list::-webkit-scrollbar {
  width: 6px;
}

.voice-modal-list::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.34);
}

.voice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-bottom: 14px;
}

.voice-option {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 12px;
  background: rgba(36, 31, 25, 0.025);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base);
}

.voice-option:hover {
  border-color: rgba(36, 31, 25, 0.32);
  background: rgba(36, 31, 25, 0.06);
}

.voice-option:focus-visible {
  outline: 2px solid rgba(36, 31, 25, 0.62);
  outline-offset: 2px;
}

.voice-option.active {
  border-color: rgba(36, 31, 25, 0.5);
  background: rgba(36, 31, 25, 0.12);
  box-shadow: inset 0 0 0 1px rgba(36, 31, 25, 0.12);
}

.voice-option-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.voice-option-top strong {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: rgba(36, 31, 25, 0.86);
  font-size: 12.5px;
  font-weight: 650;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.voice-option-meta {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.voice-option.active .voice-option-top strong {
  color: var(--sf-ink);
}

.voice-option-check {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  margin-left: 0;
  color: var(--sf-success);
}

.voice-option-desc {
  overflow: hidden;
  padding-right: 24px;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 卡片右下角的快捷试听键：悬停 / 聚焦时出现，点一下直接合成一句试听。 */
.voice-option-play {
  position: absolute;
  right: 8px;
  bottom: 7px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  color: var(--sf-ink);
  opacity: 0;
  cursor: pointer;
  transition:
    opacity var(--transition-base),
    border-color var(--transition-base),
    transform var(--transition-base);
}

.voice-option:hover .voice-option-play,
.voice-option:focus-within .voice-option-play,
.voice-option.active .voice-option-play {
  opacity: 1;
}

.voice-option-play:hover {
  border-color: rgba(36, 31, 25, 0.55);
  transform: scale(1.06);
}

.voice-option-play:disabled {
  cursor: default;
  opacity: 0.5;
}

.voice-option-play svg {
  width: 10px;
  height: 10px;
  margin-left: 1px;
}

.voice-option-spinner {
  width: 11px;
  height: 11px;
  border: 1.5px solid var(--sf-line);
  border-top-color: var(--sf-ink);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.voice-group-label em {
  margin-left: 4px;
  color: rgba(36, 31, 25, 0.22);
  font-style: normal;
  font-weight: 500;
  letter-spacing: 0;
}

.voice-modal-preview {
  flex: 0 0 auto;
  padding: 0 22px 10px;
}

.voice-modal-foot {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px 18px;
  border-top: 1px solid rgba(36, 31, 25, 0.07);
  background: rgba(36, 31, 25, 0.02);
}

.voice-modal-current {
  min-width: 0;
  flex: 1;
}

.voice-modal-current strong {
  display: block;
  color: var(--sf-ink);
  font-size: 14px;
  font-weight: 650;
}

.voice-modal-current p {
  margin-top: 2px;
  overflow: hidden;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.voice-modal-current .voice-modal-hint {
  color: var(--sf-ink-2);
}

.voice-modal-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.voice-modal-actions .mini-btn {
  padding: 8px 12px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 10px;
}

.voice-modal-actions .studio-btn {
  min-height: 38px;
  padding: 0 18px;
}

@keyframes voice-modal-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes voice-modal-rise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* ---------- 滑杆 ---------- */

.voice-range {
  width: 100%;
  height: 20px;
  margin: 2px 0 0;
  background: transparent;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}

.voice-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(36, 31, 25, 0.9) 0 var(--fill, 50%),
    rgba(36, 31, 25, 0.12) var(--fill, 50%) 100%
  );
}

.voice-range::-webkit-slider-thumb {
  width: 14px;
  height: 14px;
  margin-top: -5px;
  border: 2px solid var(--sf-surface);
  border-radius: 50%;
  background: var(--sf-ink);
  box-shadow: 0 0 0 4px rgba(36, 31, 25, 0.16);
  appearance: none;
  -webkit-appearance: none;
  transition: transform var(--transition-base);
}

.voice-range:hover::-webkit-slider-thumb {
  transform: scale(1.1);
}

.voice-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.12);
}

.voice-range::-moz-range-progress {
  height: 4px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.9);
}

.voice-range::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 2px solid var(--sf-surface);
  border-radius: 50%;
  background: var(--sf-ink);
}

/* ---------- 参数行 ---------- */

.param-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 11px 0;
}

.param-row:first-child {
  padding-top: 0;
}

.param-row:last-child {
  padding-bottom: 0;
}

.param-row + .param-row {
  border-top: 1px solid rgba(36, 31, 25, 0.055);
}

.param-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

/* ---------- 情绪 ---------- */

.emotion-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.emotion-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border: 1px solid rgba(36, 31, 25, 0.09);
  border-radius: 9px;
  background: transparent;
  color: var(--studio-text-hint);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: all var(--transition-base);
}

.emotion-chip:hover {
  color: var(--sf-ink);
}

.emotion-chip.active {
  border-color: rgba(36, 31, 25, 0.45);
  background: rgba(36, 31, 25, 0.14);
  color: var(--sf-surface);
}

/* ---------- 输出 ---------- */

.output-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.adv-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--studio-text-hint);
  font-size: 10.5px;
}

.voice-select {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid var(--studio-field-border);
  border-radius: 10px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.82);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}

.voice-select:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.voice-select option {
  background: var(--sf-surface);
  color: var(--sf-ink);
}

.switch-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--studio-text-soft);
  font-size: 11.5px;
  line-height: 1.5;
  cursor: pointer;
}

.switch-row input {
  margin-top: 1px;
  width: 14px;
  height: 14px;
  accent-color: var(--sf-ink);
  cursor: pointer;
}

.control-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
  border-top: 1px solid rgba(36, 31, 25, 0.07);
  background: linear-gradient(180deg, rgba(36, 31, 25, 0.035), transparent 70%);
}

.cost-line {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--studio-text-hint);
  font-size: 11.5px;
}

.cost-voice {
  max-width: 60%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.dot {
  opacity: 0.5;
}

.generate-btn {
  width: 100%;
  min-height: 44px;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.generate-btn svg {
  width: 15px;
  height: 15px;
}

.control-error {
  color: var(--sf-terra-strong);
  font-size: 11.5px;
  line-height: 1.55;
}

/* ========================= 声音克隆 ========================= */

.clone-layout {
  grid-template-columns: minmax(0, 1fr) 400px;
}

.sample-body,
.clone-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 26px 20px;
  border: 1.5px dashed rgba(36, 31, 25, 0.14);
  border-radius: 18px;
  background: rgba(36, 31, 25, 0.022);
  text-align: center;
  cursor: pointer;
  transition: border-color var(--transition-base), background var(--transition-base);
}

.dropzone:hover,
.dropzone.is-over {
  border-color: rgba(36, 31, 25, 0.55);
  background: rgba(36, 31, 25, 0.06);
}

.dropzone-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--sf-line);
  border-radius: 13px;
  background: rgba(36, 31, 25, 0.1);
  color: var(--sf-ink-3);
}

.dropzone-icon svg {
  width: 19px;
  height: 19px;
}

.dropzone strong {
  color: rgba(36, 31, 25, 0.86);
  font-size: 13.5px;
  font-weight: 650;
}

.dropzone p {
  max-width: 420px;
  color: var(--studio-text-hint);
  font-size: 11.5px;
  line-height: 1.65;
}

.file-input {
  display: none;
}

.record-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.025);
}

.record-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.record-head strong {
  color: rgba(36, 31, 25, 0.8);
  font-size: 12.5px;
  font-weight: 650;
}

.record-head p {
  margin-top: 3px;
  color: var(--studio-text-hint);
  font-size: 11px;
  line-height: 1.55;
}

.record-timer {
  flex: 0 0 auto;
  color: rgba(36, 31, 25, 0.42);
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.record-timer.is-live {
  color: var(--sf-terra-strong);
}

.record-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.record-btn {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 0 18px;
  border: 1px solid rgba(36, 31, 25, 0.12);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.05);
  color: rgba(36, 31, 25, 0.86);
  font: inherit;
  font-size: 12.5px;
  font-weight: 650;
  cursor: pointer;
  transition: all var(--transition-base);
}

.record-btn:hover:not(:disabled) {
  background: rgba(36, 31, 25, 0.1);
}

.record-btn.is-recording {
  border-color: var(--sf-danger-soft);
  background: var(--sf-terra-wash);
  color: var(--sf-terra-strong);
}

.record-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.record-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sf-terra-strong);
}

.record-btn.is-recording .record-dot {
  animation: rec-pulse 1.2s ease-in-out infinite;
}

@keyframes rec-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.82); }
}

.level-meter {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 3px;
  height: 30px;
}

.level-meter span {
  flex: 1;
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(180deg, var(--sf-ink), rgba(36, 31, 25, 0.4));
  transition: opacity 90ms linear;
}

.sample-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px 15px;
  border: 1px solid rgba(36, 31, 25, 0.24);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.05);
}

.sample-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sample-card-head strong {
  color: rgba(36, 31, 25, 0.88);
  font-size: 12.5px;
  font-weight: 650;
  word-break: break-all;
}

.sample-card-head p {
  margin-top: 3px;
  color: var(--studio-text-hint);
  font-size: 11px;
}

.sample-card-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.sample-tips {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 0;
  padding: 12px 14px 12px 28px;
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.022);
  color: var(--studio-text-hint);
  font-size: 11.5px;
  line-height: 1.6;
}

.sample-tips li::marker {
  color: rgba(36, 31, 25, 0.65);
}

.clone-input {
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 12.5px;
}

.clone-textarea {
  min-height: 70px;
  line-height: 1.7;
  resize: vertical;
}

.switch-group {
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
}

.clone-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 14px 15px;
  border: 1px solid rgba(36, 31, 25, 0.06);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.022);
  list-style: none;
}

.clone-steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  opacity: 0.5;
  transition: opacity var(--transition-base);
}

.clone-steps li.is-active,
.clone-steps li.is-done {
  opacity: 1;
}

.step-index {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid rgba(36, 31, 25, 0.14);
  border-radius: 50%;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-weight: 700;
}

.clone-steps li.is-active .step-index {
  border-color: rgba(36, 31, 25, 0.6);
  background: rgba(36, 31, 25, 0.16);
  color: var(--sf-surface);
}

.clone-steps li.is-done .step-index {
  border-color: #cfe6da;
  background: #f0f8f3;
  color: var(--sf-success);
}

.clone-steps strong {
  display: block;
  color: rgba(36, 31, 25, 0.78);
  font-size: 12px;
  font-weight: 650;
}

.clone-steps p {
  margin-top: 2px;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.5;
}

.clone-submit {
  width: 100%;
  min-height: 42px;
  font-size: 13px;
  font-weight: 700;
}

.clone-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 13px 15px;
  border: 1px solid #cfe6da;
  border-radius: 16px;
  background: #f4faf6;
}

.clone-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.clone-result-head strong {
  color: var(--sf-success);
  font-size: 12.5px;
  font-weight: 700;
}

.clone-id {
  color: rgba(36, 31, 25, 0.38);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.clone-result-actions {
  display: flex;
  gap: 6px;
}

/* ---------- 我的音色 ---------- */

.my-voices-panel {
  grid-column: 1 / -1;
}

.my-voices-panel .studio-panel-head {
  flex-wrap: wrap;
  row-gap: 6px;
}

.my-voices-panel .studio-panel-meta {
  flex: 0 1 auto;
  min-width: 0;
  margin-left: auto;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  text-align: right;
  white-space: normal;
}

.my-voices-body {
  padding: 16px 18px 18px;
}

.my-voices-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(268px, 1fr));
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.my-voice-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 13px 15px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 16px;
  background: rgba(36, 31, 25, 0.028);
}

.my-voice-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.my-voice-head strong {
  min-width: 0;
  overflow: hidden;
  color: rgba(36, 31, 25, 0.88);
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.my-voice-date {
  flex: 0 0 auto;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.my-voice-id {
  overflow: hidden;
  color: rgba(36, 31, 25, 0.3);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.my-voice-actions {
  display: flex;
  gap: 6px;
  margin-top: auto;
}

/* ========================= 音色筛选（场景 / 性别） ========================= */

.voice-modal-meta {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  padding: 0 22px 12px;
}

.voice-modal-scenes,
.voice-modal-genders {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.voice-filter-chip {
  padding: 5px 11px;
  border: 1px solid rgba(36, 31, 25, 0.08);
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.03);
  color: var(--studio-text-soft);
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  transition:
    border-color var(--transition-base),
    background var(--transition-base),
    color var(--transition-base);
}

.voice-filter-chip:hover {
  border-color: rgba(36, 31, 25, 0.36);
  color: var(--sf-ink);
}

.voice-filter-chip.active {
  border-color: transparent;
  background: var(--sf-ink);
  color: var(--sf-surface);
}

.voice-option-chips {
  display: flex;
  gap: 4px;
  min-height: 17px;
  overflow: hidden;
}

.voice-option-chips em {
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.055);
  color: rgba(36, 31, 25, 0.5);
  font-size: 9.5px;
  font-style: normal;
  line-height: 1.5;
  white-space: nowrap;
}

/* ========================= 音色设计 ========================= */

.design-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 16px;
  align-items: start;
}

.design-side {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}

.design-preset-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
}

.design-lead {
  margin: 0;
  color: var(--studio-text-hint);
  font-size: 11.5px;
  line-height: 1.7;
}

.design-scene-row {
  padding: 0;
}

.design-preset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.design-preset-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border: 1px solid rgba(36, 31, 25, 0.07);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.025);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--transition-base),
    background var(--transition-base),
    transform var(--transition-base);
}

.design-preset-card:hover {
  border-color: rgba(36, 31, 25, 0.32);
  background: rgba(36, 31, 25, 0.06);
  transform: translateY(-1px);
}

.design-preset-card.active {
  border-color: rgba(36, 31, 25, 0.5);
  background: rgba(36, 31, 25, 0.12);
  box-shadow: inset 0 0 0 1px rgba(36, 31, 25, 0.12);
}

.design-preset-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.design-preset-top strong {
  overflow: hidden;
  color: rgba(36, 31, 25, 0.88);
  font-size: 12.5px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.design-preset-top em {
  flex: 0 0 auto;
  color: rgba(36, 31, 25, 0.34);
  font-size: 9.5px;
  font-style: normal;
  letter-spacing: 0.04em;
}

.design-preset-blurb {
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.55;
}

.design-preset-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.design-preset-tags em {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(36, 31, 25, 0.055);
  color: rgba(36, 31, 25, 0.46);
  font-size: 9.5px;
  font-style: normal;
  line-height: 1.6;
}

.design-form-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 18px 18px;
}

/* 音色设计表单：统一标签、计数与输入框对齐，避免文字贴边 */
.design-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.design-field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.design-field-label {
  color: rgba(36, 31, 25, 0.72);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.design-field-hint,
.design-field-count {
  flex: none;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.design-input {
  width: 100%;
  padding: 9px 12px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.75;
}

input.design-input {
  height: 38px;
  padding: 0 12px;
  line-height: 38px;
}

.design-textarea {
  min-height: 104px;
  resize: vertical;
}

.design-textarea--short {
  min-height: 76px;
}

.design-submit {
  width: 100%;
}

.design-estimate {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 10px;
  margin-top: -4px;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.5;
}

.design-estimate-warn {
  color: var(--sf-ink-2);
}

.design-result {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(36, 31, 25, 0.3);
  border-radius: 14px;
  background: rgba(36, 31, 25, 0.07);
}

.design-result-meta {
  margin: 0;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.55;
}

.my-voice-prompt {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--studio-text-hint);
  font-size: 10.5px;
  line-height: 1.55;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

/* ========================= 响应式 ========================= */

@media (max-width: 1180px) {
  .speech-layout,
  .clone-layout,
  .design-layout {
    grid-template-columns: minmax(0, 1fr) 360px;
  }
}

@media (max-width: 980px) {
  .speech-layout,
  .clone-layout,
  .design-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .design-preset-grid {
    grid-template-columns: 1fr;
  }

  .control-panel {
    position: static;
    max-height: none;
  }

  .control-body {
    overflow: visible;
  }

  .voice-list {
    max-height: 300px;
  }
}

@media (max-width: 720px) {
  .voice-main {
    width: min(100% - 26px, var(--studio-max-width));
    padding-top: 8px;
  }

  .voice-tabs {
    width: 100%;
    overflow-x: auto;
    border-radius: 18px;
  }

  .voice-tab {
    flex: none;
    padding: 0 14px;
    white-space: nowrap;
  }

  /* 手机端音色选择库：单列卡片 + 收紧内边距，避免标签和描述挤在一起 */
  .voice-grid {
    grid-template-columns: 1fr;
  }

  .voice-option {
    padding: 11px 13px;
  }

  .voice-option-play {
    opacity: 1;
  }

  .voice-modal-layer {
    padding: 10px;
  }

  .voice-modal {
    height: calc(100dvh - 20px);
    border-radius: 18px;
  }

  .voice-modal-head {
    gap: 10px;
    padding: 16px 16px 12px;
  }

  .voice-modal-toolbar {
    padding: 12px 16px 0;
  }

  .voice-modal-filters,
  .voice-modal-meta {
    padding-left: 16px;
    padding-right: 16px;
  }

  .voice-modal-list {
    padding: 0 16px 14px;
  }

  .voice-modal-preview {
    padding: 0 16px 10px;
  }

  .voice-modal-foot {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
  }

  .voice-modal-actions {
    justify-content: flex-end;
  }

  .design-preset-body,
  .design-form-body {
    padding: 14px;
  }

  .tabs-meta {
    display: none;
  }

  .preset-row {
    grid-template-columns: 1fr;
  }

  .tag-group {
    flex-direction: column;
    gap: 6px;
  }

  .tag-group-label {
    flex: none;
    padding-top: 0;
  }

  .script-input {
    min-height: 200px;
  }

  .record-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .level-meter {
    height: 22px;
  }

  .my-voices-list {
    grid-template-columns: 1fr;
  }

  .voice-modal-layer {
    padding: 0;
  }

  .translate-layer {
    padding: 12px;
  }

  .translate-dialog {
    width: 100%;
    max-height: calc(100dvh - 24px);
    border-radius: 18px;
  }

  .translate-head {
    padding: 16px 16px 14px;
  }

  .translate-body {
    padding: 14px 16px 16px;
  }

  .translate-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .voice-modal {
    width: 100%;
    height: 100dvh;
    max-height: none;
    border: 0;
    border-radius: 0;
  }

  .voice-modal-head {
    padding: 16px 16px 14px;
  }

  .voice-modal-headings p,
  .voice-modal-count {
    display: none;
  }

  .voice-modal-toolbar,
  .voice-modal-filters,
  .voice-modal-list,
  .voice-modal-preview,
  .voice-modal-foot {
    padding-left: 16px;
    padding-right: 16px;
  }

  .voice-grid {
    grid-template-columns: 1fr;
  }

  .voice-modal-foot {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .voice-modal-actions {
    width: 100%;
  }

  .voice-modal-actions .studio-btn {
    flex: 1;
  }
}
</style>
