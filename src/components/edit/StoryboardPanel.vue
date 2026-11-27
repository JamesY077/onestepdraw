<template>
  <section class="storyboard-panel">
    <template v-if="storyboard">
      <header class="storyboard-head">
        <div>
          <span class="storyboard-eyebrow">STORYBOARD</span>
          <h2>{{ storyboard.title }}</h2>
          <p>{{ storyboard.brief }}</p>
        </div>
        <span class="storyboard-status" :class="{ confirmed: storyboard.status === 'confirmed' }">
          {{ storyboard.status === 'draft' ? `${readyCount}/${shots.length} 镜就绪` : '已确认' }}
        </span>
      </header>

      <div class="storyboard-meta">
        <span>{{ shots.length }} 个镜头</span>
        <span>{{ totalDuration }} 秒</span>
        <span>{{ storyboard.aspectRatio }}</span>
        <span>{{ storyboard.engine === 'animation' ? '代码分镜 · HyperFrames' : '图片模型分镜 · AIGC' }}</span>
      </div>

      <div class="storyboard-shots">
        <article v-for="(shot, index) in shots" :key="shot.id" class="shot-card" :class="{ 'is-confirmed': storyboard.status === 'confirmed' }">
          <header class="shot-head">
            <span class="shot-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <strong>{{ shot.id }}</strong>
            <span v-if="shot.status" class="shot-production-status" :class="`is-${shot.status}`">
              {{ shotStatusLabel(shot.status) }}
            </span>
            <span v-else class="shot-reference-status" :class="`is-${shot.referenceStatus}`">
              {{ referenceStatusLabel(shot.referenceStatus) }}
            </span>
          </header>

          <div class="shot-media">
            <video
              v-if="shot.referenceVideo"
              :src="shot.referenceVideo"
              :poster="shot.referenceImage || undefined"
              controls
              playsinline
              preload="metadata"
            />
            <img v-else-if="shot.referenceImage" :src="shot.referenceImage" :alt="`${shot.id} 分镜参考图`" />
            <div v-else class="shot-media-empty">
              <span class="shot-media-mark">{{ shot.referenceStatus === 'running' ? '···' : 'S' }}</span>
              <small>{{ shot.referenceStatus === 'running' ? '正在准备参考图' : '上传媒体或用 AI 重做本镜' }}</small>
            </div>
            <span v-if="shot.referenceSource" class="shot-media-source">{{ referenceSourceLabel(shot.referenceSource) }}</span>
          </div>

          <p v-if="shot.referenceError || shot.error" class="shot-error">{{ shot.error || shot.referenceError }}</p>

          <label class="shot-field">
            <span>分镜脚本</span>
            <textarea
              :value="shot.prompt"
              :readonly="storyboard.status !== 'draft'"
              rows="5"
              @change="updatePrompt(shot.id, $event)"
            />
          </label>

          <div class="shot-card-footer">
            <label class="shot-duration">
              <span>时长</span>
              <input
                type="number"
                min="4"
                max="15"
                step="1"
                :value="shot.duration"
                :readonly="storyboard.status !== 'draft'"
                @change="updateDuration(shot.id, $event)"
              />
              <span>秒</span>
            </label>
            <small v-if="shot.timelineStart != null">时间轴 {{ shot.timelineStart.toFixed(1) }}s 起</small>
          </div>

          <template v-if="storyboard.status === 'draft'">
            <div class="shot-media-actions">
              <label class="shot-upload" :class="{ disabled: busy }">
                替换图片 / 视频
                <input type="file" accept="image/*,video/*" :disabled="busy" @change="replaceMedia(shot.id, $event)" />
              </label>
              <span>{{ shot.referenceName || '支持本地素材' }}</span>
            </div>
            <div class="shot-revision">
              <textarea
                v-model="revisionNotes[shot.id]"
                rows="2"
                placeholder="本镜修改意见；留空则换一版"
                :disabled="busy"
              />
              <button type="button" :disabled="busy" @click="regenerate(shot.id)">
                {{ busy ? 'AI 处理中…' : `AI 重做 ${shot.id}` }}
              </button>
            </div>
          </template>
        </article>
      </div>

      <footer class="storyboard-footer">
        <div>
          <strong>{{ storyboard.status === 'draft' ? '逐镜确认画面与脚本，再执行整片' : '分镜已锁定为本次执行依据' }}</strong>
          <p v-if="storyboard.status === 'draft' && storyboard.engine === 'animation'">
            参考图由本地代码绘制，不创建正式工程；总确认后直接逐镜生成 HyperFrames 动画。
          </p>
          <p v-else-if="storyboard.status === 'draft'">
            参考图由图片模型生成；总确认后各镜会带着自己的参考图/视频进入视频生成。
          </p>
          <p v-else>全部镜号、时长和连续性要求会一起保留。</p>
        </div>
        <button
          v-if="storyboard.status === 'draft'"
          type="button"
          :disabled="busy || storyboard.engine !== engine || !allReferencesReady"
          @click="$emit('confirm')"
        >
          {{ storyboard.engine !== engine ? '请先切回对应引擎' : busy ? '正在准备…' : allReferencesReady ? (storyboard.engine === 'animation' ? '确认并生成动画' : '确认并生成视频') : `还有 ${shots.length - readyCount} 镜未就绪` }}
        </button>
        <button
          v-else-if="resumable"
          type="button"
          :disabled="busy"
          @click="$emit('resume')"
        >
          续跑未完成 {{ remainingCount }} 镜
        </button>
        <span v-else class="confirmed-note">已确认 · 执行中可查看逐镜状态</span>
      </footer>
    </template>

    <div v-else class="storyboard-empty">
      <span class="storyboard-empty-mark">S</span>
      <h2>先看见整支片，再开始执行</h2>
      <p>动画会先得到代码分镜图，AIGC 会先得到图片模型参考图。你可以逐镜改脚本、换图片或视频、让 AI 单镜重做，最后统一确认。</p>
      <span>主画面与分镜可以随时切换，不影响时间轴。</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import type {
  AgentProduction,
  AgentStoryboardDraftShot,
  AgentStoryboardPlan,
  AgentStoryboardReferenceSource,
  AgentStoryboardReferenceStatus,
  AgentStoryboardShotStatus,
} from '@/types/agent'
import type { CreativeEngineMode } from '@/stores/chatModeStore'
import { storyboardReferencesReady } from '@/features/agent/storyboardReferences'

