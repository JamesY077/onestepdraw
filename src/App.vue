<template>
  <div class="app-shell">
    <ClickSpark
      class-name="sf-clickspark"
      :spark-color="['rgba(180, 85, 58, 0.85)', 'rgba(92, 98, 71, 0.7)']"
      :spark-count="7"
      :spark-size="5"
      :spark-radius="20"
      :spark-width="1.25"
      :duration="480"
      :randomness="0.45"
      :glow="0.12"
      :ring="false"
      shape="streak"
      easing="ease-out"
      :disabled="reduced"
    >
      <main class="app-main">
        <router-view v-slot="{ Component, route }">
          <transition name="sf-page" mode="out-in">
            <component :is="Component" :key="route.name || route.path" />
          </transition>
        </router-view>
      </main>
    </ClickSpark>
    <AddToProjectDialog />
    <AppDialog />
  </div>
</template>

<script setup lang="ts">
import AddToProjectDialog from '@/components/common/AddToProjectDialog.vue'
import AppDialog from '@/components/common/AppDialog.vue'
import ClickSpark from '@/components/bits/ClickSpark.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'

const reduced = useReducedMotion()
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
  /* 页面进入时的 8px 位移不能撑高根文档，否则会闪现右侧滚动条。 */
  overflow: clip;
}
</style>
