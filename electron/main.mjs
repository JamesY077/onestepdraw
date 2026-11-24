/**
 * Stepframe 桌面版入口。
 *
 * 思路：把现有的本地服务直接跑在主进程里（同一份 server/local/server.mjs），
 * 窗口加载 http://127.0.0.1:<随机端口>。
 * 这样 /api 反代、/local/upload、素材磁盘存储和浏览器版完全一致，
 * 不需要为 App 再写一套协议。
 */
import { app, BrowserWindow, Menu, dialog, screen, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.setName('Stepframe')

app.setAboutPanelOptions({
  applicationName: 'Stepframe',
  applicationVersion: app.getVersion(),
  copyright: '本地 AI 创作助手',
  credits: '素材与项目只保存在这台设备上',
})

/** 素材落到用户数据目录，不写进 .app 包体（升级不会丢，也不会被签名校验拦下）。 */
process.env.ONESTEP_DATA_DIR = path.join(app.getPath('userData'), 'data')
process.env.ONESTEP_UPLOAD_LIMIT_BYTES = process.env.ONESTEP_UPLOAD_LIMIT_BYTES || '0'

let mainWindow = null
let serverHandle = null
let quitting = false

/**
 * 固定端口。
 * 渲染进程的数据（localStorage / sessionStorage / IndexedDB）按 scheme+host+port 隔离，
 * 所以 App 必须每次都用同一个端口，否则每次启动都会像是「数据丢了」。
 * 41739 是随手挑的不常用端口，避开浏览器版默认的 5500。
 */
const APP_PORT = Number(process.env.ONESTEP_APP_PORT || 41739)

/** 记住上次的窗口位置和尺寸，重开 App 回到原来的样子。 */
const windowStateFile = () => path.join(app.getPath('userData'), 'window-state.json')

function readWindowState() {
  try {
    const saved = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'))
    if (!saved || typeof saved !== 'object') return null
    const { x, y, width, height, maximized } = saved
    if (!Number.isFinite(width) || !Number.isFinite(height)) return null
    // 屏幕被拔掉或分辨率变化时，避免窗口飞到看不见的地方。
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const visible = screen.getAllDisplays().some((display) => {
        const area = display.workArea
        return x < area.x + area.width - 80 && x + width > area.x + 80 &&
          y < area.y + area.height - 40 && y + height > area.y + 40
      })
      if (!visible) return { width, height, maximized }
    }
    return { x, y, width, height, maximized }
  } catch {
    return null
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.isMaximized() ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  try {
    fs.writeFileSync(
      windowStateFile(),
      JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }),
    )
  } catch {
    // 窗口状态只是便利功能，写不进去不影响使用。
  }
}

function openExternal(url) {
  if (/^https?:/i.test(url)) void shell.openExternal(url)
}

async function createWindow() {
  const { startServer } = await import('../server/local/server.mjs')
  // 端口必须固定：localStorage / IndexedDB 都按 origin 隔离，
  // 端口一变（随机端口）对话记录和项目就会「消失」。
  serverHandle = await startServer({ port: APP_PORT, open: false, quiet: true })
  console.log(`[stepframe] ${serverHandle.url}`)
  if (serverHandle.port !== APP_PORT) {
    console.warn(
      `[stepframe] 端口 ${APP_PORT} 被占用，已改用 ${serverHandle.port}；本次启动看不到历史项目与对话。`,
    )
  }

  const saved = readWindowState()
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 950,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1200,
    minHeight: 680,
    title: 'Stepframe',
    backgroundColor: '#faf9f5',
    // 内容延伸到标题栏下，红绿灯由前端留出的顶栏区域承接。
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 22 },
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  if (saved?.maximized) mainWindow.maximize()

  // 页面自己的 title 会把窗口标题改回中文项目名，这里锁成 App 名。
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow?.setTitle('Stepframe')
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(serverHandle.url)) return { action: 'allow' }
    openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(serverHandle.url)) return
    event.preventDefault()
    openExternal(url)
  })

  // 导出视频 / 导出工程走系统「另存为」，避免落到默认下载目录找不到。
  mainWindow.webContents.session.on('will-download', (event, item) => {
    const target = dialog.showSaveDialogSync(mainWindow, {
      title: '保存文件',
      defaultPath: item.getFilename(),
    })
    if (target) item.setSavePath(target)
  })

  // 记住窗口尺寸；关闭时再存一次，避免漏掉最后一次拖动。
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) {
    mainWindow.on(event, saveWindowState)
  }
  mainWindow.on('close', saveWindowState)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  await mainWindow.loadURL(serverHandle.url)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: 'Stepframe',
            submenu: [
              { role: 'about', label: '关于 Stepframe' },
              { type: 'separator' },
              { role: 'hide', label: '隐藏 Stepframe' },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: '退出 Stepframe' },
            ],
          },
          {
            label: '编辑',
            submenu: [
              { role: 'undo', label: '撤销' },
              { role: 'redo', label: '重做' },
              { type: 'separator' },
              { role: 'cut', label: '剪切' },
              { role: 'copy', label: '复制' },
              { role: 'paste', label: '粘贴' },
              { role: 'selectAll', label: '全选' },
            ],
          },
          {
            label: '视图',
            submenu: [
              { role: 'reload', label: '重新载入' },
              { role: 'toggleDevTools', label: '开发者工具' },
              { type: 'separator' },
              { role: 'resetZoom', label: '实际大小' },
              { role: 'zoomIn', label: '放大' },
              { role: 'zoomOut', label: '缩小' },
              { type: 'separator' },
              { role: 'togglefullscreen', label: '全屏' },
            ],
          },
          {
            label: '窗口',
            submenu: [
              { role: 'minimize', label: '最小化' },
              { role: 'zoom', label: '缩放' },
              { role: 'close', label: '关闭窗口' },
            ],
          },
        ]),
      )
    }

    try {
      await createWindow()
    } catch (error) {
      dialog.showErrorBox('Stepframe 启动失败', String(error?.message || error))
      app.quit()
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    if (quitting) return
    quitting = true
    void serverHandle?.close?.()
  })
}
