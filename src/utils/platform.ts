/**
 * 运行环境判断。
 *
 * 桌面版由 Electron 打开，index.html 会在首屏渲染前给 <html> 打上
 * `is-desktop-app` / `mac-app`，所以这里在模块加载时读一次就够了。
 */

export const IS_DESKTOP_APP =
  typeof document !== 'undefined' &&
  document.documentElement.classList.contains('is-desktop-app')

export const IS_MAC_APP = IS_DESKTOP_APP && document.documentElement.classList.contains('mac-app')

/** 「当前浏览器会话中」 / 「这台设备的应用会话中」 */
export const SESSION_SCOPE = IS_DESKTOP_APP ? '这台设备的应用会话中' : '当前浏览器会话中'

/** 「当前浏览器中」 / 「这台设备上」 */
export const STORAGE_SCOPE = IS_DESKTOP_APP ? '这台设备上' : '当前浏览器中'
