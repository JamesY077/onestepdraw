/**
 * 选择工作区目录。
 *
 * 桌面 App 里走系统自带的目录面板（Electron 原生 dialog），
 * 浏览器环境下没有这个能力，返回 null 由调用方退回手动输入。
 */
interface DesktopBridge {
  chooseDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>
}

declare global {
  interface Window {
    stepframeDesktop?: DesktopBridge
  }
}

export function hasNativeDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && Boolean(window.stepframeDesktop?.chooseDirectory)
}

export async function chooseDirectoryNative(defaultPath?: string): Promise<string | null> {
  const bridge = window.stepframeDesktop
  if (!bridge?.chooseDirectory) return null
  try {
    const picked = await bridge.chooseDirectory({ title: '选择工作区目录', defaultPath })
    return typeof picked === 'string' && picked.trim() ? picked : null
  } catch {
    return null
  }
}

/** 登记目录前先在服务端确保目录存在。 */
export async function ensureDirectory(path: string): Promise<{ ok: boolean; path: string; error?: string }> {
  try {
    const response = await fetch('/local/workspace/ensure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    const data = (await response.json()) as { ok?: boolean; path?: string; error?: string }
    return { ok: Boolean(data.ok), path: data.path || path, error: data.error }
  } catch (error) {
    return { ok: false, path, error: (error as Error)?.message || '无法访问本地服务' }
  }
}
