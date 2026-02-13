<template>
  <n-modal
    v-model:show="open"
    preset="card"
    title="上传文件"
    class="w-full max-w-xl"
    :segmented="{ content: 'soft', footer: 'soft' }"
    size="large"
    :bordered="false"
  >
    <div class="space-y-6">
      <input
        ref="manualFileInput"
        type="file"
        multiple
        style="position: fixed; left: 0; top: 0; width: 1px; height: 1px; opacity: 0;"
        @change="handleManualFileInputChange"
      />
      <div class="flex items-center justify-between text-sm text-zinc-500 bg-zinc-50 px-3 py-2 rounded-md border border-zinc-100">
        <span>当前目录：{{ currentPath }}</span>
      </div>

      <div class="grid gap-6 sm:grid-cols-2">
        <n-form-item label="上传模式" :show-feedback="false">
          <n-select v-model:value="mode" :options="modeOptions" />
        </n-form-item>
        <n-form-item label="目标目录" :show-feedback="false">
          <n-input v-model:value="targetPath" />
        </n-form-item>
      </div>

      <n-form-item label="缩略图处理位置" :show-feedback="false">
        <n-select v-model:value="thumbnailProcessing" :options="thumbnailProcessingOptions" />
      </n-form-item>

      <n-upload
        multiple
        directory-dnd
        :default-upload="false"
        @change="handleFileChange"
        :show-file-list="false"
        class="block"
      >
        <n-upload-dragger class="!border-dashed !border-2 !border-primary/20 hover:!border-primary/50 transition-colors">
          <div class="mb-3 flex justify-center">
            <n-icon size="48" :depth="3" :component="CloudUploadOutline" class="text-primary/60" />
          </div>
          <n-text style="font-size: 16px" class="font-medium text-zinc-700">
            点击或拖拽文件到此处<br/>
          </n-text>
          <n-text style="font-size: 15px" class="font-medium text-zinc-700">
            Ctrl+C直接添加图片
          </n-text>
          <n-p depth="3" style="margin: 8px 0 0 0" class="text-zinc-400">
            <br/>支持多文件上传
          </n-p>
        </n-upload-dragger>
      </n-upload>

      <div v-if="files.length" class="space-y-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-zinc-700">待上传（{{ files.length }}）</div>
          <n-button text size="tiny" type="error" @click="clear">清空列表</n-button>
        </div>
        <div class="max-h-48 space-y-2 overflow-auto rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm custom-scrollbar">
          <div v-for="(item, idx) in files" :key="item.id" class="flex items-center justify-between gap-3 px-3 py-2 bg-white rounded-md shadow-sm border border-sky-100">
            <div class="min-w-0 flex-1">
              <input 
                v-model="item.name" 
                class="w-full bg-transparent border-none p-0 text-sky-700 font-medium focus:ring-0 text-sm truncate"
                @click.stop
              />
            </div>
            <div class="shrink-0 text-xs text-sky-600 font-mono bg-sky-100 px-1.5 py-0.5 rounded">{{ prettySize(item.file.size) }}</div>
            <n-button text size="tiny" type="error" @click="removeFile(idx)">
              <template #icon><n-icon :component="CloseOutline" /></template>
            </n-button>
          </div>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <n-button @click="open = false" size="medium">取消</n-button>
        <n-button type="primary" :disabled="!files.length" :loading="uploading" @click="onUpload" size="medium">
          开始上传
        </n-button>
      </div>
    </template>
  </n-modal>

  <n-modal v-model:show="overrideDialogOpen" preset="dialog" title="发现同名文件">
    <div class="space-y-3">
      <div class="text-zinc-600">{{ overrideDescription }}</div>
      <div class="pt-1">
        <n-checkbox v-model:checked="overrideApplyAll">对后续同名文件使用此选择</n-checkbox>
      </div>
    </div>
    <template #action>
      <n-button @click="decideOverride(false)">跳过</n-button>
      <n-button type="warning" @click="decideOverride(true)">覆盖</n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
import { ref, watch, toRefs } from 'vue'
import { 
  NModal, NUpload, NUploadDragger, NIcon, NText, NP, NButton, NSelect, NInput, NFormItem, NCheckbox, useMessage,
  type UploadFileInfo 
} from 'naive-ui'
import { CloudUploadOutline, CloseOutline } from '@vicons/ionicons5'

const open = defineModel<boolean>({ required: true })
const props = defineProps<{
  currentPath: string
  incomingFiles?: File[]
}>()

const emit = defineEmits<{
  uploaded: []
}>()

const config = useRuntimeConfig()
const { apiFetch } = useApi()
const message = useMessage()

type UploadMode = 'backend' | 'frontend'
type ThumbnailProcessing = 'follow' | 'backend' | 'node'
type FileItem = {
  id: string
  file: File
  name: string
}

const modeOptions = [
  { label: '仅后端上传（默认）', value: 'backend' },
  { label: '仅前端上传', value: 'frontend' }
]

const mode = ref<UploadMode>('backend')
const thumbnailProcessingOptions = [
  { label: '跟随系统设置', value: 'follow' },
  { label: '存储节点处理缩略图', value: 'node' },
  { label: '后端压缩后上传', value: 'backend' }
]
const thumbnailProcessing = ref<ThumbnailProcessing>('follow')
const targetPath = ref(props.currentPath)
watch(
  () => props.currentPath,
  (v) => {
    targetPath.value = v
  }
)

const files = ref<FileItem[]>([])
const uploading = ref(false)
const manualFileInput = ref<HTMLInputElement | null>(null)

watch(open, (v) => {
  if (!v) clear()
})

type OverrideMode = 'ask' | 'override-all' | 'skip-all'

