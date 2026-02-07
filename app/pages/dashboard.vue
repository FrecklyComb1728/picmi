<template>
  <div class="space-y-6">
    <!-- Welcome -->
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold tracking-tight text-zinc-900">仪表盘</h2>
      <div class="flex items-center gap-2">
         <n-button type="primary" size="medium" @click="navigateTo('/images')">
           <template #icon><n-icon :component="CloudUploadOutline" /></template>
           上传图片
         </n-button>
      </div>
    </div>

    <!-- Stats Grid -->
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <n-card size="small" :bordered="false" class="rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-default">
        <n-statistic label="图片总数" :value="stats.count">
          <template #prefix>
            <n-icon :component="ImagesOutline" class="text-primary" />
          </template>
        </n-statistic>
        <div class="mt-2 text-xs text-zinc-500">当前目录下的文件数</div>
      </n-card>

      <n-card size="small" :bordered="false" class="rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-default">
        <n-statistic label="图片占用" :value="stats.size">
          <template #prefix>
            <n-icon :component="ServerOutline" class="text-info" />
          </template>
          <template #suffix>
            <span class="text-sm text-zinc-500">MB</span>
          </template>
        </n-statistic>
        <div class="mt-2 text-xs text-zinc-500">图片占用总大小</div>
      </n-card>

      <n-card size="small" :bordered="false" class="rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-default">
        <n-statistic label="系统状态" :value="systemStatus">
          <template #prefix>
            <n-icon :component="PulseOutline" :class="statusColor" />
          </template>
        </n-statistic>
        <div class="mt-2 text-xs text-zinc-500">后端服务健康检查</div>
      </n-card>

      <n-card size="small" :bordered="false" class="rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-default">
        <n-statistic label="存储节点" :value="stats.nodes">
          <template #prefix>
            <n-icon :component="ShareSocialOutline" class="text-warning" />
          </template>
        </n-statistic>
        <div class="mt-2 text-xs text-zinc-500">已配置的外部存储节点</div>
      </n-card>
    </div>

    <!-- Recent Files -->
    <n-card title="最近上传" :bordered="false" size="small" class="rounded-xl shadow-sm">
      <template #header-extra>
        <n-button text size="small" @click="navigateTo('/images')">查看全部</n-button>
      </template>
      <n-empty v-if="recentFiles.length === 0" description="暂无上传记录" class="py-8" />
      <div v-else class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div v-for="file in recentFiles" :key="file.name" class="group relative aspect-square bg-zinc-100 rounded-lg overflow-hidden border border-zinc-200">
           <img :src="file.url" :alt="file.name" class="w-full h-full object-cover transition-transform group-hover:scale-105" loading="lazy" />
           <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
           <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
             <p class="text-xs text-white truncate">{{ file.name }}</p>
           </div>
        </div>
      </div>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { 
  NCard, NStatistic, NIcon, NButton, NEmpty, useMessage 
} from 'naive-ui'
import { 
  ImagesOutline, 
  ServerOutline, 
  PulseOutline, 
  ShareSocialOutline, 
  CloudUploadOutline 
} from '@vicons/ionicons5'

const message = useMessage()
const { apiBase } = useRuntimeConfig().public

const stats = ref({
  count: 0,
  size: 0,
  nodes: 0
})

const isHealthy = ref(false)
const recentFiles = ref<any[]>([])

const systemStatus = computed(() => isHealthy.value ? '正常' : '异常')
const statusColor = computed(() => isHealthy.value ? 'text-green-500' : 'text-red-500')

onMounted(async () => {
  const health = await $fetch<any>(`${apiBase}/health`).catch(() => null)
  isHealthy.value = health?.data?.status === 'ok'

  const usage = await $fetch<any>(`${apiBase}/images/usage`).catch(() => null)
  if (usage?.data) {
    const totalBytes = Number(usage.data.bytes ?? 0)
    stats.value.size = Number((totalBytes / 1024 / 1024).toFixed(2))
    const totalCount = Number(usage.data.count ?? 0)
    if (Number.isFinite(totalCount)) stats.value.count = totalCount
  }

  const listRes = await $fetch<any>(`${apiBase}/images/list`).catch(() => null)
  const items = Array.isArray(listRes?.data?.items) ? listRes.data.items : []
  const images = items.filter((f: any) => f && f.type === 'image')
  recentFiles.value = images
    .slice()
    .sort((a: any, b: any) => String(b?.uploadedAt ?? '').localeCompare(String(a?.uploadedAt ?? '')))
    .slice(0, 6)

  const config = await $fetch<any>(`${apiBase}/config`).catch(() => null)
  if (Array.isArray(config?.data?.nodes)) stats.value.nodes = config.data.nodes.length
})
</script>
