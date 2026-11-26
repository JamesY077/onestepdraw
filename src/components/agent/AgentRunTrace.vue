<template>
  <details class="run-trace" :open="streaming">
    <summary>
      <span class="run-symbol" :class="{ 'is-running': streaming }" aria-hidden="true" />
      <span>{{ summary }}</span>
      <span class="run-step">第 {{ run.currentStep }} / {{ run.maxSteps }} 步</span>
    </summary>

    <div class="run-body">
      <ol v-if="run.plan.length" class="run-plan">
        <li v-for="item in run.plan" :key="item.id" :class="`is-${item.status}`">
          <span class="plan-marker" aria-hidden="true" />
          <span>{{ item.content }}</span>
        </li>
      </ol>

      <ul v-if="run.activities.length" class="run-activities">
        <li v-for="activity in run.activities" :key="`${activity.step}-${activity.id}`">
          <span class="activity-state" :class="`is-${activity.status}`" aria-hidden="true" />
          <div class="activity-copy">
            <div class="activity-title">
              <strong>{{ activity.title }}</strong>
              <span>{{ statusLabel(activity.status) }}</span>
            </div>
            <p v-if="activity.detail">{{ activity.detail }}</p>
            <small v-if="activity.summary">{{ activity.summary }}</small>
          </div>
        </li>
      </ul>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AgentRunState, AgentToolActivityStatus } from '@/types/agent'

const props = defineProps<{ run: AgentRunState; streaming: boolean }>()

const summary = computed(() => {
  if (props.run.status === 'running') {
    return props.run.phase === 'tool' ? '正在执行创作工具' : '正在思考下一步'
  }
  if (props.run.status === 'error') return '执行未完成'
  if (props.run.status === 'stopped') return '执行已停止'
  const count = props.run.activities.length
  return count ? `执行轨迹 · ${count} 项操作` : '执行轨迹'
})

function statusLabel(status: AgentToolActivityStatus): string {
  if (status === 'running') return '进行中'
  if (status === 'succeeded') return '完成'
  if (status === 'stopped') return '已停止'
  return '失败'
}
</script>

<style scoped>
.run-trace {
  margin-bottom: 12px;
  overflow: hidden;
  border: 1px solid #e9e8e2;
  border-radius: 11px;
  background: #fafaf7;
}

.run-trace summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 9px 12px;
  color: var(--sf-ink-2);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.run-trace summary::-webkit-details-marker {
  display: none;
}

.run-symbol {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--sf-terra);
}

.run-symbol.is-running {
  animation: run-pulse 1.4s ease-in-out infinite;
}

.run-step {
  margin-left: auto;
  color: var(--sf-ink-3);
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.run-body {
  padding: 0 12px 11px 27px;
  border-top: 1px solid #efeee9;
}

.run-plan,
.run-activities {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}

.run-plan {
  display: grid;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid #efeee9;
}

.run-plan li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  color: var(--sf-ink-2);
  font-size: 11px;
  line-height: 1.5;
}

.plan-marker {
  width: 6px;
  height: 6px;
  flex: none;
  margin-top: 5px;
  border: 1px solid #c8c7c0;
  border-radius: 50%;
}

.run-plan .is-in_progress {
  color: var(--sf-terra-strong);
}

.run-plan .is-in_progress .plan-marker {
  border-color: var(--sf-terra);
  background: var(--sf-terra);
}

.run-plan .is-completed {
  color: var(--sf-ink-3);
}

.run-plan .is-completed .plan-marker {
  border-color: #8f9b8c;
  background: #8f9b8c;
}

.run-activities {
  display: grid;
  gap: 11px;
}

.run-activities li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.activity-state {
  width: 6px;
  height: 6px;
  flex: none;
  margin-top: 6px;
  border-radius: 50%;
  background: #b8b7b0;
}

.activity-state.is-running {
  background: var(--sf-terra);
  animation: run-pulse 1.4s ease-in-out infinite;
}

.activity-state.is-succeeded {
  background: #81917c;
}

.activity-state.is-failed {
  background: #b9574d;
}

.activity-state.is-stopped {
  background: #aaa89f;
}

.activity-copy {
  min-width: 0;
  flex: 1;
}

.activity-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.activity-title strong {
  color: var(--sf-ink-2);
  font-size: 11px;
  font-weight: 600;
}

.activity-title span {
  margin-left: auto;
  color: var(--sf-ink-3);
  font-size: 9px;
}

.activity-copy p,
.activity-copy small {
  display: block;
  overflow-wrap: anywhere;
  margin: 2px 0 0;
  color: var(--sf-ink-3);
  font-size: 10px;
  line-height: 1.5;
}

.activity-copy small {
  color: #77776f;
}

@keyframes run-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .run-symbol.is-running,
  .activity-state.is-running {
    animation: none;
  }
}
</style>
