<template>
  <Teleport to="body">
    <Transition name="audio-picker-fade">
      <div v-if="open" class="audio-picker-mask" @click.self="emit('close')">
        <section
          class="audio-picker"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audio-picker-title"
        >
          <header class="audio-picker-head">
            <div class="audio-picker-heading">
              <span class="audio-picker-kicker">REFERENCE AUDIO</span>
              <h3 id="audio-picker-title">添加参考音频</h3>
              <p>从配音音频库选择已生成的声音，或上传一段本地音频。</p>
            </div>
            <button class="audio-picker-close" type="button" aria-label="关闭音频选择弹窗" @click="emit('close')">
              ×
            </button>
          </header>

          <div class="audio-picker-body">
            <section class="audio-source audio-source-library">
              <header class="audio-source-head">
                <div class="audio-source-title">
                  <span class="audio-source-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 12v-1a8 8 0 0 1 16 0v1" />
                      <rect x="3.2" y="12.4" width="4" height="7" rx="2" />
                      <rect x="16.8" y="12.4" width="4" height="7" rx="2" />
                    </svg>
                  </span>
                  <div>
                    <strong>配音音频库</strong>
                    <span>来自「配音创作」的已完成音频</span>
                  </div>
                </div>
                <div class="audio-source-tools">
                  <span class="audio-source-count">{{ items.length }} 条</span>
                  <button class="audio-source-refresh" type="button" :disabled="loading" @click="emit('refresh')">
                    刷新
                  </button>
                </div>
              </header>

              <p class="audio-source-desc">选中后会加入多模态音频素材，并自动生成「音频1」这类引用标签。</p>

              <div v-if="loading" class="audio-library-state">
                <span class="state-dot" aria-hidden="true" />
                正在读取音频库…
              </div>
              <div v-else-if="error" class="audio-library-state is-error">{{ error }}</div>
              <div v-else-if="!items.length" class="audio-library-empty">
                <span class="empty-orb" aria-hidden="true">♫</span>
                <strong>音频库还是空的</strong>
                <p>先去「配音创作」生成一段配音，完成后会自动保存到这里。</p>
                <button type="button" @click="emit('upload')">先上传本地音频</button>
              </div>

              <ul v-else class="audio-library-list">
                <li
                  v-for="item in items"
                  :key="item.id"
                  class="audio-library-item"
                  :class="{ 'is-selected': isSelected(item) }"
                >
                  <div class="audio-library-top">
                    <div class="audio-library-meta">
                      <strong>{{ item.voiceName || '未命名音色' }}</strong>
                      <span>{{ formatCreatedAt(item.createdAt) }}</span>
                    </div>
                    <button
                      class="audio-library-add"
                      type="button"
                      :disabled="isSelected(item)"
                      @click="selectItem(item)"
                    >
                      {{ isSelected(item) ? '已添加' : '使用' }}
                    </button>
                  </div>

                  <p class="audio-library-text">{{ item.text || '（无文本）' }}</p>

                  <div class="audio-library-bottom">
                    <div class="audio-library-chips">
                      <span>{{ formatDurationMs(item.durationMs) }}</span>
                      <span>{{ item.format.toUpperCase() }}</span>
                      <span>{{ formatBytes(item.size) }}</span>
                    </div>
                    <button
                      class="audio-library-preview"
                      type="button"
                      :aria-label="previewId === item.id ? '正在试听' : '试听音频'"
                      @click="showPreview(item)"
                    >
                      <svg v-if="previewId !== item.id" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M8.4 5.6 18 12l-9.6 6.4z" fill="currentColor" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                        <rect x="7.4" y="5.6" width="3.4" height="12.8" rx="1.4" fill="currentColor" />
                        <rect x="13.2" y="5.6" width="3.4" height="12.8" rx="1.4" fill="currentColor" />
                      </svg>
                      {{ previewId === item.id ? '试听中' : '试听' }}
                    </button>
                  </div>

                  <VoicePlayer
                    v-if="previewId === item.id && previewUrl"
                    :key="item.id"
                    :src="previewUrl"
                    :duration-ms="item.durationMs"
                    :bars="44"
                    compact
                    autoplay
                  />
                </li>
              </ul>
            </section>

            <section class="audio-source audio-source-upload">
              <span class="upload-source-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
                  <path d="M4.5 15.5v2A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-2" />
                </svg>
              </span>
              <span class="audio-source-kicker">LOCAL FILE</span>
              <strong>本地上传</strong>
              <p>上传你已有的音频文件，支持 MP3 / WAV / M4A / AAC 等常见格式。</p>
              <button class="upload-source-action" type="button" @click="emit('upload')">选择本地音频</button>
              <span class="upload-source-hint">选择后会加入多模态音频列表</span>
            </section>
          </div>

          <footer class="audio-picker-foot">
            <span>最多添加 3 个参考音频</span>
            <span class="audio-picker-foot-note">音频库保存在当前浏览器</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import VoicePlayer from '@/components/VoicePlayer.vue'
