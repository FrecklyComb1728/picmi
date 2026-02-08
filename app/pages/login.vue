<template>
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <img :src="logoUrl" alt="PicMi" class="mx-auto h-12 w-12" />
      <h1 class="mt-4 text-2xl font-bold tracking-tight text-zinc-900">{{ needsSetup ? '初始化管理员' : '欢迎回来' }}</h1>
      <p class="mt-2 text-sm text-zinc-500">{{ needsSetup ? '首次使用请创建管理员账号' : '请登录以管理您的图床' }}</p>
    </div>

    <n-card size="large" :bordered="false" class="shadow-xl rounded-2xl">
      <n-form ref="formRef" :model="formModel" :rules="rules" size="large">
        <n-form-item path="username" label="用户名">
          <n-input v-model:value="formModel.username" placeholder="请输入用户名" @keydown.enter="handleLogin">
            <template #prefix>
              <n-icon :component="PersonOutline" class="text-zinc-400" />
            </template>
          </n-input>
        </n-form-item>
        <n-form-item path="password" label="密码">
          <n-input
            v-model:value="formModel.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            @keydown.enter="handleLogin"
          >
            <template #prefix>
              <n-icon :component="LockClosedOutline" class="text-zinc-400" />
            </template>
          </n-input>
        </n-form-item>
        
        <div class="mt-2">
          <n-button type="primary" block size="large" :loading="loading" @click="handleLogin">
            {{ needsSetup ? '初始化并登录' : '登录' }}
          </n-button>
        </div>
      </n-form>
    </n-card>

    <p class="mt-8 text-center text-xs text-zinc-400">
      PicMi Image Hosting &copy; {{ new Date().getFullYear() }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { 
  NCard, NForm, NFormItem, NInput, NButton, NIcon, useMessage, type FormInst 
} from 'naive-ui'
import { PersonOutline, LockClosedOutline } from '@vicons/ionicons5'
import logoUrl from '~/assets/svg/logo.svg?url'

definePageMeta({
  layout: 'auth'
})

const route = useRoute()
const { login, fetchStatus } = useAuth()
const { apiFetch } = useApi()
const message = useMessage()

const formRef = ref<FormInst | null>(null)
const loading = ref(false)
const needsSetup = ref(false)
const formModel = reactive({
  username: '',
  password: ''
})

const rules = {
  username: { required: true, message: '请输入用户名', trigger: 'blur' },
  password: { required: true, message: '请输入密码', trigger: 'blur' }
}

const getRedirectUrl = () => {
  const url = route.query.url
  if (typeof url !== 'string' || !url.startsWith('/')) return '/dashboard'
  if (url.startsWith('/login')) return '/dashboard'
  return url
}

try {
  const status = await fetchStatus()
  needsSetup.value = Boolean(status?.needsSetup)
} catch {
  needsSetup.value = false
}

const handleLogin = async () => {
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      loading.value = true
      try {
        if (needsSetup.value) {
          await apiFetch('/users', { method: 'POST', body: { username: formModel.username, password: formModel.password } })
        }
        await login({ username: formModel.username, password: formModel.password })
        message.success(needsSetup.value ? '初始化成功' : '登录成功')
        await navigateTo(getRedirectUrl())
      } catch (e: any) {
        const apiMessage = e?.data?.message || e?.response?._data?.message
        const status = e?.status || e?.response?.status
        const code = e?.data?.code || e?.response?._data?.code
        const rawMessage = e?.message
        let errorText = apiMessage
        if (!errorText) {
          if (status === 401 || code === 40101) errorText = '账号或密码错误'
          else if (rawMessage && /fetch|network/i.test(rawMessage)) errorText = '无法连接到服务'
          else errorText = rawMessage || '服务异常，请稍后重试'
        }
        message.error(errorText)
      } finally {
        loading.value = false
      }
    }
  })
}
</script>
