import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { enforceApiSessionGuard } from './utils/sessionGuard'
import '@fontsource-variable/inter'
import '@fontsource/instrument-serif/latin-400.css'
import '@fontsource/instrument-serif/latin-400-italic.css'
import '@fontsource-variable/jetbrains-mono'
import './assets/styles/tokens.css'
import './assets/styles/global.css'
import './assets/styles/studio.css'
import './assets/styles/redesign.css'
import './assets/styles/desktop.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
enforceApiSessionGuard()
app.mount('#app')
