<template>
  <div class="max-w-4xl mx-auto space-y-6">
    <div class="space-y-1">
      <h2 class="text-xl font-semibold text-zinc-900">个人资料</h2>
      <p class="text-sm text-zinc-500">管理您的个人信息与安全设置</p>
    </div>

    <div class="grid gap-6 md:grid-cols-3">
      <!-- 左侧：个人信息卡片 -->
      <n-card :bordered="false" class="md:col-span-1 rounded-xl shadow-sm h-fit">
        <div class="flex flex-col items-center text-center py-6">
          <n-avatar :size="96" round class="bg-primary text-white text-3xl mb-4">
            {{ (username || 'A').charAt(0).toUpperCase() }}
          </n-avatar>
          <h3 class="text-lg font-medium text-zinc-900">{{ username }}</h3>
          <p class="text-sm text-zinc-500 mt-1">管理员</p>
        </div>
      </n-card>

      <!-- 右侧：修改密码表单 -->
      <n-card :bordered="false" class="md:col-span-2 rounded-xl shadow-sm" title="安全设置">
        <n-form
          ref="formRef"
          :model="formModel"
          :rules="rules"
          label-placement="top"
          require-mark-placement="right-hanging"
          class="max-w-lg"
        >
          <n-form-item label="用户名">
            <n-input :value="username" disabled placeholder="用户名" />
          </n-form-item>
          
          <n-divider />

          <n-form-item label="新密码" path="password">
            <n-input
              v-model:value="formModel.password"
              type="password"
              show-password-on="click"
              placeholder="请输入新密码"
            />
          </n-form-item>

          <n-form-item label="确认新密码" path="confirmPassword">
            <n-input
              v-model:value="formModel.confirmPassword"
              type="password"
              show-password-on="click"
              placeholder="请再次输入新密码"
              :disabled="!formModel.password"
            />
          </n-form-item>

          <div class="flex justify-end pt-4">
            <n-button type="primary" :loading="saving" @click="handleSave" :disabled="!isFormValid">
              保存更改
            </n-button>
          </div>
        </n-form>
      </n-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { 
  NCard, NAvatar, NForm, NFormItem, NInput, NButton, NDivider, useMessage, 
  type FormInst, type FormRules, type FormItemRule
} from 'naive-ui'

const message = useMessage()
const { state: authState, updateCredentials } = useAuth()

const username = computed(() => authState.value.username || 'Admin')
const formRef = ref<FormInst | null>(null)
const saving = ref(false)

const formModel = reactive({
  password: '',
  confirmPassword: ''
})

const validatePasswordSame = (rule: FormItemRule, value: string) => {
  return value === formModel.password
}

const rules: FormRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: ['input', 'blur'] },
    { min: 6, message: '密码长度不能少于 6 位', trigger: ['input', 'blur'] }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: ['input', 'blur'] },
    { validator: validatePasswordSame, message: '两次输入的密码不一致', trigger: ['blur', 'input'] }
  ]
}

const isFormValid = computed(() => {
  return formModel.password && formModel.confirmPassword && formModel.password === formModel.confirmPassword
})

const handleSave = async (e: MouseEvent) => {
  e.preventDefault()
  formRef.value?.validate(async (errors) => {
    if (!errors) {
      saving.value = true
      try {
        await updateCredentials({
          username: username.value,
          password: formModel.password
        })
        message.success('密码修改成功')
        formModel.password = ''
        formModel.confirmPassword = ''
      } catch (error: any) {
        message.error(error?.message || '修改失败，请重试')
      } finally {
        saving.value = false
      }
    }
  })
}
</script>