const overrideMode = ref<OverrideMode>('ask')
const overrideDialogOpen = ref(false)
const overrideDescription = ref('')
const overrideApplyAll = ref(false)
const overrideResolver = ref<((override: boolean) => void) | null>(null)

watch(
  () => props.incomingFiles,
  (incoming) => {
    if (!incoming?.length) return
    addFiles(incoming)
  },
  { deep: true }
)

const handleFileChange = (data: { fileList: UploadFileInfo[] }) => {
  const incoming = data.fileList.map(f => f.file).filter((f): f is File => !!f)
  addFiles(incoming)
}

const handleManualFileInputChange = (e: Event) => {
  const input = e.target as HTMLInputElement | null
  const picked = input?.files ? Array.from(input.files) : []
  addFiles(picked)
  if (input) input.value = ''
}

const addFiles = (incoming: File[]) => {
  const existingNames = new Set(files.value.map(f => f.name))
  const unique = incoming.filter(f => !existingNames.has(f.name))
  if (!unique.length) return
  
  const newItems = unique.map(f => ({
    id: crypto.randomUUID(),
    file: f,
    name: f.name
  }))

  files.value = [...files.value, ...newItems]
}

const clear = () => {
  files.value = []
}

const removeFile = (idx: number) => {
  files.value.splice(idx, 1)
}

const prettySize = (size: number) => {
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

const hasEnabledNodes = (nodes: any[]) => nodes.some((node) => node && node.enabled !== false)

const checkNodesConfigured = async () => {
  try {
    const res = await apiFetch<any>('/config', { method: 'GET' })
    const nodes = Array.isArray(res?.nodes) ? res.nodes : []
    const enableLocalStorage = res?.enableLocalStorage === true
    return enableLocalStorage || hasEnabledNodes(nodes)
  } catch {
    return false
  }
}

const checkExists = async (item: FileItem) => {
  try {
    const res = await apiFetch<{ exists: boolean }>('/images/exists', {
      method: 'GET',
      query: {
        path: targetPath.value,
        filename: item.name
      }
    })
    return res.exists
  } catch {
    return false
  }
}

const decideOverride = (override: boolean) => {
  if (overrideApplyAll.value) {
    overrideMode.value = override ? 'override-all' : 'skip-all'
  }
  overrideDialogOpen.value = false
  overrideResolver.value?.(override)
  overrideResolver.value = null
}

watch(overrideDialogOpen, (v) => {
  if (!v && overrideResolver.value) {
    overrideResolver.value(false)
    overrideResolver.value = null
  }
})

const ensureOverrideDecision = async (item: FileItem) => {
  if (overrideMode.value === 'override-all') return true
  if (overrideMode.value === 'skip-all') return false

  overrideApplyAll.value = false
  overrideDescription.value = `“${item.name}” 已存在，是否覆盖？`
  overrideDialogOpen.value = true
  return await new Promise<boolean>((resolve) => {
    overrideResolver.value = resolve
  })
}

const uploadOneBackend = async (item: FileItem, override: boolean) => {
  const fd = new FormData()
  fd.append('file', item.file, item.name)
  fd.append('path', targetPath.value)
  fd.append('override', override ? '1' : '0')
  if (thumbnailProcessing.value !== 'follow') fd.append('thumbnailProcessing', thumbnailProcessing.value)

  await $fetch(config.public.uploadPath, {
    method: 'POST',
    body: fd,
    credentials: 'include'
  })
}

const uploadOneFrontend = async (item: FileItem) => {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(item.file)
  })

  await apiFetch('/images/upload-base64', {
    method: 'POST',
    body: {
      path: targetPath.value,
      filename: item.name,
      base64,
      thumbnailProcessing: thumbnailProcessing.value === 'follow' ? undefined : thumbnailProcessing.value
    }
  })
}

const getUploadErrorText = (e: any) => {
  const apiMessage = e?.data?.message || e?.response?._data?.message
  if (typeof apiMessage === 'string' && apiMessage.trim()) return apiMessage.trim()

  const status = e?.status || e?.statusCode || e?.response?.status
  const code = e?.data?.code || e?.response?._data?.code
  if (status === 413 || code === 41301) return '文件过大'
  if (status === 415 || code === 41501) return '文件类型不支持'
  if (status === 409 || code === 40901) return '文件已存在'
  if (status === 401 || code === 40101) return '未登录'

  const rawMessage = e?.message
  if (rawMessage && /fetch|network/i.test(rawMessage)) return '无法连接到服务'
  return (typeof rawMessage === 'string' && rawMessage.trim()) ? rawMessage.trim() : '上传失败'
}

const onUpload = async () => {
  uploading.value = true
  try {
    const ready = await checkNodesConfigured()
    if (!ready) {
      message.error('请先在系统设置配置并启用存储节点或本地存储')
      return
    }
    for (const item of files.value) {
      try {
        const exists = await checkExists(item)
        const override = exists ? await ensureOverrideDecision(item) : false
        if (exists && !override) continue

        if (mode.value === 'backend') {
          await uploadOneBackend(item, override)
        } else {
          await uploadOneFrontend(item)
        }
      } catch (e: any) {
        const text = getUploadErrorText(e)
        message.error(`${item.name} 上传失败：${text}`)
        if (e && typeof e === 'object') (e as any).__picmiHandledMessage = true
        throw e
      }
    }

    clear()
    overrideMode.value = 'ask'
    message.success('上传完成')
    emit('uploaded')
    open.value = false
  } catch (error) {
    if (error && typeof error === 'object' && (error as any).__picmiHandledMessage === true) return
    const text = getUploadErrorText(error)
    message.error(`上传失败：${text}`)
  } finally {
    uploading.value = false
  }
}

const { currentPath } = toRefs(props)
</script>
