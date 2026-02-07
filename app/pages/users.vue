<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div class="space-y-1">
        <h2 class="text-xl font-semibold text-zinc-900">用户管理</h2>
        <p class="text-sm text-zinc-500">管理用户名与密码</p>
      </div>
    </div>

    <n-card size="small" :bordered="false" class="rounded-xl shadow-sm">
       <template #header-extra>
         <n-button size="small" secondary @click="openEditor(null)">
           <template #icon><n-icon :component="PersonAddOutline" /></template>
           添加用户
         </n-button>
       </template>
       
       <n-data-table
         :columns="columns"
         :data="users"
         :bordered="false"
         :single-line="false"
         :row-key="(row) => row.username"
       />
    </n-card>

    <n-modal
       v-model:show="editorOpen"
       preset="card"
       :title="editingUsername ? '修改用户' : '添加用户'"
       class="w-full max-w-md"
       :segmented="{ content: 'soft', footer: 'soft' }"
       size="medium"
       :bordered="false"
    >
       <n-form label-placement="top" class="mt-2">
         <n-form-item label="用户名" :validation-status="usernameError ? 'error' : undefined" :feedback="usernameError">
           <n-input v-model:value="editor.username" :disabled="Boolean(editingUsername)" placeholder="请输入用户名" />
         </n-form-item>
         <n-form-item label="密码" :validation-status="passwordError ? 'error' : undefined" :feedback="passwordError">
           <n-input v-model:value="editor.password" type="password" show-password-on="click" autocomplete="new-password" placeholder="请输入密码" />
         </n-form-item>
       </n-form>
       <template #footer>
          <div class="flex justify-end gap-3">
            <n-button @click="editorOpen = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="saveUser">保存</n-button>
          </div>
       </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, h } from 'vue'
import { 
  NCard, NForm, NFormItem, NInput, NButton, NIcon, NDataTable, NModal, NSpace, useMessage, useDialog,
  type DataTableColumns
} from 'naive-ui'
import { PersonAddOutline } from '@vicons/ionicons5'

const message = useMessage()
const dialog = useDialog()
const { apiFetch } = useApi()

type UserRow = {
  username: string
}

const users = ref<UserRow[]>([])
const saving = ref(false)

const load = async () => {
  try {
    const res = await apiFetch<{ users?: UserRow[] }>('/users', { method: 'GET' })
    users.value = res.users ?? []
  } catch {
    users.value = [{ username: 'admin' }]
  }
}

await load()

const columns: DataTableColumns<UserRow> = [
  { title: '用户名', key: 'username' },
  {
    title: '操作',
    key: 'actions',
    width: 150,
    render(row) {
      return h(NSpace, {}, { default: () => [
        h(NButton, { size: 'tiny', secondary: true, onClick: () => openEditor(row) }, { default: () => '修改' }),
        h(NButton, { size: 'tiny', type: 'error', secondary: true, onClick: () => confirmDelete(row.username) }, { default: () => '删除' })
      ]})
    }
  }
]

const editorOpen = ref(false)
const editingUsername = ref<string | null>(null)
const editor = reactive({ username: '', password: '' })
const submitted = ref(false)

const usernameError = computed(() => {
  if (!submitted.value) return ''
  return editor.username.trim() ? '' : '请输入用户名'
})

const passwordError = computed(() => {
  if (!submitted.value) return ''
  if (editingUsername.value) return ''
  return editor.password.trim() ? '' : '请输入密码'
})

const openEditor = (u: UserRow | null) => {
  editorOpen.value = true
  editingUsername.value = u?.username ?? null
  editor.username = u?.username ?? ''
  editor.password = ''
  submitted.value = false
}

const saveUser = async () => {
  submitted.value = true
  if (!editor.username.trim()) return
  if (!editingUsername.value && !editor.password.trim()) return
  saving.value = true
  try {
    const body: { username: string; password?: string } = {
      username: editor.username.trim()
    }
    if (editor.password.trim()) body.password = editor.password

    await apiFetch('/users', { method: 'POST', body })
    message.success('已保存')
    editorOpen.value = false
    await load()
  } catch {
    message.error('保存失败')
  } finally {
    saving.value = false
  }
}

const confirmDelete = (username: string) => {
  dialog.warning({
    title: '确认删除',
    content: `将删除用户 “${username}”。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      saving.value = true
      try {
        await apiFetch('/users', { method: 'DELETE', query: { username } })
        message.success('已删除')
        await load()
      } catch {
        message.error('删除失败')
      } finally {
        saving.value = false
      }
    }
  })
}
</script>