const props = defineProps<{
  storyboard?: AgentStoryboardPlan
  production?: AgentProduction
  engine: CreativeEngineMode
  busy?: boolean
}>()

const emit = defineEmits<{
  (event: 'confirm'): void
  (event: 'resume'): void
  (event: 'update-shot', payload: { shotId: string; prompt?: string; duration?: number }): void
  (event: 'replace-media', payload: { shotId: string; file: File }): void
  (event: 'regenerate-shot', payload: { shotId: string; instruction: string }): void
}>()

type StoryboardPanelShot = AgentStoryboardDraftShot & Partial<Pick<AgentProduction['shots'][number], 'status' | 'timelineStart' | 'error'>>
const revisionNotes = reactive<Record<string, string>>({})
const resumable = computed(() => ['failed', 'paused'].includes(props.production?.status || ''))
const remainingCount = computed(() => props.production?.shots.filter((shot) => shot.status !== 'succeeded').length || 0)

const shots = computed<StoryboardPanelShot[]>(() => {
  if (!props.storyboard) return []
  if (props.storyboard.status === 'draft') return props.storyboard.shots
  if (props.production && props.production.messageId === props.storyboard.messageId) {
    return props.production.shots.map((shot) => ({
      ...props.storyboard?.shots.find((draft) => draft.id === shot.id),
      ...shot,
      referenceStatus: props.storyboard?.shots.find((draft) => draft.id === shot.id)?.referenceStatus || 'ready',
    }))
  }
  return props.storyboard.shots
})
const totalDuration = computed(() => shots.value.reduce((sum, shot) => sum + shot.duration, 0))
const readyCount = computed(() => shots.value.filter((shot) => shot.referenceStatus === 'ready' && (shot.referenceImage || shot.referenceVideo)).length)
const allReferencesReady = computed(() => storyboardReferencesReady(props.storyboard))

