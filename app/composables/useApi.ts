export type ApiFetchOptions<T> = Omit<Parameters<typeof $fetch<T>>[1], 'baseURL'>

type ApiEnvelope<T> = {
  code: number
  message: string
  data: T
}

const isEnvelope = (value: unknown): value is ApiEnvelope<unknown> => {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return 'code' in record && 'message' in record && 'data' in record
}

export function useApi() {
  const config = useRuntimeConfig()

  const apiFetch = async <T>(path: string, options: ApiFetchOptions<T> = {}) => {
    const res = await $fetch<any>(path, {
      baseURL: config.public.apiBase,
      credentials: 'include',
      ...options
    })

    if (isEnvelope(res)) {
      if (res.code !== 0) {
        const error: any = new Error(res.message || '请求失败')
        error.data = res
        throw error
      }
      return res.data as T
    }

    return res as T
  }

  return { apiFetch }
}
