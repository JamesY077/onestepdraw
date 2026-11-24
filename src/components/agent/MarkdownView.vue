<template>
  <div class="markdown-body" v-html="html" @click="handleClick" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import DOMPurify from 'dompurify'
import { marked, Renderer } from 'marked'

const props = defineProps<{ content: string }>()

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const renderer = new Renderer()

renderer.code = ({ text, lang }) => {
  const language = (lang || '').trim().split(/\s+/)[0] || 'text'
  return `<div class="md-code"><div class="md-code-head"><span>${escapeHtml(language)}</span><button class="md-code-copy" type="button">复制</button></div><pre><code>${escapeHtml(text)}</code></pre></div>`
}

renderer.link = ({ href, title, text }) => {
  const rawHref = href || ''
  const safeHref = escapeHtml(rawHref)
  if (/^\/generated\/.+\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(rawHref)) {
    return `<video class="md-video" controls preload="metadata" src="${safeHref}"></video>`
  }
  const safeTitle = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${text}</a>`
}

/** 把「← 推荐」包成不会断行的小徽标，避免移动端折成两行。代码块内保持原样。 */
function decorateRecommendation(html: string): string {
  return html
    .split(/(<pre[\s\S]*?<\/pre>)/g)
    .map((part, index) => {
      if (index % 2 === 1) return part
      return part.replace(
        /(?:&larr;|←)\s*推荐/g,
        '<span class="pick-recommend">推荐</span>',
      )
    })
    .join('')
}

const html = computed(() => {
  if (!props.content) return ''
  try {
    const raw = marked.parse(props.content, {
      renderer,
      gfm: true,
      breaks: true,
    }) as string
    return DOMPurify.sanitize(decorateRecommendation(raw), {
      ADD_ATTR: ['target', 'rel'],
      FORBID_TAGS: ['style', 'iframe', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick'],
    })
  } catch {
    return escapeHtml(props.content).replace(/\n/g, '<br />')
  }
})

async function handleClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target) return

  const copyButton = target.closest<HTMLButtonElement>('.md-code-copy')
  if (copyButton) {
    const block = copyButton.closest('.md-code')
    const code = block?.querySelector('pre code')?.textContent || ''
    try {
      await navigator.clipboard.writeText(code)
      copyButton.textContent = '已复制'
      window.setTimeout(() => {
        copyButton.textContent = '复制'
      }, 1400)
    } catch {
      copyButton.textContent = '复制失败'
      window.setTimeout(() => {
        copyButton.textContent = '复制'
      }, 1400)
    }
    return
  }

  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (anchor) {
    const href = anchor.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) {
      event.preventDefault()
      window.open(href, '_blank', 'noopener,noreferrer')
    }
  }
}
</script>

<style scoped>
.markdown-body {
  font-size: 14.5px;
  line-height: 1.75;
  color: var(--sf-ink);
  overflow-wrap: anywhere;
}

.markdown-body :deep(> :first-child) {
  margin-top: 0;
}

.markdown-body :deep(> :last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(p) {
  margin: 0 0 0.85em;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
  margin: 1.3em 0 0.55em;
  color: var(--sf-ink);
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.015em;
}

.markdown-body :deep(h1) {
  font-size: 1.5em;
}

.markdown-body :deep(h2) {
  font-size: 1.28em;
}

.markdown-body :deep(h3) {
  font-size: 1.1em;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin: 0 0 0.9em;
  padding-left: 1.45em;
}

.markdown-body :deep(ul) {
  list-style: disc;
}

.markdown-body :deep(ol) {
  list-style: decimal;
}

.markdown-body :deep(li) {
  margin: 0.28em 0;
}

.markdown-body :deep(li::marker) {
  color: #8b8b85;
}

/* 「← 推荐」渲染成陶土色小徽标 */
.markdown-body :deep(.pick-recommend) {
  display: inline-block;
  margin-left: 6px;
  padding: 0.5px 7px;
  border-radius: 999px;
  background: #fbeee8;
  color: var(--sf-terra-strong);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.7;
  letter-spacing: 0.02em;
  white-space: nowrap;
  vertical-align: 1px;
}

.markdown-body :deep(blockquote) {
  margin: 0 0 0.9em;
  padding: 0.15em 0 0.15em 1em;
  border-left: 2px solid #deded9;
  color: #5f5f59;
}

.markdown-body :deep(a) {
  color: var(--sf-ink);
  text-decoration: underline;
  text-decoration-color: #c9c9c3;
  text-underline-offset: 3px;
}

.markdown-body :deep(a:hover) {
  text-decoration-color: var(--sf-ink);
}

.markdown-body :deep(code) {
  padding: 0.16em 0.4em;
  border-radius: 5px;
  background: #f1f1ed;
  color: var(--sf-ink);
  font-family: 'SFMono-Regular', 'JetBrains Mono', Menlo, Consolas, monospace;
  font-size: 0.88em;
}

.markdown-body :deep(.md-video) {
  display: block;
  width: 100%;
  max-width: 620px;
  margin: 12px 0;
  border: 1px solid var(--sf-line-soft);
  border-radius: 12px;
  background: var(--sf-ink);
}

.markdown-body :deep(.md-code) {
  margin: 0 0 1em;
  overflow: hidden;
  border: 1px solid #e8e8e3;
  border-radius: 12px;
  background: #fbfbf9;
}

.markdown-body :deep(.md-code-head) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-bottom: 1px solid #ededE8;
  background: #f6f6f3;
  color: #8a8a84;
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.markdown-body :deep(.md-code-copy) {
  padding: 2px 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #6c6c66;
  font-size: 11.5px;
  cursor: pointer;
}

.markdown-body :deep(.md-code-copy:hover) {
  background: var(--sf-line-soft);
  color: var(--sf-ink);
}

.markdown-body :deep(.md-code pre) {
  margin: 0;
  padding: 13px 14px;
  overflow-x: auto;
  background: transparent;
}

.markdown-body :deep(.md-code pre code) {
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--sf-ink);
  font-size: 12.8px;
  line-height: 1.65;
}

.markdown-body :deep(table) {
  width: 100%;
  margin: 0 0 1em;
  border-collapse: collapse;
  font-size: 13.5px;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 8px 10px;
  border: 1px solid #e8e8e3;
  text-align: left;
}

.markdown-body :deep(th) {
  background: var(--sf-surface-2);
  font-weight: 650;
}

.markdown-body :deep(hr) {
  margin: 1.4em 0;
  border: 0;
  border-top: 1px solid var(--sf-line-soft);
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 10px;
}
</style>
