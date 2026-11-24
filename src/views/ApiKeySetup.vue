<template>
  <div class="login-page">
    <header class="login-header">
      <div class="login-brand">
        <BrandMark :size="28" />
        <span>步帧</span>
      </div>
      <span class="local-pill">本地运行</span>
    </header>

    <main class="login-main">
      <section class="login-card" aria-labelledby="login-title">
        <div class="card-mark">
          <BrandMark :size="42" />
        </div>

        <h1 id="login-title">登录步帧</h1>
        <p class="card-copy">连接 AIPing API Key，开始与步帧对话。</p>

        <form class="login-form" @submit.prevent="handleSubmit">
          <div class="field">
            <label for="api-key">API Key</label>
            <div class="input-shell" :class="{ 'has-error': !!error && !apiBaseUrlInvalid }">
              <input
                id="api-key"
                ref="apiKeyInputRef"
                v-model="apiKey"
                :type="showKey ? 'text' : 'password'"
                class="text-input"
                placeholder="sk-..."
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="visibility-button"
                :aria-label="showKey ? '隐藏 API Key' : '显示 API Key'"
                @click="showKey = !showKey"
              >
                <svg v-if="!showKey" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
                  <circle cx="12" cy="12" r="2.7" />
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 4l16 16M9.9 6.2A9.5 9.5 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a16 16 0 0 1-3.2 3.9M6.4 7.6A16 16 0 0 0 2.5 12S6 18.2 12 18.2c1 0 1.9-.2 2.8-.5" />
                </svg>
              </button>
            </div>
          </div>

          <button type="button" class="advanced-toggle" @click="showAdvanced = !showAdvanced">
            <span>高级设置</span>
            <svg
              class="advanced-chevron"
              :class="{ open: showAdvanced }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          <div v-if="showAdvanced" class="advanced-panel">
            <label for="api-base-url">服务地址</label>
            <input
              id="api-base-url"
              v-model="apiBaseUrl"
              class="plain-input"
              placeholder="https://aiping.cn/api/v1"
              spellcheck="false"
            />
            <p class="field-hint">默认使用 AIPing 官方接口，一般无需修改。</p>
          </div>

          <div v-if="error" class="error-banner" role="alert">{{ error }}</div>

          <button type="submit" class="submit-button" :disabled="!apiKey.trim() || isLoading">
            <span v-if="!isLoading">连接并开始</span>
            <span v-else>正在验证连接…</span>
            <svg v-if="!isLoading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <span v-else class="loading-dot" aria-hidden="true" />
          </button>
        </form>

        <a class="key-helper" href="https://aiping.cn/user/apikey" target="_blank" rel="noopener noreferrer">
          获取 AIPing API Key
          <span aria-hidden="true">↗</span>
        </a>

        <p class="privacy-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
            <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
          </svg>
          API Key 只保存在{{ SESSION_SCOPE }}，不会上传到第三方服务器。
        </p>
      </section>
    </main>

    <footer class="login-footer">
      <span>步帧 Stepframe · Local AI Creative Agent</span>
      <span class="footer-dot" aria-hidden="true">·</span>
      <span>DeepSeek-V4.1-Flash-1017</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '@/components/agent/BrandMark.vue'
import { useApiStore } from '@/stores/apiStore'
import { AIPING_PUBLIC_API_BASE_URL, isOpenAiBaseUrlFormat } from '@/api/config'
import { SESSION_SCOPE } from '@/utils/platform'

const router = useRouter()
const route = useRoute()
const apiStore = useApiStore()

const apiKey = ref('')
const apiBaseUrl = ref(AIPING_PUBLIC_API_BASE_URL)
const showKey = ref(false)
const showAdvanced = ref(false)
const isLoading = ref(false)
const error = ref('')
const apiBaseUrlInvalid = ref(false)
const apiKeyInputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  if (route.query.expired) {
    error.value = '登录已过期，请重新连接 API Key。'
  }
  apiKeyInputRef.value?.focus()
})

function resolveRedirectTarget(): string {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect.trim() : ''
  if (!raw || !raw.startsWith('/')) return '/chat'
  if (raw.startsWith('/login') || raw.startsWith('/setup')) return '/chat'
  return raw
}

async function handleSubmit() {
  if (!apiKey.value.trim() || isLoading.value) return

  error.value = ''
  apiBaseUrlInvalid.value = false

  if (!isOpenAiBaseUrlFormat(apiBaseUrl.value)) {
    apiBaseUrlInvalid.value = true
    showAdvanced.value = true
    error.value = '服务地址格式不正确，请填写以 /v1 结尾的接口地址。'
    return
  }

  isLoading.value = true
  const ok = await apiStore.testAndSave(apiKey.value.trim(), apiBaseUrl.value.trim())
  isLoading.value = false

  if (ok) {
    router.replace(resolveRedirectTarget())
  } else {
    error.value = apiStore.connectionError || '连接失败，请检查 API Key 是否正确。'
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  display: flex;
  min-height: 100vh;
  min-height: 100dvh;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
  color: #1d1d1b;
}

.login-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 24px clamp(20px, 4vw, 40px);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #161614;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.local-pill {
  padding: 4px 10px;
  border: 1px solid #e7e7e1;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: #8e8e86;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.login-main {
  position: relative;
  z-index: 1;
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 28px 20px 44px;
}

