<script setup lang="ts">
import AppNavRail from '@/components/layout/AppNavRail.vue'
import SettingsEmbeddingCard from '@/components/settings/SettingsEmbeddingCard.vue'
import SettingsLLMCard from '@/components/settings/SettingsLLMCard.vue'
import SettingsMCPCard from '@/components/settings/SettingsMCPCard.vue'
import SettingsWhitelistCard from '@/components/settings/SettingsWhitelistCard.vue'
import { useSettingsView } from '@/composables/useSettingsView'

const {
  router,
  SETTINGS_SECTIONS,
  isLoading,
  isSaving,
  loadError,
  requiresRestart,
  embeddingStatusRefreshToken,
  runtimeInfo,
  apiKeysMasked,
  activeProvider,
  port,
  providerConfigs,
  contentScrollEl,
  activeSection,
  setSectionRef,
  handleContentScroll,
  navigateToSection,
  codingKimi,
  loadConfig,
  saveConfig,
  handleKimiCodeSave,
} = useSettingsView()
</script>

<template>
  <div class="h-screen flex bg-background">
    <AppNavRail />

    <div class="flex-1 flex min-w-0 flex-col">
      <header class="flex-shrink-0 border-b border-border bg-background px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            class="btn-ghost btn-icon"
            title="返回"
            @click="router.push({ name: 'ChatView' })"
          >
            <div class="i-carbon-arrow-left h-4 w-4" />
          </button>
          <div>
            <h1 class="text-sm font-medium text-foreground">
              设置
            </h1>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            class="btn-primary btn-xs !px-4"
            :disabled="isLoading || isSaving || !!loadError"
            @click="saveConfig"
          >
            <span v-if="isSaving" class="i-carbon-circle-dash text-sm animate-spin mr-1.5" />
            保存
          </button>
          <button
            class="btn-ghost btn-icon"
            title="刷新"
            :disabled="isLoading || isSaving"
            @click="loadConfig"
          >
            <div class="i-carbon-renew h-4 w-4" />
          </button>
        </div>
      </header>

      <main ref="contentScrollEl" class="flex-1 overflow-y-auto" @scroll="handleContentScroll">
        <div class="container-chat lg:max-w-7xl p-4 lg:p-6">
          <div v-if="isLoading" class="flex-col-center py-12 text-muted-foreground">
            <div class="i-carbon-circle-dash h-6 w-6 animate-spin opacity-50" />
            <span class="text-xs mt-2 opacity-70">加载中...</span>
          </div>

          <div v-else-if="loadError" class="alert alert-destructive">
            <div class="flex items-start justify-between gap-3">
              <div class="text-sm">
                {{ loadError }}
              </div>
              <button class="btn-outline btn-sm" @click="loadConfig">
                重试
              </button>
            </div>
          </div>

          <template v-else>
            <div class="lg:hidden sticky top-0 z-20 -mx-4 mb-4 border-b border-border/80 bg-background/95 px-4 py-3 backdrop-blur">
              <div class="flex gap-2 overflow-x-auto pb-1">
                <button
                  v-for="section in SETTINGS_SECTIONS"
                  :key="section.id"
                  class="flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition-colors"
                  :class="activeSection === section.id
                    ? 'border-foreground/15 bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted/50'"
                  @click="navigateToSection(section.id)"
                >
                  <div class="h-3.5 w-3.5" :class="[section.icon]" />
                  <span>{{ section.label }}</span>
                </button>
              </div>
            </div>

            <div class="flex items-start gap-6 xl:gap-8">
              <aside class="hidden lg:block w-56 shrink-0 sticky top-6">
                <div class="px-2">
                  <nav class="relative space-y-1 pl-3">
                    <button
                      v-for="section in SETTINGS_SECTIONS"
                      :key="section.id"
                      class="group relative w-full rounded-r-xl px-3 py-2.5 text-left transition-all duration-150 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                      :class="activeSection === section.id && 'bg-muted/50 text-foreground'"
                      @click="navigateToSection(section.id)"
                    >
                      <!-- Single active indicator: left bar + light background -->
                      <div
                        class="absolute left-0 top-1/2 h-8 w-0.5 -translate-x-2 -translate-y-1/2 rounded-full transition-opacity"
                        :class="activeSection === section.id ? 'bg-foreground opacity-100' : 'opacity-0'"
                      />
                      <div class="flex items-start gap-3">
                        <div
                          class="mt-0.5 h-4 w-4 shrink-0 transition-colors"
                          :class="[section.icon, activeSection === section.id ? 'text-foreground' : 'text-muted-foreground']"
                        />
                        <div class="min-w-0">
                          <div class="text-sm font-medium">
                            {{ section.label }}
                          </div>
                          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                            {{ section.description }}
                          </div>
                        </div>
                      </div>
                    </button>
                  </nav>
                </div>
              </aside>

              <div class="min-w-0 flex-1 space-y-6">
                <section
                  id="llm"
                  :ref="el => setSectionRef('llm', el as Element | null)"
                  class="scroll-mt-6 space-y-3"
                >
                  <div class="px-1">
                    <h2 class="text-base font-semibold text-foreground">
                      LLM
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      配置主模型提供商、API Key、模型名和 Coding 专用能力。
                    </p>
                  </div>

                  <SettingsLLMCard
                    v-model:provider-configs="providerConfigs"
                    v-model:active-provider="activeProvider"
                    :runtime-info="runtimeInfo"
                    :requires-restart="requiresRestart"
                    :is-loading="isLoading"
                    :api-keys-masked="apiKeysMasked"
                    :coding-kimi="codingKimi"
                    @submit="saveConfig"
                    @kimi-code-save="handleKimiCodeSave"
                  />
                </section>

                <section
                  id="server"
                  :ref="el => setSectionRef('server', el as Element | null)"
                  class="scroll-mt-6 space-y-3"
                >
                  <div class="px-1">
                    <h2 class="text-base font-semibold text-foreground">
                      服务端
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      管理本地服务端口和重启生效的运行参数。
                    </p>
                  </div>

                  <section class="card p-4">
                    <div>
                      <h3 class="text-sm font-medium text-foreground">
                        服务端
                      </h3>
                      <p class="text-xs text-muted-foreground mt-1">
                        端口修改需重启生效
                      </p>
                    </div>

                    <div class="mt-4 grid gap-4">
                      <div class="grid gap-1.5">
                        <label class="text-xs text-muted-foreground">端口</label>
                        <input
                          v-model.number="port"
                          class="input-field"
                          type="number"
                          min="1"
                          max="65535"
                          placeholder="3000"
                        >
                      </div>

                      <div
                        v-if="requiresRestart"
                        class="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground"
                      >
                        端口已保存，重启服务后生效。
                      </div>
                    </div>
                  </section>
                </section>

                <section
                  id="whitelist"
                  :ref="el => setSectionRef('whitelist', el as Element | null)"
                  class="scroll-mt-6 space-y-3"
                >
                  <div class="px-1">
                    <h2 class="text-base font-semibold text-foreground">
                      白名单
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      控制工作区和命令访问范围，减少误操作风险。
                    </p>
                  </div>

                  <SettingsWhitelistCard />
                </section>

                <section
                  id="embedding"
                  :ref="el => setSectionRef('embedding', el as Element | null)"
                  class="scroll-mt-6 space-y-3"
                >
                  <div class="px-1">
                    <h2 class="text-base font-semibold text-foreground">
                      Embedding
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      管理语义搜索、本地模型下载以及向量索引状态。
                    </p>
                  </div>

                  <SettingsEmbeddingCard :refresh-token="embeddingStatusRefreshToken" />
                </section>

                <section
                  id="mcp"
                  :ref="el => setSectionRef('mcp', el as Element | null)"
                  class="scroll-mt-6 space-y-3"
                >
                  <div class="px-1">
                    <h2 class="text-base font-semibold text-foreground">
                      MCP
                    </h2>
                    <p class="mt-1 text-sm text-muted-foreground">
                      统一查看和管理已接入的 MCP 服务与工具能力。
                    </p>
                  </div>

                  <SettingsMCPCard />
                </section>
              </div>
            </div>
          </template>
        </div>
      </main>
    </div>
  </div>
</template>
