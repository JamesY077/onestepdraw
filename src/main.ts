import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { enforceApiSessionGuard } from './utils/sessionGuard'
import './assets/styles/global.css'
import './assets/styles/studio.css'
import './assets/styles/desktop.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
enforceApiSessionGuard()
app.mount('#app')
