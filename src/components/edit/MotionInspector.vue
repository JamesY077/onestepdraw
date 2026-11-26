<template>
  <section class="mi" aria-label="动效工程">
    <header class="mi-head">
      <span class="mi-tag">HyperFrames 动效工程</span>
      <a v-if="state.meta?.sourceUrl" :href="state.meta.sourceUrl" target="_blank" rel="noreferrer noopener">
        原作署名
      </a>
    </header>

    <p v-if="state.error" class="mi-error">{{ state.error }}</p>

    <div class="mi-preview">
      <hyperframes-player
        v-if="previewUrl"
        :key="previewKey"
        :src="previewUrl"
        :width="state.meta?.width || 1280"
        :height="state.meta?.height || 720"
        controls
        style="width: 100%; aspect-ratio: 16 / 10; background: #111"
      />
      <span v-else class="mi-loading">{{ state.loading ? '读取工程中…' : '工程不可用' }}</span>
    </div>

    <div v-if="state.variables.length" class="mi-block">
      <strong>模板参数</strong>
      <label v-for="variable in state.variables" :key="variable.id" class="mi-field">
        <span>{{ variable.label }}</span>
        <input
          v-if="variable.type === 'color'"
          type="color"
          :value="String(draft[variable.id] ?? variable.default ?? '#e2794f')"
          @change="commit(variable.id, ($event.target as HTMLInputElement).value)"
        />
        <select
          v-else-if="variable.type === 'enum'"
          :value="String(draft[variable.id] ?? variable.default ?? '')"
          @change="commit(variable.id, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="option in variable.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input
          v-else-if="variable.type === 'boolean'"
          type="checkbox"
          :checked="Boolean(draft[variable.id] ?? variable.default)"
          @change="commit(variable.id, ($event.target as HTMLInputElement).checked)"
        />
        <input
          v-else-if="variable.type === 'number'"
          type="number"
          step="0.1"
          :value="Number(draft[variable.id] ?? variable.default ?? 0)"
          @change="commit(variable.id, Number(($event.target as HTMLInputElement).value))"
        />
        <textarea
          v-else
          rows="2"
          :value="String(draft[variable.id] ?? variable.default ?? '')"
          @change="commit(variable.id, ($event.target as HTMLTextAreaElement).value)"
        />
      </label>
      <p v-if="paramNotice" class="mi-note">{{ paramNotice }}</p>
    </div>

    <div class="mi-block">
      <button type="button" class="mi-toggle" @click="sourceOpen = !sourceOpen">
        {{ sourceOpen ? '收起源码' : '查看 / 修改工程源码' }}
      </button>
      <template v-if="sourceOpen">
        <textarea v-model="sourceDraft" class="mi-source" spellcheck="false" rows="14" />
        <div class="mi-row">
          <button type="button" class="mi-ghost" :disabled="state.saving" @click="reloadSource">还原</button>
          <button type="button" class="mi-primary" :disabled="state.saving" @click="saveSource">
            {{ state.saving ? '保存中…' : '保存并刷新预览' }}
          </button>
        </div>
      </template>
    </div>

    <div class="mi-block">
      <strong>渲染导出</strong>
      <p class="mi-hint">用 HyperFrames CLI 在本机渲染 MP4，与预览是同一工程、同一组参数。</p>
      <button type="button" class="mi-primary mi-render" :disabled="state.renderStatus === 'running'" @click="renderNow">
        {{ state.renderStatus === 'running' ? '正在渲染…' : '渲染为 MP4' }}
      </button>
      <p v-if="state.renderError" class="mi-error">{{ state.renderError }}</p>
      <pre v-if="state.renderStatus === 'failed' && state.renderLog" class="mi-log">{{ state.renderLog }}</pre>
      <div v-if="state.renderUrl" class="mi-result">
        <video :src="state.renderUrl" controls playsinline />
        <button type="button" class="mi-primary" @click="applyRender">把 MP4 放回时间轴原位</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import '@hyperframes/player'
import { useMotionStore } from '@/stores/motionStore'
import { useEditProjectStore } from '@/stores/editProjectStore'
import type { TimelineClip } from '@/types/edit'

const props = defineProps<{ projectId: string; clip: TimelineClip }>()

const motion = useMotionStore()
const projects = useEditProjectStore()

