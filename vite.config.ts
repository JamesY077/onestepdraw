import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5500,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'https://aiping.cn',
        changeOrigin: true,
        secure: false,
      },
      // V2Fun 产物（高斯点云 PLY / 预览视频）放在 oss-cn-1.v2fun.art，
      // 该 OSS 桶不返回 CORS 头，浏览器必须走同源反代才能读取模型字节。
      // 生产环境对应 Nginx 的 location /v2fun-assets/（见 DEPLOYMENT.md）。
      '/v2fun-assets': {
        target: 'https://oss-cn-1.v2fun.art',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/v2fun-assets/, ''),
      },
      // Seedream 生成图存放在 volces 的 TOS 桶，同样不返回 CORS 头。
      // 前端把背景图换成 Blob URL 后才能参与画布导出（否则 PNG 会被跨域污染）。
      // 生产环境对应 Nginx 的 location /ai-image-assets/（见 DEPLOYMENT.md）。
      '/ai-image-assets': {
        target: 'https://ark-acg-cn-beijing.tos-cn-beijing.volces.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/ai-image-assets/, ''),
      },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5500,
    strictPort: true,
  },
  build: {
    // /model3d 是懒加载路由，three.js + Spark 高斯渲染器让该 chunk 到 ~3.3MB
    //（gzip 后 ~1.1MB），只影响进入 3D 工作台的用户，不影响首屏；阈值按此上调。
    chunkSizeWarningLimit: 3600,
  },
})
