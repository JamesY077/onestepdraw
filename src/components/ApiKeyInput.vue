<template>
  <div class="api-key-input">
    <label>API 密钥</label>
    <div class="input-wrapper">
      <input :type="showKey ? 'text' : 'password'" v-model="localKey" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx" />
      <button type="button" class="toggle-visibility" @click="showKey = !showKey">
        {{ showKey ? '隐藏' : '显示' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const localKey = ref(props.modelValue)
const showKey = ref(false)

watch(localKey, (value) => emit('update:modelValue', value))
watch(() => props.modelValue, (value) => {
  localKey.value = value
})
</script>

<style scoped>
.api-key-input {
  width: 100%;
}

label {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.input-wrapper {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 46px;
  overflow: hidden;
  border: 1px solid rgba(17, 17, 16, 0.12);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: none;
}

input {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 16px;
  border: 0;
  background: transparent;
  color: rgba(29, 29, 27, 0.92);
  outline: none;
}

.input-wrapper:focus-within {
  border-color: #b9b9b1;
  box-shadow: 0 0 0 3px rgba(17, 17, 16, 0.06);
}

input::placeholder {
  color: rgba(29, 29, 27, 0.38);
}

.toggle-visibility {
  flex-shrink: 0;
  align-self: stretch;
  min-height: 44px;
  padding: 0 14px;
  border: 0;
  border-left: 1px solid rgba(17, 17, 16, 0.10);
  background: rgba(17, 17, 16, 0.08);
  color: rgba(29, 29, 27, 0.72);
  font-size: 13px;
  font-weight: 600;
}

.toggle-visibility:hover {
  background: rgba(17, 17, 16, 0.12);
  color: rgba(29, 29, 27, 0.92);
}
</style>