function shotStatusLabel(status: AgentStoryboardShotStatus) {
  return status === 'succeeded' ? '已完成' : status === 'running' ? '生成中' : status === 'failed' ? '失败' : '待执行'
}

function referenceStatusLabel(status: AgentStoryboardReferenceStatus) {
  return status === 'ready' ? '参考已就绪' : status === 'running' ? '参考图生成中' : status === 'failed' ? '参考生成失败' : '脚本改后待重做'
}

function referenceSourceLabel(source: AgentStoryboardReferenceSource) {
  return source === 'code' ? '本地代码分镜' : source === 'aigc' ? '图片模型' : source === 'upload' ? '手动上传' : '用户参考'
}

function updatePrompt(shotId: string, event: Event) {
  emit('update-shot', { shotId, prompt: (event.target as HTMLTextAreaElement).value })
}

function updateDuration(shotId: string, event: Event) {
  emit('update-shot', { shotId, duration: Number((event.target as HTMLInputElement).value) })
}

function replaceMedia(shotId: string, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('replace-media', { shotId, file })
  input.value = ''
}

function regenerate(shotId: string) {
  emit('regenerate-shot', { shotId, instruction: revisionNotes[shotId] || '' })
  revisionNotes[shotId] = ''
}
</script>

<style scoped>
.storyboard-panel { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; border: 1px solid var(--sf-line-soft); border-radius: 12px; background: var(--sf-surface); }
.storyboard-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px 10px; }
.storyboard-head > div { min-width: 0; }
.storyboard-eyebrow { color: var(--sf-terra-strong); font-size: 9px; font-weight: 700; letter-spacing: .16em; }
.storyboard-head h2 { margin: 4px 0 5px; color: var(--sf-ink); font-size: 18px; font-weight: 650; }
.storyboard-head p { display: -webkit-box; margin: 0; overflow: hidden; color: var(--sf-ink-3); font-size: 11px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.storyboard-status { flex: none; padding: 4px 9px; border-radius: 999px; background: #fff0d6; color: #9a5a12; font-size: 10px; font-weight: 650; }
.storyboard-status.confirmed { background: #e4f2e8; color: #337247; }
.storyboard-meta { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 20px 12px; }
.storyboard-meta span { padding: 3px 7px; border: 1px solid var(--sf-line-soft); border-radius: 5px; color: var(--sf-ink-3); font-size: 9px; }
.storyboard-shots { display: grid; flex: 1; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); align-content: start; gap: 12px; min-height: 0; padding: 2px 20px 16px; overflow: auto; }
.shot-card { min-width: 0; padding: 11px; border: 1px solid var(--sf-line-soft); border-radius: 10px; background: var(--sf-surface-2); }
.shot-card.is-confirmed .shot-field textarea { border-color: transparent; background: transparent; }
.shot-head { display: flex; align-items: center; gap: 7px; min-height: 26px; color: var(--sf-ink-3); font-size: 10px; }
.shot-head strong { color: var(--sf-terra-strong); font-size: 11px; }
.shot-number { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 6px; background: var(--sf-surface); color: var(--sf-ink-2); font-family: var(--sf-font-mono); }
.shot-reference-status, .shot-production-status { margin-left: auto; font-size: 9px; }
.shot-reference-status.is-ready, .shot-production-status.is-succeeded { color: #337247; }
.shot-reference-status.is-running, .shot-production-status.is-running { color: #9a5a12; }
.shot-reference-status.is-failed, .shot-production-status.is-failed { color: #b14b3c; }
.shot-reference-status.is-pending { color: #9a5a12; }
.shot-media { position: relative; display: grid; height: 156px; margin-top: 9px; overflow: hidden; place-items: center; border-radius: 7px; background: #e9e7e0; }
.shot-media img, .shot-media video { width: 100%; height: 100%; object-fit: contain; background: #e9e7e0; }
.shot-media-source { position: absolute; right: 6px; bottom: 6px; padding: 3px 6px; border-radius: 4px; background: rgba(31, 34, 30, .72); color: #fff; font-size: 8px; pointer-events: none; }
.shot-media-empty { display: flex; align-items: center; flex-direction: column; gap: 7px; color: var(--sf-ink-3); }
.shot-media-mark { color: var(--sf-terra-strong); font-family: var(--sf-font-serif); font-size: 28px; }
.shot-media-empty small { font-size: 9px; }
.shot-error { margin: 7px 0 0; color: #b14b3c; font-size: 9px; line-height: 1.5; }
.shot-field { display: block; margin-top: 10px; }
.shot-field > span { display: block; margin-bottom: 5px; color: var(--sf-ink-3); font-size: 9px; }
.shot-field textarea, .shot-revision textarea { box-sizing: border-box; width: 100%; resize: vertical; border: 1px solid var(--sf-line-soft); border-radius: 6px; outline: none; background: var(--sf-surface); color: var(--sf-ink-2); font-family: inherit; font-size: 10px; line-height: 1.6; }
.shot-field textarea { min-height: 92px; padding: 8px; }
.shot-field textarea:focus, .shot-revision textarea:focus { border-color: var(--sf-terra); }
.shot-field textarea[readonly] { resize: none; }
.shot-card-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
.shot-duration { display: flex; align-items: center; gap: 5px; color: var(--sf-ink-3); font-size: 9px; }
.shot-duration input { box-sizing: border-box; width: 45px; padding: 4px; border: 1px solid var(--sf-line-soft); border-radius: 5px; background: var(--sf-surface); color: var(--sf-ink-2); font-family: inherit; font-size: 10px; text-align: center; }
.shot-card-footer small { color: var(--sf-ink-3); font-size: 8px; }
.shot-media-actions { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; }
.shot-media-actions > span { overflow: hidden; color: var(--sf-ink-3); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.shot-upload { flex: none; padding: 5px 7px; border: 1px solid var(--sf-line-soft); border-radius: 5px; background: var(--sf-surface); color: var(--sf-ink-2); font-size: 9px; cursor: pointer; }
.shot-upload.disabled { cursor: default; opacity: .5; }
.shot-upload input { display: none; }
.shot-revision { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin-top: 7px; }
.shot-revision textarea { min-height: 34px; padding: 6px 7px; resize: none; }
.shot-revision button { align-self: stretch; padding: 5px 8px; border: 1px solid var(--sf-terra); border-radius: 6px; background: transparent; color: var(--sf-terra-strong); font-family: inherit; font-size: 9px; font-weight: 650; cursor: pointer; }
.shot-revision button:hover:not(:disabled) { background: var(--sf-terra-wash); }
.shot-revision button:disabled { cursor: default; opacity: .5; }
.storyboard-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 20px; border-top: 1px solid var(--sf-line-soft); background: var(--sf-surface-2); }
.storyboard-footer strong { color: var(--sf-ink); font-size: 11px; }
.storyboard-footer p { margin: 3px 0 0; color: var(--sf-ink-3); font-size: 10px; line-height: 1.5; }
.storyboard-footer button { flex: none; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--sf-terra-strong); color: white; font-family: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }
.storyboard-footer button:disabled { cursor: default; opacity: .5; }
.confirmed-note { flex: none; color: #337247; font-size: 10px; }
.storyboard-empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; }
.storyboard-empty-mark { display: grid; width: 42px; height: 42px; place-items: center; border: 1px dashed var(--sf-terra); border-radius: 12px; color: var(--sf-terra-strong); font-family: var(--sf-font-serif); font-size: 24px; }
.storyboard-empty h2 { margin: 14px 0 6px; color: var(--sf-ink); font-size: 17px; }
.storyboard-empty p { max-width: 560px; margin: 0; color: var(--sf-ink-3); font-size: 11px; line-height: 1.8; }
.storyboard-empty > span:last-child { margin-top: 12px; color: var(--sf-ink-3); font-size: 10px; }
@media (max-width: 900px) {
  .storyboard-shots { grid-template-columns: 1fr; }
  .storyboard-footer { align-items: flex-start; flex-direction: column; }
}
</style>