import { formatBytes, formatDurationMs } from '@/features/voice/audio'
import type { VoiceLibraryItem } from '@/features/voice/types'

const props = withDefaults(
  defineProps<{
    open: boolean
    items: VoiceLibraryItem[]
    loading?: boolean
    error?: string
    selectedIds?: string[]
  }>(),
  { loading: false, error: '', selectedIds: () => [] },
)

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'refresh'): void
  (e: 'upload'): void
  (e: 'select', item: VoiceLibraryItem): void
}>()

const selectedIdSet = computed(() => new Set(props.selectedIds))
const previewId = ref('')
const previewUrl = ref('')
let previousBodyOverflow = ''

function isSelected(item: VoiceLibraryItem): boolean {
  return selectedIdSet.value.has(item.id)
}

function formatCreatedAt(timestamp: number): string {
  if (!timestamp) return '刚刚'
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function stopPreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  previewId.value = ''
}

function showPreview(item: VoiceLibraryItem) {
  if (previewId.value === item.id) return
  stopPreview()
  previewUrl.value = URL.createObjectURL(item.blob)
  previewId.value = item.id
}

function selectItem(item: VoiceLibraryItem) {
  if (isSelected(item)) return
  stopPreview()
  emit('select', item)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      previousBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = previousBodyOverflow
      stopPreview()
    }
  },
)

watch(
  () => props.items,
  (items) => {
    if (previewId.value && !items.some((item) => item.id === previewId.value)) stopPreview()
  },
)

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !props.open) return
  event.preventDefault()
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  if (props.open) document.body.style.overflow = previousBodyOverflow
  stopPreview()
})
</script>

<style scoped>
.audio-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 4200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(17, 17, 16, 0.28);
  backdrop-filter: blur(18px) saturate(125%);
  -webkit-backdrop-filter: blur(18px) saturate(125%);
}

.audio-picker {
  display: flex;
  flex-direction: column;
  width: min(940px, 100%);
  max-height: min(86vh, 820px);
  overflow: hidden;
  border: 1px solid #e8e8e2;
  border-radius: 28px;
  background: #ffffff;
  box-shadow: 0 24px 80px rgba(17, 17, 16, 0.16);
}

.audio-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 26px 28px 20px;
  border-bottom: 1px solid rgba(17, 17, 16, 0.07);
}

.audio-picker-heading {
  min-width: 0;
}

.audio-picker-kicker {
  display: block;
  color: rgba(17, 17, 16, 0.62);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
}

.audio-picker-heading h3 {
  margin: 7px 0 6px;
  color: #111110;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.audio-picker-heading p {
  margin: 0;
  color: rgba(29, 29, 27, 0.5);
  font-size: 12.5px;
  line-height: 1.7;
}

.audio-picker-close {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid rgba(17, 17, 16, 0.1);
  border-radius: 50%;
  background: rgba(17, 17, 16, 0.045);
  color: rgba(29, 29, 27, 0.65);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.audio-picker-close:hover {
  border-color: rgba(29, 29, 27, 0.22);
  background: rgba(17, 17, 16, 0.08);
  color: #1d1d1b;
}

.audio-picker-body {
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(250px, 0.75fr);
  gap: 16px;
  min-height: 0;
  padding: 20px 28px;
  overflow: hidden;
}

.audio-source {
  min-width: 0;
  border: 1px solid rgba(17, 17, 16, 0.075);
  border-radius: 22px;
  background:
    linear-gradient(180deg, rgba(17, 17, 16, 0.045), rgba(17, 17, 16, 0.018));
}

.audio-source-library {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 18px;
  overflow: hidden;
}

.audio-source-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.audio-source-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.audio-source-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid rgba(17, 17, 16, 0.2);
  border-radius: 11px;
  background: rgba(17, 17, 16, 0.08);
  color: #66665f;
}

