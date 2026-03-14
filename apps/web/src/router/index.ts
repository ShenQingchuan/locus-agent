import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

const routes: readonly RouteRecordRaw[] = [
  {
    path: '/',
    name: 'ChatView',
    component: () => import('@/views/ChatView.vue'),
  },
  {
    path: '/memories',
    name: 'MemoriesView',
    component: () => import('@/views/MemoriesView.vue'),
  },
  {
    path: '/settings',
    name: 'SettingsView',
    component: () => import('@/views/SettingsView.vue'),
  },
  {
    path: '/skills',
    name: 'SkillsView',
    meta: { keepAlive: true },
    component: () => import('@/views/SkillsView.vue'),
  },
  {
    path: '/coding',
    name: 'CodingView',
    meta: { keepAlive: true },
    component: () => import('@/views/CodingView.vue'),
  },
]

export const keepAliveRoutes = routes.filter(route => route.meta?.keepAlive).map(route => route.name as string)

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

export default router
