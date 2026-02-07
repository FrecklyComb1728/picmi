<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold text-zinc-900">系统设置</h2>
    </div>

    <n-card title="基础配置" size="small" :bordered="false" class="rounded-xl shadow-sm">
      <n-form-item label="上传大小上限(MB)" :validation-status="maxUploadError ? 'error' : undefined" :feedback="maxUploadError">
        <n-input-number v-model:value="maxUploadMb" :min="1" :step="1" class="w-full" />
      </n-form-item>
      <n-form-item label="启用本地存储" :validation-status="storageConflictError ? 'error' : undefined" :feedback="storageConflictError">
         <n-switch v-model:value="enableLocalStorage">
           <template #checked>已启用</template>
           <template #unchecked>已禁用</template>
         </n-switch>
      </n-form-item>
      
      <div class="flex justify-end">
        <n-button type="primary" :loading="saving" :disabled="!!listApiError || !!storageConflictError || !!maxUploadError" @click="saveConfig">保存配置</n-button>
      </div>
    </n-card>

    <n-card title="存储节点" size="small" :bordered="false" class="rounded-xl shadow-sm">
       <template #header-extra>
         <n-button size="small" secondary @click="openEditor(null)">
           <template #icon><n-icon :component="AddOutline" /></template>
           添加节点
         </n-button>
       </template>
       
       <div v-if="nodes.length === 0" class="w-full py-12 flex flex-col items-center justify-center text-zinc-400">
          <n-icon :component="ServerOutline" size="48" class="mb-3 opacity-20" />
          <p class="text-sm">暂无存储节点</p>
       </div>

       <div v-else class="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div 
            v-for="(node, index) in nodes" 
            :key="node.id"
            class="group relative flex flex-col justify-between rounded-2xl bg-white p-5 border border-zinc-100 shadow-sm transition-all duration-300 hover:shadow-lg hover:border-primary/20 hover:-translate-y-1"
            v-motion
            :initial="{ opacity: 0, y: 20 }"
            :enter="{ opacity: 1, y: 0, transition: { delay: index * 50, duration: 400, type: 'spring', stiffness: 150, damping: 20 } }"
          >
             <div>
               <div class="flex items-start justify-between mb-4">
                  <div class="flex items-center gap-3">
                      <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-50 text-zinc-600 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                          <n-icon :component="typeIconMap.get(node.type) ?? ServerOutline" size="20" />
                      </div>
                      <div>
                          <h3 class="font-medium text-zinc-900">{{ node.name }}</h3>
                          <p class="text-xs text-zinc-500">{{ typeLabelMap.get(node.type) ?? node.type }}</p>
                      </div>
                  </div>
                  <div class="flex items-center">
                    <div
                      class="h-2 w-2 rounded-full mr-2"
                      :class="!node.enabled ? 'bg-zinc-300' : (nodeStatusById[node.id]?.online ? 'bg-green-500' : (nodeStatusById[node.id]?.reachable ? 'bg-yellow-500' : 'bg-red-500'))"
                    />
                    <span class="text-xs text-zinc-500">
                      {{ !node.enabled ? '已停用' : (!nodeStatusById[node.id] ? '检测中' : (nodeStatusById[node.id]?.online ? '运行中' : (nodeStatusById[node.id]?.reachable ? '异常' : '离线'))) }}
                    </span>
                  </div>
               </div>
               
               <div class="space-y-2 mb-4">
                  <div class="flex items-center gap-2 text-xs text-zinc-500">
                      <span class="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono text-[10px]">ADDR</span>
                      <span class="truncate font-mono">{{ node.address }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs text-zinc-500">
                       <span class="px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 font-mono text-[10px]">ROOT</span>
                       <span class="truncate font-mono">{{ node.rootDir }}</span>
                  </div>
               </div>

               <div v-if="node.enabled" class="flex flex-wrap gap-1.5 mb-1">
                 <span class="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 font-mono">
                   <span class="text-zinc-500">LAT</span>
                   <span>{{ formatMs(nodeStatusById[node.id]?.latencyMs) }}</span>
                 </span>
                 <span v-if="node.type === 'picmi-node'" class="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 font-mono">
                   <span class="text-zinc-500">CPU</span>
                   <span>{{ formatPercent(nodeStatusById[node.id]?.cpuPercent) }}</span>
                 </span>
                 <span v-if="node.type === 'picmi-node'" class="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 font-mono">
                   <span class="text-zinc-500">MEM</span>
                   <span>{{ formatRatio(nodeStatusById[node.id]?.memoryUsed, nodeStatusById[node.id]?.memoryTotal) }}</span>
                 </span>
                 <span v-if="node.type === 'picmi-node'" class="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 font-mono">
                   <span class="text-zinc-500">DISK</span>
                   <span>{{ formatRatio(nodeStatusById[node.id]?.diskUsed, nodeStatusById[node.id]?.diskTotal) }}</span>
                 </span>
                 <span v-if="node.type === 'picmi-node'" class="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 font-mono">
                   <span class="text-zinc-500">UP</span>
                   <span>{{ formatBps(nodeStatusById[node.id]?.bandwidthUp) }}</span>
                 </span>
                 <span v-if="node.type === 'picmi-node'" class="inline-flex items-center gap-1 rounded-lg bg-zinc-50 px-2 py-1 text-[10px] text-zinc-600 font-mono">
                   <span class="text-zinc-500">DOWN</span>
                   <span>{{ formatBps(nodeStatusById[node.id]?.bandwidthDown) }}</span>
                 </span>
               </div>
             </div>

             <div class="flex items-center justify-end gap-2 pt-3 border-t border-zinc-50">
                <n-button size="small" secondary circle class="opacity-0 group-hover:opacity-100 transition-opacity" @click="openEditor(node)">
                    <template #icon><n-icon :component="CreateOutline" /></template>
                </n-button>
                <n-button size="small" secondary circle type="error" class="opacity-0 group-hover:opacity-100 transition-opacity" @click="askRemoveNode(node.id)">
                    <template #icon><n-icon :component="TrashOutline" /></template>
                </n-button>
             </div>
          </div>
       </div>
    </n-card>

    <n-modal
      v-model:show="editorOpen"
      preset="card"
      :title="editingId ? '编辑节点' : '添加节点'"
      class="w-full max-w-lg"
      :segmented="{ content: 'soft', footer: 'soft' }"
      size="large"
      :bordered="false"
    >
       <n-form label-placement="top" class="mt-2">
         <n-grid :cols="24" :x-gap="16" class="w-full min-w-0">
           <n-form-item-gi class="min-w-0" :span="24" label="名称" :validation-status="editorNameError ? 'error' : undefined" :feedback="editorNameError">
             <n-input v-model:value="editor.name" placeholder="给节点起个名字" class="w-full" />
           </n-form-item-gi>
           <n-form-item-gi class="min-w-0" :span="24" label="类型">
             <n-select v-model:value="editor.type" :options="typeOptions" class="w-full" />
           </n-form-item-gi>
           <n-form-item-gi class="min-w-0" :span="24" label="地址" :validation-status="editorAddressError ? 'error' : undefined" :feedback="editorAddressError">
             <n-input v-model:value="editor.address" placeholder="例如: https://dav.example.com" class="w-full" />
           </n-form-item-gi>
           <n-form-item-gi class="min-w-0" :span="12" label="账号">
             <n-input v-model:value="editor.username" placeholder="用户名（可选）" class="w-full" />
           </n-form-item-gi>
           <n-form-item-gi class="min-w-0" :span="12" label="密码">
             <n-input v-model:value="editor.password" type="password" show-password-on="click" placeholder="密码（可选）" class="w-full" />
           </n-form-item-gi>
           <n-form-item-gi class="min-w-0" :span="18" label="根目录">
             <n-input v-model:value="editor.rootDir" placeholder="/picmi" class="w-full" />
           </n-form-item-gi>
           <n-form-item-gi class="min-w-0" :span="6" label="状态">
             <div class="h-[34px] flex items-center">
               <n-switch v-model:value="editor.enabled">
                  <template #checked>启用</template>
                  <template #unchecked>停用</template>
               </n-switch>
             </div>
           </n-form-item-gi>
         </n-grid>
       </n-form>
       <template #footer>
          <div class="flex justify-end gap-3">
            <n-button @click="editorOpen = false" size="medium">取消</n-button>
            <n-button type="primary" @click="saveNode" size="medium">保存配置</n-button>
          </div>
       </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h, onMounted, onBeforeUnmount } from 'vue'