const motionId = computed(() => props.clip.motionId || '')
const state = computed(() => motion.stateOf(motionId.value))
const sourceOpen = ref(false)
const sourceDraft = ref('')
const previewKey = ref(0)
const draft = reactive<Record<string, unknown>>({})
const paramNotice = ref('')

const previewUrl = computed(() =>
  motionId.value ? `${location.origin}/local/motion/file?id=${encodeURIComponent(motionId.value)}&path=index.html` : '',
)

watch(
  motionId,
  async (id) => {
    if (!id) return
    const loaded = await motion.load(id)
    sourceDraft.value = loaded.source || ''
    Object.keys(draft).forEach((key) => delete draft[key])
    Object.assign(draft, loaded.meta?.params || {})
    previewKey.value += 1
  },
  { immediate: true },
)

function reloadSource() {
  sourceDraft.value = state.value.source || ''
}

async function saveSource() {
  await motion.saveSource(motionId.value, sourceDraft.value)
  previewKey.value += 1
}

async function commit(id: string, value: unknown) {
  draft[id] = value
  try {
    await motion.setParams(motionId.value, { ...draft })
    previewKey.value += 1
    paramNotice.value = '参数已写入工程，预览与渲染同步更新。'
  } catch (error) {
    paramNotice.value = String((error as Error)?.message || error)
  }
}

async function renderNow() {
  try {
    await motion.render(motionId.value)
  } catch {
    // 错误已写进 state.renderError。
  }
}

function applyRender() {
  const url = state.value.renderUrl
  if (!url) return
  projects.replaceMotionClipWithVideo(props.projectId, props.clip.id, {
    url,
    name: props.clip.name,
    duration: props.clip.duration,
  })
}
</script>

<style scoped>
.mi {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--sf-line, #eee4dc);
}

.mi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
}

.mi-tag {
  padding: 3px 8px;
  border-radius: 999px;
  background: #f7ece5;
  color: #9c4f31;
}

.mi-head a {
  color: #a3542f;
  text-decoration: none;
}

.mi-preview {
  overflow: hidden;
  border-radius: 10px;
  background: #111;
}

.mi-loading {
  display: block;
  padding: 32px 0;
  text-align: center;
  font-size: 11px;
  color: #a3948a;
}

.mi-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mi-block > strong {
  font-size: 11.5px;
  color: var(--sf-ink-2, #4c413a);
}

.mi-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: #8a7c73;
}

.mi-field input[type='text'],
.mi-field input[type='number'],
.mi-field select,
.mi-field textarea {
  padding: 6px 8px;
  border: 1px solid #e8ded7;
  border-radius: 7px;
  background: #fff;
  font-size: 12px;
  color: #2c2521;
  font-family: inherit;
}

.mi-field input[type='color'] {
  width: 48px;
  height: 28px;
  padding: 0;
  border: 1px solid #e8ded7;
  border-radius: 6px;
  background: #fff;
}

.mi-hint,
.mi-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.6;
  color: #a3948a;
}

.mi-toggle {
  align-self: flex-start;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 11.5px;
  color: #a3542f;
  cursor: pointer;
}

.mi-source {
  width: 100%;
  padding: 8px;
  border: 1px solid #e8ded7;
  border-radius: 8px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 10.5px;
  line-height: 1.6;
  color: #4c413a;
  background: #fffaf7;
}

.mi-row {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.mi-primary,
.mi-ghost {
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 11.5px;
  cursor: pointer;
}

.mi-primary {
  border: 0;
  background: #b45f3c;
  color: #fff;
}

.mi-ghost {
  border: 1px solid #e2d3c9;
  background: #fff;
  color: #6a584d;
}

.mi-primary:disabled {
  opacity: 0.55;
  cursor: default;
}

.mi-render {
  align-self: flex-start;
}

.mi-error {
  margin: 0;
  font-size: 11px;
  color: #b4472c;
}

.mi-log {
  max-height: 140px;
  overflow: auto;
  margin: 0;
  padding: 8px;
  border-radius: 8px;
  background: #2a2320;
  color: #e9d9cf;
  font-size: 10px;
  white-space: pre-wrap;
}

.mi-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mi-result video {
  width: 100%;
  border-radius: 8px;
  background: #111;
}

.mi-result .mi-primary {
  align-self: flex-start;
}
</style>
