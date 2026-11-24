<template>
  <div class="login-page">
    <div class="login-ambient" aria-hidden="true">
      <DotGrid
        :dot-size="1.8"
        :gap="26"
        base-color="#d8cdbb"
        active-color="#b4553a"
        :proximity="130"
        :strength="0.55"
        :glow="0.08"
        :opacity="0.62"
        :fade="16"
        shape="circle"
        :mouse-interaction="!reduced"
        :click-shock="false"
        :intro="false"
      />
    </div>

    <header class="login-header">
      <div class="login-brand">
        <BrandMark :size="28" />
        <span class="sf-brand-name">Stepframe</span>
        <span class="sf-brand-cn">步帧</span>
      </div>
      <span class="local-pill">
        <i class="pill-dot" aria-hidden="true" />
        本地运行 · 数据不出设备
      </span>
    </header>

    <main class="login-main">
      <section class="login-story" aria-labelledby="login-story-title">
        <p class="sf-kicker">Local AI Creative Agent</p>
        <TextReveal
          id="login-story-title"
          tag="h1"
          class="login-title"
          text="把一句话，剪成一支片。"
          :delay="20"
          :duration="0.62"
          effect="rise"
          trigger="load"
        />
        <p class="login-lede">
          对话、生成、剪辑，都在同一张桌上完成。Stepframe 在这台电脑上工作，
          素材与对话只留在本地。
        </p>

        <ol class="login-points sf-stagger">
          <li>
            <span class="point-index sf-serif">01</span>
            <span class="point-body">
              <b>对话就是分镜</b>
              <em>把模糊的想法说清楚，镜头、光线与节奏会一起长出来。</em>
            </span>
          </li>
          <li>
            <span class="point-index sf-serif">02</span>
            <span class="point-body">
              <b>生成即入轨</b>
              <em>图片、视频、配音直接落进时间轴，不用来回导素材。</em>
            </span>
          </li>
          <li>
            <span class="point-index sf-serif">03</span>
            <span class="point-body">
              <b>改一句，重剪一段</b>
              <em>选中片段单独交给 AI，整条时间轴不必推倒重来。</em>
            </span>
          </li>
        </ol>
      </section>

      <section class="login-card" aria-labelledby="login-title">
        <div class="card-head">
          <div class="card-mark">
            <BrandMark :size="36" />
          </div>
          <div>
            <p class="card-kicker sf-kicker">Connect</p>
            <h2 id="login-title">连接 AIPing</h2>
          </div>
        </div>
        <p class="card-copy">填入 API Key，验证通过后就开始创作。</p>

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

          <MagneticAction>
            <button type="submit" class="submit-button" :disabled="!apiKey.trim() || isLoading">
              <span v-if="!isLoading">连接并开始</span>
              <span v-else>正在验证连接…</span>
              <svg v-if="!isLoading" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
              <span v-else class="loading-dot" aria-hidden="true" />
            </button>
          </MagneticAction>
        </form>

        <div class="card-links">
          <a class="key-helper" href="https://aiping.cn/user/apikey" target="_blank" rel="noopener noreferrer">
            获取 AIPing API Key
            <span aria-hidden="true">↗</span>
          </a>
          <p class="privacy-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
              <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
            </svg>
            Key 只保存在{{ SESSION_SCOPE }}，不会上传到第三方服务器。
          </p>
        </div>
      </section>
    </main>

    <footer class="login-footer">
      <span class="sf-mono">Stepframe 1.0</span>
      <span class="footer-dot" aria-hidden="true">·</span>
      <span>Local AI Creative Agent</span>
      <span class="footer-dot" aria-hidden="true">·</span>
      <span class="sf-mono">DeepSeek-V4.1-Flash-1017</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BrandMark from '@/components/agent/BrandMark.vue'
import DotGrid from '@/components/bits/DotGrid.vue'
import MagneticAction from '@/components/ui/MagneticAction.vue'
import TextReveal from '@/components/ui/TextReveal.vue'
import { useReducedMotion } from '@/composables/useReducedMotion'
import { useApiStore } from '@/stores/apiStore'
import { AIPING_PUBLIC_API_BASE_URL, isOpenAiBaseUrlFormat } from '@/api/config'
import { SESSION_SCOPE } from '@/utils/platform'

const router = useRouter()
const route = useRoute()
const apiStore = useApiStore()
const reduced = useReducedMotion()

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
  background: transparent;
  color: var(--sf-ink);
}