import { 
  NCard, NForm, NFormItem, NInput, NButton, NIcon, NBadge, NSwitch, NModal, NSpace, NSelect, useMessage, useDialog,
  NGrid, NFormItemGi, NInputNumber
} from 'naive-ui'
import { 
  AddOutline, 
  ServerOutline, 
  CloudOutline, 
  GlobeOutline, 
  CreateOutline, 
  TrashOutline 
} from '@vicons/ionicons5'

const message = useMessage()
const dialog = useDialog()
const { apiFetch } = useApi()

type NodeConfig = {
  id: string
  name: string
  type: 'picmi-node' | 'webdav' | 'ftp'
  address: string
  username: string
  password: string
  enabled: boolean
  rootDir: string
}

const typeOptions = [
  { label: 'PicMi-Node', value: 'picmi-node', icon: ServerOutline },
  { label: 'WebDAV', value: 'webdav', icon: CloudOutline },
  { label: 'FTP', value: 'ftp', icon: GlobeOutline }
]

const typeLabelMap = new Map<string, string>(typeOptions.map((it) => [String(it.value), it.label]))
const typeIconMap = new Map<string, any>(typeOptions.map((it) => [String(it.value), it.icon]))

const listApi = ref('/api/images/list')
const enableLocalStorage = ref(false)
const maxUploadMb = ref(20)
const nodes = ref<NodeConfig[]>([])
const saving = ref(false)

