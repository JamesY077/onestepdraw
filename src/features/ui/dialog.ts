import { reactive } from 'vue'

/**
 * 应用内确认 / 提示弹窗。
 *
 * 浏览器原生 confirm / alert 在 Electron 与部分内嵌环境里样式割裂，
 * 这里统一成一个可复用的 Promise 接口：
 *   if (!(await confirmDialog({ ... }))) return
 */
export type DialogMode = 'confirm' | 'alert'

export interface DialogOptions {
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  /** 危险操作：确认按钮用赤陶色。 */
  danger?: boolean
}

interface DialogState {
  open: boolean
  mode: DialogMode
  title: string
  message: string
  confirmText: string
  cancelText: string
  danger: boolean
}

export const dialogState = reactive<DialogState>({
  open: false,
  mode: 'confirm',
  title: '',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  danger: false,
})

let resolver: ((confirmed: boolean) => void) | null = null

function open(options: DialogOptions, mode: DialogMode): Promise<boolean> {
  // 极端情况下连续触发：先把上一个弹窗按取消处理，避免 Promise 永远悬着。
  if (resolver) {
    const previous = resolver
    resolver = null
    previous(false)
  }
  dialogState.mode = mode
  dialogState.title = options.title || (mode === 'alert' ? '提示' : '确认操作')
  dialogState.message = options.message
  dialogState.confirmText = options.confirmText || (mode === 'alert' ? '知道了' : '确定')
  dialogState.cancelText = options.cancelText || '取消'
  dialogState.danger = !!options.danger
  dialogState.open = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function confirmDialog(options: DialogOptions): Promise<boolean> {
  return open(options, 'confirm')
}

export function alertDialog(options: DialogOptions): Promise<void> {
  return open(options, 'alert').then(() => undefined)
}

export function settleDialog(confirmed: boolean) {
  if (!dialogState.open) return
  dialogState.open = false
  const resolve = resolver
  resolver = null
  resolve?.(confirmed)
}
