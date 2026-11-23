<template>
  <div class="app-shell">
    <main class="app-main">
      <router-view />
    </main>
    <AddToProjectDialog />
  </div>
</template>

<script setup lang="ts">
import AddToProjectDialog from '@/components/common/AddToProjectDialog.vue'
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
