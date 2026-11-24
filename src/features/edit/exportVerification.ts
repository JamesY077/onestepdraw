import type { EditProject } from '@/types/edit'

/** 导出后的规格校验结果：只报告问题，不改动文件。 */
export interface ExportIssue {
  level: 'error' | 'warn'
  code: string
  message: string
}

export interface ExportSpec {
  width: number
  height: number
  duration: number
  hasAudio: boolean
  bytes: number
}

/** 运行时读到的实际文件信息（来自 mediabunny 解析或 Blob 大小）。 */
export interface ExportActual {
  width?: number
  height?: number
  duration?: number
  hasAudio?: boolean
}

const MAX_DRIFT_SECONDS = 0.25
const MIN_BYTES = 1024

function expectedDuration(project: EditProject): number {
  let end = 0
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      end = Math.max(end, clip.start + clip.duration)
    }
  }
  return end
}

/**
 * 导出规格校验：对照项目设置核对分辨率、时长与音轨，
 * 避免出现「导出成功但画面尺寸不对 / 时长被截断」这类静默问题。
 */
export function verifyExport(
  project: EditProject,
  spec: ExportSpec,
  actual: ExportActual,
): ExportIssue[] {
  const issues: ExportIssue[] = []

  if (actual.width && actual.width !== spec.width) {
    issues.push({
      level: 'error',
      code: 'width-mismatch',
      message: `宽度不符：预期 ${spec.width}px，实际 ${actual.width}px`,
    })
  }
  if (actual.height && actual.height !== spec.height) {
    issues.push({
      level: 'error',
      code: 'height-mismatch',
      message: `高度不符：预期 ${spec.height}px，实际 ${actual.height}px`,
    })
  }

  const expected = expectedDuration(project)
  if (actual.duration && expected > 0) {
    const drift = Math.abs(actual.duration - expected)
    if (drift > MAX_DRIFT_SECONDS) {
      issues.push({
        level: 'warn',
        code: 'duration-drift',
        message: `时长偏差 ${drift.toFixed(2)}s：时间轴 ${expected.toFixed(2)}s，文件 ${actual.duration.toFixed(2)}s`,
      })
    }
  }

  if (spec.hasAudio && actual.hasAudio === false) {
    issues.push({
      level: 'warn',
      code: 'audio-missing',
      message: '时间轴里有音频，但导出文件没有音轨（部分素材可能不支持混流）',
    })
  }

  if (spec.bytes < MIN_BYTES) {
    issues.push({ level: 'error', code: 'empty-file', message: `导出文件只有 ${spec.bytes} 字节，基本是空文件` })
  }

  return issues
}

/** 控制台/提示里用的一行结论。 */
export function summarizeIssues(issues: ExportIssue[]): string {
  if (!issues.length) return '导出规格校验通过'
  const errors = issues.filter((issue) => issue.level === 'error').length
  const warns = issues.length - errors
  if (errors) return `导出有问题：${errors} 项错误、${warns} 项提醒`
  return `导出完成，有 ${warns} 项提醒`
}