.audio-source-icon svg {
  width: 18px;
  height: 18px;
}

.audio-source-title strong {
  display: block;
  color: #1d1d1b;
  font-size: 14px;
  font-weight: 600;
}

.audio-source-title span {
  display: block;
  margin-top: 3px;
  color: rgba(29, 29, 27, 0.36);
  font-size: 11px;
}

.audio-source-tools {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.audio-source-count {
  padding: 4px 8px;
  border: 1px solid rgba(17, 17, 16, 0.08);
  border-radius: 999px;
  color: rgba(29, 29, 27, 0.45);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.audio-source-refresh {
  border: 0;
  background: transparent;
  color: rgba(17, 17, 16, 0.72);
  font-size: 11px;
  cursor: pointer;
}

.audio-source-refresh:hover:not(:disabled) {
  color: #1d1d1b;
}

.audio-source-refresh:disabled {
  opacity: 0.45;
  cursor: wait;
}

.audio-source-desc {
  margin: 12px 0 14px;
  color: rgba(29, 29, 27, 0.4);
  font-size: 11.5px;
  line-height: 1.65;
}

.audio-library-state,
.audio-library-empty {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 24px;
  border: 1px dashed rgba(17, 17, 16, 0.1);
  border-radius: 16px;
  color: rgba(29, 29, 27, 0.45);
  font-size: 12px;
  text-align: center;
}

.audio-library-state {
  flex-direction: row;
  gap: 9px;
}

.audio-library-state.is-error {
  color: #b4342c;
}

.state-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #111111;
  box-shadow: 0 0 0 0 rgba(17, 17, 16, 0.28);
  animation: audio-state-pulse 1.4s ease-out infinite;
}

.empty-orb {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  margin-bottom: 13px;
  border: 1px solid rgba(17, 17, 16, 0.18);
  border-radius: 50%;
  background: rgba(17, 17, 16, 0.06);
  color: #66665f;
  font-size: 24px;
}

.audio-library-empty strong {
  color: rgba(29, 29, 27, 0.78);
  font-size: 13px;
  font-weight: 600;
}

.audio-library-empty p {
  max-width: 280px;
  margin: 7px 0 16px;
  line-height: 1.7;
}

.audio-library-empty button {
  padding: 8px 14px;
  border: 1px solid rgba(17, 17, 16, 0.24);
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.08);
  color: #66665f;
  font-size: 11px;
  cursor: pointer;
}

.audio-library-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 9px;
  min-height: 0;
  margin: 0;
  padding: 1px 5px 1px 1px;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(29, 29, 27, 0.14) transparent;
}

.audio-library-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 13px;
  border: 1px solid rgba(17, 17, 16, 0.07);
  border-radius: 15px;
  background:
    radial-gradient(150px 70px at 2% 0%, rgba(17, 17, 16, 0.055), transparent 74%),
    rgba(17, 17, 16, 0.018);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.audio-library-item:hover {
  border-color: rgba(29, 29, 27, 0.14);
  background:
    radial-gradient(150px 70px at 2% 0%, rgba(17, 17, 16, 0.08), transparent 74%),
    rgba(17, 17, 16, 0.028);
}

.audio-library-item.is-selected {
  border-color: rgba(17, 17, 16, 0.22);
  opacity: 0.72;
}

