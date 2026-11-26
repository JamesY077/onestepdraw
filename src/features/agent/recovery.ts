import type { AgentGeneration, AgentMessage } from '@/types/agent'

/** 页面刷新不会复活旧 Promise；把未闭合运行诚实标记为可重试的中断。 */
export function recoverInterruptedMessage(message: AgentMessage): AgentMessage {
  const interrupted = message.status === 'streaming' || message.run?.status === 'running'
  const recoverGeneration = (generation: AgentGeneration): AgentGeneration =>
    generation.status === 'running'
      ? {
          ...generation,
          status: 'failed',
          error: '页面刷新中断了本地等待，远端任务状态未知；请确认后重试。',
        }
      : generation
  return {
    ...message,
    status: message.status === 'streaming' ? 'stopped' : message.status,
    generation: message.generation ? recoverGeneration(message.generation) : undefined,
    generations: message.generations?.map(recoverGeneration),
    run: message.run
      ? {
          ...message.run,
          status: interrupted ? 'stopped' : message.run.status,
          phase: interrupted ? 'done' : message.run.phase,
          updatedAt: interrupted ? Date.now() : message.run.updatedAt,
          activities: message.run.activities.map((activity) =>
            activity.status === 'running'
              ? {
                  ...activity,
                  status: 'stopped',
                  summary: '页面刷新，执行状态已中断',
                  finishedAt: Date.now(),
                }
              : activity,
          ),
        }
      : undefined,
  }
}
