<template>
  <div class="app-shell">
    <main class="app-main">
      <router-view />
    </main>
    <AddToProjectDialog />
    <TemplateLibrary />
    <AppDialog />
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import AddToProjectDialog from '@/components/common/AddToProjectDialog.vue'
import AppDialog from '@/components/common/AppDialog.vue'

// 341 条内置模板的数据不小，抽屉第一次打开时再加载。
const TemplateLibrary = defineAsyncComponent(
  () => import('@/components/template/TemplateLibrary.vue'),
)
</script>

<style>
#app {
  min-height: 100vh;
  min-height: 100dvh;
}

.app-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

.app-main {
  flex: 1;
  min-height: 0;
}
</style>