.login-card {
  width: min(100%, 404px);
  padding: 34px 32px 26px;
  border: 1px solid #ecece6;
  border-radius: 20px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(17, 17, 16, 0.03),
    0 18px 50px rgba(17, 17, 16, 0.05);
}

.card-mark {
  display: flex;
  justify-content: center;
  margin-bottom: 18px;
  filter: drop-shadow(0 6px 16px rgba(17, 17, 16, 0.1));
}

.login-card h1 {
  margin: 0;
  color: #141412;
  font-family: var(--font-family-display);
  font-size: 25px;
  font-weight: 650;
  letter-spacing: -0.035em;
  text-align: center;
}

.card-copy {
  margin: 8px auto 26px;
  max-width: 320px;
  color: #8a8a82;
  font-size: 12.8px;
  line-height: 1.65;
  text-align: center;
}

.login-form {
  display: flex;
  flex-direction: column;
}

.field label,
.advanced-panel label {
  display: block;
  margin-bottom: 7px;
  color: #55554e;
  font-size: 12px;
  font-weight: 600;
}

.input-shell {
  display: flex;
  align-items: center;
  border: 1px solid #e3e3dc;
  border-radius: 11px;
  background: #ffffff;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}

.input-shell:focus-within {
  border-color: #b9b9b1;
  box-shadow: 0 0 0 3px rgba(17, 17, 16, 0.05);
}

.input-shell.has-error {
  border-color: #e3bcbc;
}

.text-input {
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0 12px;
  border: 0;
  outline: none;
  background: transparent;
  color: #1d1d1b;
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 13px;
  letter-spacing: 0.01em;
}

.text-input::placeholder {
  color: #b3b3ab;
  font-family: inherit;
}

.visibility-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: 4px;
  flex: none;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: #a0a098;
  cursor: pointer;
}

.visibility-button svg {
  width: 16px;
  height: 16px;
}

.visibility-button:hover {
  background: #f5f5f1;
  color: #5c5c54;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding: 4px 1px;
  border: 0;
  background: transparent;
  color: #91918a;
  font-size: 11.5px;
  cursor: pointer;
}

.advanced-toggle:hover {
  color: #4f4f48;
}

.advanced-chevron {
  width: 13px;
  height: 13px;
  color: #a3a39b;
  transition: transform 160ms ease;
}

.advanced-chevron.open {
  transform: rotate(180deg);
}

.advanced-panel {
  margin-top: 6px;
  padding: 12px;
  border: 1px solid #ecece6;
  border-radius: 10px;
  background: #fbfbf8;
}

.plain-input {
  width: 100%;
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid #e5e5de;
  border-radius: 8px;
  outline: none;
  background: #ffffff;
  color: #262623;
  font-family: 'SFMono-Regular', Menlo, Consolas, monospace;
  font-size: 12px;
}

.plain-input:focus {
  border-color: #bdbdb5;
}

.field-hint {
  margin-top: 7px;
  color: #a2a29a;
  font-size: 11px;
  line-height: 1.5;
}

.error-banner {
  margin-top: 13px;
  padding: 9px 11px;
  border: 1px solid #f0dede;
  border-radius: 8px;
  background: #fdf6f6;
  color: #a04444;
  font-size: 12px;
  line-height: 1.55;
}

.submit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  margin-top: 18px;
  border: 0;
  border-radius: 11px;
  background: #111111;
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, opacity 160ms ease, transform 160ms ease;
}

.submit-button svg {
  width: 15px;
  height: 15px;
}

.submit-button:hover:not(:disabled) {
  background: #2a2a27;
  transform: translateY(-1px);
}

.submit-button:disabled {
  background: #e9e9e4;
  color: #a8a8a0;
  cursor: not-allowed;
}

.loading-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: blink 900ms ease-in-out infinite;
}

.key-helper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 16px;
  color: #74746c;
  font-size: 11.5px;
  font-weight: 500;
  text-decoration: none;
}

.key-helper:hover {
  color: #141412;
}

.privacy-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #f0f0ea;
  color: #a3a39b;
  font-size: 10.5px;
  line-height: 1.55;
}

.privacy-note svg {
  width: 12px;
  height: 12px;
  flex: none;
  margin-top: 2px;
}

.login-footer {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  gap: 7px;
  padding: 0 20px 22px;
  color: #b0b0a8;
  font-size: 10.5px;
}

.footer-dot {
  color: #d0d0c9;
}

@keyframes blink {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

@media (max-width: 520px) {
  .login-header {
    padding: 18px 18px;
  }

  .login-card {
    padding: 28px 22px 22px;
    border-radius: 16px;
  }

  .login-main {
    padding-top: 12px;
  }

  .login-footer {
    flex-wrap: wrap;
  }
}
</style>
