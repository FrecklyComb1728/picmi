type ApiFetchExtraOptions = {
  method?:
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'
    | 'CONNECT'
    | 'TRACE'
    | 'get'
    | 'post'
    | 'put'
    | 'patch'
    | 'delete'
    | 'head'
    | 'options'
    | 'connect'
    | 'trace'
  query?: Record<string, any>
  body?: any
  headers?: HeadersInit
  credentials?: RequestCredentials
}

export type ApiFetchOptions<T> = Omit<Parameters<typeof $fetch<T>>[1], 'baseURL' | 'headers' | 'method' | 'query' | 'body' | 'credentials'> &
  ApiFetchExtraOptions

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
    const headers = (() => {
      if (!import.meta.server) return options.headers
      const reqHeaders = useRequestHeaders(['cookie'])
      if (!options.headers) return reqHeaders
      const merged = new Headers(reqHeaders as any)
      new Headers(options.headers as any).forEach((value, key) => merged.set(key, value))
      return Object.fromEntries(merged.entries())
    })()

    const res = await $fetch<any>(path, {
      baseURL: config.public.apiBase,
      credentials: 'include',
      ...options,
      headers
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
