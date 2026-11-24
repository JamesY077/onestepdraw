/**
 * 预加载脚本：只暴露一个能力 —— 用系统原生的目录选择面板挑工作区目录。
 * 渲染进程仍然运行在 sandbox + contextIsolation 下，拿不到 Node。
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('stepframeDesktop', {
  /** 打开系统目录选择面板；取消时返回 null。 */
  chooseDirectory: (options) => ipcRenderer.invoke('stepframe:choose-directory', options || {}),
})
