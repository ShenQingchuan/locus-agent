import { PiniaColada } from '@pinia/colada'
import { setCustomComponents } from 'markstream-vue'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import CodeBlock from './components/CodeBlock.vue'
import MermaidBlock from './components/MermaidBlock.vue'
import router from './router'

import '@unocss/reset/tailwind.css'
import 'katex/dist/katex.min.css'
import 'markstream-vue/index.css'
import './styles/main.css'
import 'virtual:uno.css'

// 注册自定义渲染器（对应 custom-id="locus"）
setCustomComponents('locus', {
  code_block: CodeBlock,
  mermaid: MermaidBlock,
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(PiniaColada)
app.use(router)

app.mount('#app')
