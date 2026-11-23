import { createRouter, createWebHistory, type RouteLocation } from 'vue-router'
import { hasActiveApiSession, invalidateExpiredApiSession } from '@/api/config'

const routes = [
  {
    // 首页已下线：已登录直接进入对话，未登录进入登录页。
    path: '/',
    redirect: () => (hasActiveApiSession() ? '/chat' : '/login'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/ApiKeySetup.vue'),
    meta: { requiresNoAuth: true },
  },
  {
    // 旧登录入口兼容。
    path: '/setup',
    redirect: (to: RouteLocation) => ({ path: '/login', query: to.query }),
  },
  {
    path: '/home',
    redirect: '/',
  },
  {
    // 登录后的主界面：Codex 式对话页。
    path: '/chat/:id?',
    name: 'ChatAgent',
    component: () => import('@/views/ChatAgent.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/image',
    name: 'ImageCreate',
    component: () => import('@/views/ImageCreate.vue'),
    meta: { requiresAuth: true },
  },
  {
    // 对话式剪辑台：一个项目 = 时间轴 + 素材库 + 一段创作对话。
    path: '/edit/:id?',
    name: 'EditStudio',
    component: () => import('@/views/EditStudio.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/projects',
    redirect: '/edit',
  },
  {
    path: '/video',
    name: 'VideoCreate',
    component: () => import('@/views/ChatCreate.vue'),
    meta: { requiresAuth: true, mediaType: 'video' },
  },
  {
    // 旧入口兼容：按 query.type 转发到图片页或视频页。
    path: '/studio',
    redirect: (to: RouteLocation) => ({
      path: to.query.type === 'video' ? '/video' : '/image',
      query: to.query,
    }),
  },
  {
    path: '/voice',
    name: 'Voice',
    component: () => import('@/views/VoiceCreate.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/model3d',
    name: 'Model3D',
    component: () => import('@/views/Model3D.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/skill',
    name: 'SkillCreate',
    component: () => import('@/views/SkillCreate.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/canvas',
    redirect: '/image',
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { requiresAuth: true },
  },
  {
    // 未匹配路径回首页。
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  invalidateExpiredApiSession()

  if (to.meta.requiresAuth && !hasActiveApiSession()) {
    next({ path: '/login', query: { redirect: to.fullPath } })
    return
  }

  if (to.path === '/login' && hasActiveApiSession() && !to.query.redirect) {
    next('/chat')
    return
  }

  next()
})

export default router
