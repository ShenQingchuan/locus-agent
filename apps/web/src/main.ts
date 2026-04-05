import { PiniaColada } from '@pinia/colada'
import { enableKatex, setCustomComponents, setKatexLoader } from 'markstream-vue'
import { createPinia } from 'pinia'
import { createApp, defineAsyncComponent } from 'vue'
import App from './App.vue'
import CodeBlock from './components/code/CodeBlock.vue'
import router from './router'

import '@unocss/reset/tailwind.css'
import 'markstream-vue/index.css'
import './styles/main.css'
import 'virtual:uno.css'

// Redirect markstream-vue's math rendering to the CDN-loaded window.katex,
// so its internal import("katex") dynamic import is never triggered at runtime.
// The katex script is loaded via <script defer> in index.html.
setKatexLoader(() => (window as any).katex)
enableKatex(() => (window as any).katex)

// 注册自定义渲染器（对应 custom-id="locus"）
// MermaidBlock 使用异步组件，避免 mermaid (~3MB) 进入初始 bundle
setCustomComponents('locus', {
  code_block: CodeBlock,
  mermaid: defineAsyncComponent(() => import('./components/code/MermaidBlock.vue')),
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(PiniaColada)
app.use(router)

app.mount('#app')