const nodeStatusById = ref<Record<string, any>>({})
const statusTimer = ref<number | null>(null)

const listApiError = computed(() => (listApi.value.trim() ? '' : '请输入接口路径'))
const storageConflictError = computed(() => {
  const hasEnabledNode = nodes.value.some((node) => node && node.enabled !== false)
  return enableLocalStorage.value && hasEnabledNode ? '本地存储与存储节点不可同时启用' : ''
})
const maxUploadError = computed(() => {
  const num = Number(maxUploadMb.value)
  if (!Number.isFinite(num)) return '请输入数字'
  if (num < 1) return '最小为1MB'
  return ''
})

const load = async () => {
  try {
    const res = await apiFetch<{ listApi?: string; nodes?: NodeConfig[]; enableLocalStorage?: boolean; maxUploadBytes?: number }>('/config', { method: 'GET' })
    listApi.value = res.listApi ?? '/api/images/list'
    enableLocalStorage.value = res.enableLocalStorage ?? false
    const bytes = Number(res.maxUploadBytes)
    maxUploadMb.value = Number.isFinite(bytes) && bytes > 0 ? Math.max(1, Math.floor(bytes / (1024 * 1024))) : 20
    const raw = res.nodes ?? []
    const allowed = new Set(typeOptions.map((it) => String(it.value)))
    nodes.value = raw.map((node) => ({
      ...node,
      type: allowed.has(String(node.type)) ? node.type : 'picmi-node',
      username: node.username ?? ''
    }))
  } catch {
    nodes.value = []
  }
}

await load()

const loadStatus = async () => {
  try {
    const res = await apiFetch<{ byId?: Record<string, any> }>('/nodes/status', { method: 'GET' })
    nodeStatusById.value = res.byId ?? {}
  } catch {
    nodeStatusById.value = {}
  }
}

