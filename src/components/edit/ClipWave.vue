<template>
  <canvas ref="canvasRef" class="clip-wave" aria-hidden="true" />
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { drawPeaks, loadAudioPeaks, type AudioPeaks } from '@/features/edit/waveform'

const props = defineProps<{
  url: string
  /** 片段从素材第几秒开始截取。 */
  offset: number
  /** 片段时间轴时长。 */
  span: number
  /** 片段像素宽度，用来判断是否需要重绘。 */
  widthPx: number
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const data = shallowRef<AudioPeaks | null>(null)
let disposed = false

function paint() {
  const canvas = canvasRef.value
  if (!canvas || !data.value) return
  drawPeaks(canvas, data.value, {
    offset: props.offset,
    span: props.span,
    color: 'rgba(74, 74, 66, 0.42)',
  })
}

onMounted(async () => {
  const peaks = await loadAudioPeaks(props.url)
  if (disposed) return
  data.value = peaks
  await nextTick()
  paint()
})

watch(
  () => [props.url, props.offset, props.span, Math.round(props.widthPx)] as const,
  async ([url], previous) => {
    if (previous && url !== previous[0]) {
      data.value = await loadAudioPeaks(url)
    }
    await nextTick()
    paint()
  },
)

onBeforeUnmount(() => {
  disposed = true
})
</script>

<style scoped>
.clip-wave {
  position: absolute;
  inset: 1px;
  width: calc(100% - 2px);
  height: calc(100% - 2px);
  pointer-events: none;
  opacity: 0.9;
}
</style>