.login-ambient {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0.55;
  mask-image: radial-gradient(120% 90% at 50% 30%, #000 30%, transparent 78%);
  pointer-events: none;
}

.login-ambient :deep(.dot-grid) {
  width: 100%;
  height: 100%;
}

.login-header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1320px;
  margin: 0 auto;
  padding: 26px clamp(20px, 4vw, 44px);
}

.login-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.local-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 11px;
  border: 1px solid var(--sf-line);
  border-radius: 999px;
  background: rgba(255, 253, 248, 0.72);
  color: var(--sf-ink-2);
  font-size: 10.5px;
  font-weight: 560;
  letter-spacing: 0.04em;
  backdrop-filter: blur(10px);
}

.pill-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--sf-success);
  box-shadow: 0 0 0 3px rgba(63, 122, 86, 0.14);
}

.login-main {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  max-width: 1240px;
  flex: 1;
  align-items: center;
  gap: clamp(36px, 6vw, 96px);
  margin: 0 auto;
  padding: clamp(18px, 3vw, 44px) clamp(20px, 4vw, 44px) 46px;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 412px);
}

/* ---------- 左侧叙事 ---------- */

.login-story {
  max-width: 620px;
  padding-bottom: 10px;
}

.login-story .sf-kicker {
  margin: 0 0 18px;
  color: var(--sf-terra);
}

.login-title {
  font-size: clamp(38px, 4.4vw, 60px);
  font-weight: 680;
  line-height: 1.08;
  letter-spacing: -0.045em;
  text-wrap: balance;
}

.login-lede {
  max-width: 42ch;
  margin: 20px 0 0;
  color: var(--sf-ink-2);
  font-size: 14.5px;
  line-height: 1.8;
}

.login-points {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin: 38px 0 0;
  padding: 0;
  border-top: 1px solid var(--sf-line);
  list-style: none;
}

.login-points li {
  display: flex;
  gap: 18px;
  padding: 17px 2px;
  border-bottom: 1px solid var(--sf-line-soft);
}

.point-index {
  width: 30px;
  flex: none;
  color: var(--sf-terra);
  font-size: 20px;
  line-height: 1.2;
}

.point-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.point-body b {
  color: var(--sf-ink);
  font-size: 13.5px;
  font-weight: 620;
  letter-spacing: -0.01em;
}

.point-body em {
  color: var(--sf-ink-3);
  font-size: 12.5px;
  font-style: normal;
  line-height: 1.65;
}

/* ---------- 右侧登录卡 ---------- */

.login-card {
  width: 100%;
  padding: 28px 28px 22px;
  border: 1px solid var(--sf-line);
  border-radius: 24px;
  box-shadow: var(--sf-shadow-md);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 13px;
}

.card-mark {
  display: grid;
  width: 46px;
  height: 46px;
  flex: none;
  place-items: center;
  border: 1px solid var(--sf-line-soft);
  border-radius: 14px;
  background: var(--sf-surface-2);
}

.card-kicker {
  margin: 0 0 2px;
  font-size: 9.5px;
  color: var(--sf-terra);
}

.login-card h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 660;
  letter-spacing: -0.03em;
}

.card-copy {
  margin: 14px 0 20px;
  color: var(--sf-ink-3);
  font-size: 12.5px;
  line-height: 1.65;
}

.login-form {
  display: flex;
  flex-direction: column;
}

.field label,
.advanced-panel label {
  display: block;
  margin-bottom: 7px;
  color: var(--sf-ink-2);
  font-size: 11.5px;
  font-weight: 620;
  letter-spacing: 0.01em;
}

.input-shell {
  display: flex;
  align-items: center;
  border: 1px solid var(--sf-field-border, var(--sf-line));
  border-radius: 12px;
  background: var(--sf-surface-2);
  transition:
    border-color var(--sf-dur-1) var(--sf-ease-out),
    box-shadow var(--sf-dur-1) var(--sf-ease-out),
    background var(--sf-dur-1) var(--sf-ease-out);
}

.input-shell:focus-within {
  border-color: rgba(180, 85, 58, 0.55);
  background: var(--sf-surface);
  box-shadow: 0 0 0 3px rgba(180, 85, 58, 0.09);
}

.input-shell.has-error {
  border-color: var(--sf-danger);
}

.text-input {
  width: 100%;
  min-width: 0;
  min-height: 46px;
  padding: 0 12px;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--sf-ink);
  font-family: var(--sf-font-mono);
  font-size: 12.5px;
  letter-spacing: 0.01em;
}