onMounted(() => {
  loadStatus()
  statusTimer.value = window.setInterval(loadStatus, 2000)
})

onBeforeUnmount(() => {
  if (statusTimer.value) window.clearInterval(statusTimer.value)
  statusTimer.value = null
})

const formatMs = (value: any) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `${Math.round(num)}ms`
}

const formatPercent = (value: any) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '-'
  return `${Math.round(num)}%`
}

const formatBytes = (value: any) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let n = num
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  const fixed = i === 0 ? 0 : (n >= 100 ? 0 : (n >= 10 ? 1 : 2))
  return `${n.toFixed(fixed)}${units[i]}`
}

const formatRatio = (used: any, total: any) => {
  const u = Number(used)
  const t = Number(total)
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return '-'
  return `${formatBytes(u)}/${formatBytes(t)}`
}

const formatBps = (value: any) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num < 0) return '-'
  return `${formatBytes(num)}/s`
}

const saveConfig = async () => {
  if (storageConflictError.value) {
    message.error(storageConflictError.value)
    return
  }
  if (maxUploadError.value) {
    message.error(maxUploadError.value)
    return
  }
  saving.value = true
  try {
    await apiFetch('/config', {
      method: 'POST',
      body: {
        listApi: listApi.value,
        nodes: nodes.value,
        enableLocalStorage: enableLocalStorage.value,
        maxUploadBytes: Math.floor(Number(maxUploadMb.value) * 1024 * 1024)
      }
    })
    message.success('已保存')
  } catch (error: any) {
    const apiMessage = error?.data?.message || error?.response?._data?.message
    const code = error?.data?.code || error?.response?._data?.code
    if (code === 40003) message.error('本地存储与存储节点不可同时启用')
    else message.error(apiMessage || '保存失败')
  } finally {
    saving.value = false
  }
}

const editorOpen = ref(false)
const editingId = ref<string | null>(null)
const editorSubmitted = ref(false)

const editor = reactive<Omit<NodeConfig, 'id'>>({
  name: '',
  type: 'picmi-node',
  address: '',
  username: '',
  password: '',
  enabled: true,
  rootDir: '/'
})

const editorNameError = computed(() => {
  if (!editorSubmitted.value) return ''
  return editor.name.trim() ? '' : '请输入名称'
})

const editorAddressError = computed(() => {
  if (!editorSubmitted.value) return ''
  return editor.address.trim() ? '' : '请输入地址'
})

const openEditor = (node: NodeConfig | null) => {
  editorOpen.value = true
  editingId.value = node?.id ?? null
  editor.name = node?.name ?? ''
  editor.type = node?.type ?? 'picmi-node'
  editor.address = node?.address ?? ''
  editor.username = node?.username ?? ''
  editor.password = node?.password ?? ''
  editor.enabled = node?.enabled ?? true
  editor.rootDir = node?.rootDir ?? '/'
  editorSubmitted.value = false
}

const saveNode = async () => {
  editorSubmitted.value = true
  if (!editor.name.trim() || !editor.address.trim()) return
  const next: NodeConfig = {
    id: editingId.value ?? crypto.randomUUID(),
    name: editor.name.trim(),
    type: editor.type,
    address: editor.address.trim(),
    username: editor.username.trim(),
    password: editor.password,
    enabled: editor.enabled,
    rootDir: editor.rootDir.trim() || '/'
  }

  if (editingId.value) {
    nodes.value = nodes.value.map((n) => (n.id === editingId.value ? next : n))
  } else {
    nodes.value = [next, ...nodes.value]
  }

  editorOpen.value = false
  await saveConfig()
}

const askRemoveNode = (id: string) => {
  dialog.warning({
    title: '确认删除',
    content: '将删除该节点配置，确定吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      nodes.value = nodes.value.filter((n) => n.id !== id)
      await saveConfig()
    }
  })
}
</script>