.audio-library-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.audio-library-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.audio-library-meta strong {
  overflow: hidden;
  color: #1d1d1b;
  font-size: 12.5px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.audio-library-meta span {
  color: rgba(29, 29, 27, 0.34);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

.audio-library-add {
  flex: 0 0 auto;
  padding: 5px 11px;
  border: 1px solid rgba(17, 17, 16, 0.22);
  border-radius: 999px;
  background: rgba(17, 17, 16, 0.08);
  color: #66665f;
  font-size: 10.5px;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease;
}

.audio-library-add:hover:not(:disabled) {
  border-color: rgba(17, 17, 16, 0.46);
  background: rgba(17, 17, 16, 0.16);
}

.audio-library-add:disabled {
  border-color: rgba(29, 29, 27, 0.08);
  background: rgba(17, 17, 16, 0.035);
  color: rgba(29, 29, 27, 0.3);
  cursor: default;
}

.audio-library-text {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: rgba(29, 29, 27, 0.56);
  font-size: 11.5px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.audio-library-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.audio-library-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.audio-library-chips span {
  padding: 3px 7px;
  border: 1px solid rgba(17, 17, 16, 0.06);
  border-radius: 999px;
  background: #f0f0ec;
  color: rgba(29, 29, 27, 0.34);
  font-size: 9.5px;
  font-variant-numeric: tabular-nums;
}

.audio-library-preview {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: rgba(17, 17, 16, 0.7);
  font-size: 10px;
  cursor: pointer;
}

.audio-library-preview svg {
  width: 13px;
  height: 13px;
}

.audio-library-preview:hover {
  color: #1d1d1b;
}

.audio-library-item :deep(.voice-player) {
  margin-top: 2px;
}

.audio-source-upload {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 22px;
  background:
    radial-gradient(220px 130px at 50% 0%, rgba(17, 17, 16, 0.09), transparent 74%),
    linear-gradient(180deg, rgba(17, 17, 16, 0.042), rgba(17, 17, 16, 0.014));
}

.upload-source-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  margin-bottom: 17px;
  border: 1px solid rgba(17, 17, 16, 0.2);
  border-radius: 17px;
  background: rgba(17, 17, 16, 0.08);
  color: #66665f;
}

.upload-source-icon svg {
  width: 25px;
  height: 25px;
}

.audio-source-kicker {
  color: rgba(29, 29, 27, 0.3);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.audio-source-upload strong {
  margin-top: 6px;
  color: #1d1d1b;
  font-family: 'Noto Serif SC', 'Songti SC', serif;
  font-size: 19px;
  font-weight: 600;
}

.audio-source-upload p {
  margin: 10px 0 18px;
  color: rgba(29, 29, 27, 0.42);
  font-size: 11.5px;
  line-height: 1.75;
}

.upload-source-action {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid rgba(17, 17, 16, 0.32);
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(17, 17, 16, 0.18), rgba(17, 17, 16, 0.08));
  color: #111110;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.upload-source-action:hover {
  border-color: rgba(17, 17, 16, 0.54);
  background: linear-gradient(135deg, rgba(17, 17, 16, 0.27), rgba(17, 17, 16, 0.12));
  transform: translateY(-1px);
}

.upload-source-hint {
  align-self: center;
  margin-top: 10px;
  color: rgba(29, 29, 27, 0.28);
  font-size: 9.5px;
}

.audio-picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 28px 18px;
  border-top: 1px solid rgba(17, 17, 16, 0.06);
  color: rgba(29, 29, 27, 0.32);
  font-size: 10px;
}

.audio-picker-foot-note {
  color: rgba(29, 29, 27, 0.22);
}

.audio-picker-fade-enter-active,
.audio-picker-fade-leave-active {
  transition: opacity 0.2s ease;
}

.audio-picker-fade-enter-active .audio-picker,
.audio-picker-fade-leave-active .audio-picker {
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease;
}

.audio-picker-fade-enter-from,
.audio-picker-fade-leave-to {
  opacity: 0;
}

.audio-picker-fade-enter-from .audio-picker,
.audio-picker-fade-leave-to .audio-picker {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
}

@keyframes audio-state-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(17, 17, 16, 0.34);
  }
  100% {
    box-shadow: 0 0 0 8px rgba(17, 17, 16, 0);
  }
}

@media (max-width: 760px) {
  .audio-picker-mask {
    align-items: flex-end;
    padding: 10px;
  }

  .audio-picker {
    max-height: 90dvh;
    border-radius: 22px;
  }

  .audio-picker-head {
    padding: 20px 18px 15px;
  }

  .audio-picker-body {
    grid-template-columns: 1fr;
    padding: 14px 18px;
    overflow-y: auto;
  }

  .audio-source-library {
    max-height: 46vh;
  }

  .audio-source-upload {
    justify-content: flex-start;
  }

  .audio-picker-foot {
    padding: 12px 18px 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .audio-picker-mask,
  .audio-picker-mask * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
