import { alertDialog } from '@/features/ui/dialog'

export class AppError extends Error {
  title: string
  code?: string

  constructor(message: string, options?: { title?: string; code?: string }) {
    super(message)
    this.name = 'AppError'
    this.title = options?.title || '提示'
    this.code = options?.code
  }
}

export function showErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。') {
  const message = error instanceof Error ? error.message : fallback
  void alertDialog({
    title: error instanceof AppError ? error.title : '提示',
    message: message || fallback,
  })
}

export function normalizeErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。') {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  return fallback
}