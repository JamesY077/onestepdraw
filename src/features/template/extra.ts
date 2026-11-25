import type { BuiltinTemplate, TemplateCategory } from './types'
import wallstreetExplainerGuide from './guides/wallstreet-explainer.md?raw'
import { GIF_FACTORY_CATEGORIES, GIF_FACTORY_TEMPLATES } from './gifFactory'

/**
 * 手工维护的模板，与 code-animation-prompts 的来源分开存放。
 * `scripts/import-code-animation-templates.py` 会重写 builtin.ts，
 * 但只覆盖它自己生成的那部分，这里的条目通过 ...EXTRA_TEMPLATES 合并进去。
 */

export const EXTRA_CATEGORIES: TemplateCategory[] = [
  {
    id: 'finance',
    label: '财经解读',
    labelEn: 'Finance',
  },
  ...GIF_FACTORY_CATEGORIES,
]

export const EXTRA_TEMPLATES: BuiltinTemplate[] = [
  {
    id: 'ws-explainer',
    code: 'W1',
    name: '华尔街财经解读',
    nameEn: 'Wall Street Explainer',
    category: '财经解读',
    categoryEn: 'Finance',
    demo: '',
    poster: '/templates/wallstreet/number.jpg',
    still: true,
    generated: false,
    references: [
      '/templates/wallstreet/title.jpg',
      '/templates/wallstreet/equation.jpg',
      '/templates/wallstreet/article.jpg',
      '/templates/wallstreet/chart.jpg',
    ],
    guide: wallstreetExplainerGuide,
  },
  ...GIF_FACTORY_TEMPLATES,
]
