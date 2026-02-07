<template>
  <n-layout-header bordered class="h-16 flex items-center justify-between px-6 bg-white/80 backdrop-blur z-10 sticky top-0">
    <div class="flex items-center gap-4">
      <n-breadcrumb>
        <n-breadcrumb-item href="/dashboard">
          <n-icon :component="HomeOutline" class="mr-1" />
          控制台
        </n-breadcrumb-item>
        <n-breadcrumb-item v-if="pageTitle">
          {{ pageTitle }}
        </n-breadcrumb-item>
      </n-breadcrumb>
    </div>
    <div class="flex items-center gap-3">
      <n-tooltip trigger="hover">
        <template #trigger>
           <n-button circle quaternary size="small" tag="a" href="https://github.com/FrecklyComb1728/picmi" target="_blank">
              <template #icon><n-icon :component="LogoGithub" /></template>
           </n-button>
        </template>
        访问 GitHub
      </n-tooltip>
    </div>
  </n-layout-header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NLayoutHeader, NBreadcrumb, NBreadcrumbItem, NIcon, NButton, NTooltip } from 'naive-ui'
import { HomeOutline, LogoGithub } from '@vicons/ionicons5'

const route = useRoute()

const pageTitle = computed(() => {
  if (route.path.startsWith('/dashboard')) return '仪表盘'
  if (route.path.startsWith('/images')) return '图片管理'
  if (route.path.startsWith('/config')) return '系统设置'
  if (route.path.startsWith('/users')) return '用户管理'
  return ''
})
</script>