.text-input::placeholder {
  color: var(--sf-ink-4);
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
  border-radius: 9px;
  background: transparent;
  color: var(--sf-ink-3);
  cursor: pointer;
  transition: background var(--sf-dur-1) var(--sf-ease-out);
}

.visibility-button svg {
  width: 16px;
  height: 16px;
}

.visibility-button:hover {
  background: var(--sf-surface-3);
  color: var(--sf-ink);
}

.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 5px 1px;
  border: 0;
  background: transparent;
  color: var(--sf-ink-3);
  font-size: 11.5px;
  cursor: pointer;
}

.advanced-toggle:hover {
  color: var(--sf-ink);
}

.advanced-chevron {
  width: 13px;
  height: 13px;
  transition: transform var(--sf-dur-2) var(--sf-ease-out);
}

.advanced-chevron.open {
  transform: rotate(180deg);
}

.advanced-panel {
  margin-top: 6px;
  padding: 12px;
  border: 1px solid var(--sf-line-soft);
  border-radius: 12px;
  background: var(--sf-surface-2);
}

.plain-input {
  width: 100%;
  min-height: 40px;
  padding: 0 11px;
  border: 1px solid var(--sf-line);
  border-radius: 9px;
  outline: none;
  background: var(--sf-surface);
  color: var(--sf-ink);
  font-family: var(--sf-font-mono);
  font-size: 12px;
}

.plain-input:focus {
  border-color: rgba(180, 85, 58, 0.55);
}

.field-hint {
  margin-top: 7px;
  color: var(--sf-ink-3);
  font-size: 11px;
  line-height: 1.5;
}

.error-banner {
  margin-top: 12px;
  padding: 9px 11px;
  border: 1px solid var(--sf-danger-soft);
  border-radius: 10px;
  background: var(--sf-danger-soft);
  color: var(--sf-danger);
  font-size: 12px;
  line-height: 1.55;
}

.submit-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 46px;
  margin-top: 18px;
  border: 0;
  border-radius: 12px;
  background: var(--sf-ink);
  color: var(--sf-surface);
  font-family: var(--sf-font-ui);
  font-size: 13px;
  font-weight: 620;
  letter-spacing: 0.01em;
  cursor: pointer;
  box-shadow: var(--sf-shadow-sm);
  transition:
    background var(--sf-dur-1) var(--sf-ease-out),
    transform var(--sf-dur-1) var(--sf-ease-out),
    box-shadow var(--sf-dur-1) var(--sf-ease-out);
}

.submit-button svg {
  width: 17px;
  height: 17px;
}

.submit-button:hover:not(:disabled) {
  background: #37322b;
  box-shadow: var(--sf-shadow-md);
}

.submit-button:active:not(:disabled) {
  transform: translateY(1px);
}

.submit-button:disabled {
  background: var(--sf-line-strong);
  color: var(--sf-surface-2);
  box-shadow: none;
  cursor: not-allowed;
}

.loading-dot {
  width: 14px;
  height: 14px;
  border: 1.6px solid rgba(255, 253, 248, 0.35);
  border-top-color: var(--sf-surface);
  border-radius: 50%;
  animation: spin 720ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.card-links {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--sf-line-soft);
}

.key-helper {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  color: var(--sf-terra);
  font-size: 11.5px;
  font-weight: 580;
  text-decoration: none;
  transition: color var(--sf-dur-1) var(--sf-ease-out);
}

.key-helper:hover {
  color: var(--sf-terra-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.privacy-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  line-height: 1.6;
}

.privacy-note svg {
  width: 12px;
  height: 12px;
  margin-top: 1px;
  flex: none;
}

.login-footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 18px 24px 22px;
  color: var(--sf-ink-3);
  font-size: 10.5px;
  letter-spacing: 0.03em;
}

.login-footer .sf-mono {
  letter-spacing: 0;
}

.footer-dot {
  opacity: 0.55;
}

@media (max-width: 980px) {
  .login-main {
    grid-template-columns: minmax(0, 1fr);
    gap: 34px;
    max-width: 540px;
    align-content: center;
  }

  .login-points {
    display: none;
  }

  .login-lede {
    margin-top: 14px;
    font-size: 13.5px;
  }

  .login-title {
    font-size: clamp(32px, 7vw, 42px);
  }
}

@media (max-height: 760px) and (min-width: 981px) {
  .login-points {
    margin-top: 24px;
  }

  .login-points li {
    padding: 12px 2px;
  }

  .login-title {
    font-size: clamp(34px, 3.8vw, 50px);
  }
}
</style>
