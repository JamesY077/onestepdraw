<template>
  <div class="camera-guide" ref="rootRef">
    <button
      type="button"
      class="camera-guide-trigger"
      :class="{ compact }"
      :aria-expanded="open"
      title="查看 MiniMax 海螺系列运镜指令"
      @click.stop="toggle"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <rect x="3" y="7" width="12" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M15 10l5-3v10l-5-3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      <span>运镜指令</span>
    </button>

    <div v-if="open" class="camera-guide-popover" @click.stop>
      <div class="camera-guide-head">
        <strong>运镜指令</strong>
        <button type="button" class="camera-guide-close" aria-label="关闭" @click="open = false">×</button>
      </div>

      <p class="camera-guide-desc">
        对 MiniMax-Hailuo-2.3（文生 / 图生 / 首尾帧），可在 prompt 中用 <b>[指令]</b> 控制运镜。点击下方指令可直接插入到提示词中。
      </p>

      <div class="camera-guide-groups">
        <div v-for="group in CAMERA_GROUPS" :key="group.title" class="camera-guide-group">
          <span class="camera-guide-group-title">{{ group.title }}</span>
          <div class="camera-guide-tags">
            <button
              v-for="cmd in group.commands"
              :key="cmd"
              type="button"
              class="camera-guide-tag"
              :title="'插入 ' + cmd"
              @click="handleInsert(cmd)"
            >
              {{ cmd }}
            </button>
          </div>
        </div>
      </div>

      <ul class="camera-guide-tips">
        <li><b>组合运镜：</b>同一组 <code>[]</code> 内可组合多个指令（建议 ≤3 个），如 <code>[左摇,上升]</code>。</li>
        <li><b>顺序运镜：</b>prompt 中前后出现的指令会依次生效，如「…[推进]，然后…[拉远]」。</li>
        <li>也支持自然语言描述运镜，但使用标准指令可获得更准确的效果。</li>
      </ul>

      <div class="camera-guide-example">
        <span class="camera-guide-example-label">示例</span>
        <code>A man picks up a book [上升], then reads [固定].</code>
        <button type="button" class="camera-guide-example-insert" @click="handleInsert('A man picks up a book [上升], then reads [固定].')">
          插入示例
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * 运镜指令提示组件（MiniMax 海螺系列：文生 / 图生 / 首尾帧）。
 * 展示 MiniMax-Hailuo-2.3 在 prompt 中可用的 [指令] 运镜控制，
 * 用户可对照查看，并点击指令 / 示例直接插入到提示词中。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{ compact?: boolean }>()

const emit = defineEmits<{ (e: 'insert', text: string): void }>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const CAMERA_GROUPS: Array<{ title: string; commands: string[] }> = [
  { title: '左右移', commands: ['[左移]', '[右移]'] },
  { title: '左右摇', commands: ['[左摇]', '[右摇]'] },
  { title: '推拉', commands: ['[推进]', '[拉远]'] },
  { title: '升降', commands: ['[上升]', '[下降]'] },
  { title: '上下摇', commands: ['[上摇]', '[下摇]'] },
  { title: '变焦', commands: ['[变焦推近]', '[变焦拉远]'] },
  { title: '其他', commands: ['[晃动]', '[跟随]', '[固定]'] },
]

function toggle() {
  open.value = !open.value
}

function handleInsert(text: string) {
  emit('insert', text)
}

function handleClickOutside(event: MouseEvent) {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    open.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', handleClickOutside))
</script>

<style scoped>
.camera-guide {
  position: relative;
  display: inline-flex;
}

.camera-guide-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 12px;
  line-height: 1;
  color: rgba(29, 29, 27, 0.66);
  background: rgba(17, 17, 16, 0.06);
  border: 1px solid rgba(17, 17, 16, 0.12);
  border-radius: 999px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.camera-guide-trigger:hover {
  color: rgba(29, 29, 27, 0.92);
  border-color: #b9b9b1;
  background: rgba(17, 17, 16, 0.10);
}
.camera-guide-trigger.compact {
  padding: 4px 8px;
  font-size: 11px;
}

.camera-guide-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 50;
  width: 320px;
  max-width: min(320px, 86vw);
  padding: 14px;
  background: #ffffff;
  border: 1px solid #e8e8e2;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(17, 17, 16, 0.12);
  text-align: left;
}

.camera-guide-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.camera-guide-head strong {
  font-size: 13px;
  color: rgba(29, 29, 27, 0.92);
}
.camera-guide-close {
  width: 20px;
  height: 20px;
  line-height: 18px;
  font-size: 16px;
  color: rgba(29, 29, 27, 0.55);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.camera-guide-close:hover {
  background: rgba(17, 17, 16, 0.08);
  color: rgba(29, 29, 27, 0.9);
}

.camera-guide-desc {
  margin: 0 0 10px;
  font-size: 11.5px;
  line-height: 1.6;
  color: rgba(29, 29, 27, 0.66);
}
.camera-guide-desc b {
  color: #111110;
}

.camera-guide-groups {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}
.camera-guide-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.camera-guide-group-title {
  flex: 0 0 52px;
  font-size: 11px;
  color: rgba(29, 29, 27, 0.45);
}
.camera-guide-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.camera-guide-tag {
  padding: 3px 8px;
  font-size: 11.5px;
  line-height: 1.4;
  color: #1d1d1b;
  background: #f5f5f1;
  border: 1px solid #e0e0d9;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.camera-guide-tag:hover {
  background: #ecece7;
  border-color: #b9b9b1;
}

.camera-guide-tips {
  margin: 0 0 10px;
  padding-left: 16px;
  font-size: 11px;
  line-height: 1.7;
  color: rgba(29, 29, 27, 0.66);
}
.camera-guide-tips b {
  color: rgba(29, 29, 27, 0.92);
}
.camera-guide-tips code {
  padding: 0 3px;
  font-size: 10.5px;
  background: rgba(17, 17, 16, 0.08);
  border-radius: 4px;
}

.camera-guide-example {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  background: #f5f5f1;
  border: 1px dashed #d2d2ca;
  border-radius: 8px;
}
.camera-guide-example-label {
  font-size: 10.5px;
  color: rgba(29, 29, 27, 0.45);
}
.camera-guide-example code {
  flex: 1 1 100%;
  font-size: 11.5px;
  line-height: 1.5;
  color: #e6dfff;
}
.camera-guide-example-insert {
  margin-left: auto;
  padding: 3px 10px;
  font-size: 11px;
  color: #ffffff;
  background: #111111;
  border: none;
  border-radius: 999px;
  cursor: pointer;
}
.camera-guide-example-insert:hover {
  opacity: 0.92;
}
</style>
