<template>
  <Teleport to="body">
    <Transition name="app-dialog">
      <div v-if="dialogState.open" class="dlg-backdrop" @click.self="cancel">
        <section
          class="dlg"
          :class="{ 'is-danger': dialogState.danger }"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-dialog-title"
          aria-describedby="app-dialog-message"
        >
          <h2 id="app-dialog-title" class="dlg-title">{{ dialogState.title }}</h2>
          <p id="app-dialog-message" class="dlg-message">{{ dialogState.message }}</p>
          <footer class="dlg-actions">
            <button
              v-if="dialogState.mode === 'confirm'"
              ref="cancelRef"
              type="button"
              class="dlg-cancel"
              @click="cancel"
            >
              {{ dialogState.cancelText }}
            </button>
            <button
              ref="confirmRef"
              type="button"
              class="dlg-confirm"
              :class="{ danger: dialogState.danger }"
              @click="confirm"
            >
              {{ dialogState.confirmText }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { dialogState, settleDialog } from '@/features/ui/dialog'

const confirmRef = ref<HTMLButtonElement | null>(null)
const cancelRef = ref<HTMLButtonElement | null>(null)
let previousOverflow = ''
let previousFocus: HTMLElement | null = null

function confirm() {
  settleDialog(true)
}

function cancel() {
  settleDialog(false)
}

function handleKeydown(event: KeyboardEvent) {
  if (!dialogState.open) return
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    // 危险操作的焦点在「取消」上，回车也应该走取消。
    if (document.activeElement === cancelRef.value) cancel()
    else confirm()
  }
}

watch(
  () => dialogState.open,
  (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      nextTick(() => {
        // 危险操作默认把焦点放在取消上，避免顺手回车删掉东西。
        const target = dialogState.danger ? cancelRef.value : confirmRef.value
        target?.focus()
      })
    } else {
      document.body.style.overflow = previousOverflow
      nextTick(() => previousFocus?.focus?.())
      previousFocus = null
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = previousOverflow
})
</script>

<style scoped>
.dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(20, 20, 18, 0.28);
  backdrop-filter: blur(3px);
}

.dlg {
  width: min(380px, 100%);
  padding: 20px 20px 16px;
  border: 1px solid #e7e7e1;
  border-radius: 16px;
  background: #ffffff;
  box-shadow:
    0 1px 2px rgba(17, 17, 16, 0.04),
    0 24px 70px rgba(17, 17, 16, 0.18);
}

.dlg-title {
  margin: 0;
  color: #1d1d1b;
  font-size: 14.5px;
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.4;
}

.dlg-message {
  margin: 8px 0 0;
  color: #6b6b63;
  font-size: 12px;
  line-height: 1.75;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.dlg-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 18px;
}

.dlg-cancel,
.dlg-confirm {
  min-width: 68px;
  padding: 7px 14px;
  border-radius: 8px;
  font-family: inherit;
  font-size: 11.5px;
  font-weight: 550;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, color 120ms ease;
}

.dlg-cancel {
  border: 1px solid #e7e7e1;
  background: #ffffff;
  color: #6b6b63;
}

.dlg-cancel:hover {
  border-color: #d4d4cc;
  color: #1d1d1b;
}

.dlg-confirm {
  border: 1px solid #111110;
  background: #111110;
  color: #ffffff;
}

.dlg-confirm:hover {
  background: #2c2c28;
  border-color: #2c2c28;
}

.dlg-confirm.danger {
  border-color: #b4472f;
  background: #b4472f;
}

.dlg-confirm.danger:hover {
  border-color: #9c3b26;
  background: #9c3b26;
}

.dlg-confirm:focus-visible,
.dlg-cancel:focus-visible {
  outline: 2px solid rgba(17, 17, 16, 0.18);
  outline-offset: 2px;
}

.dlg-confirm.danger:focus-visible {
  outline-color: rgba(180, 71, 47, 0.35);
}

.app-dialog-enter-active,
.app-dialog-leave-active {
  transition: opacity 140ms ease;
}

.app-dialog-enter-active .dlg,
.app-dialog-leave-active .dlg {
  transition: transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 140ms ease;
}

.app-dialog-enter-from,
.app-dialog-leave-to {
  opacity: 0;
}

.app-dialog-enter-from .dlg,
.app-dialog-leave-to .dlg {
  transform: translateY(6px) scale(0.985);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .app-dialog-enter-active,
  .app-dialog-leave-active,
  .app-dialog-enter-active .dlg,
  .app-dialog-leave-active .dlg {
    transition: none;
  }
}
</style>
