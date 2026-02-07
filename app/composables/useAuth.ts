type LoginPayload = {
  username: string
  password: string
}

type AuthStatus = {
  needsSetup: boolean
  loggedIn: boolean
}

type AuthState = {
  loggedIn: boolean
  username: string | null
  checked: boolean
}

export function useAuth() {
  const { apiFetch } = useApi()
  const state = useState<AuthState>('auth.state', () => ({
    loggedIn: false,
    username: null,
    checked: false
  }))

  const setLoggedIn = (value: boolean, username?: string | null) => {
    state.value.loggedIn = value
    state.value.username = username ?? null
    if (!value) state.value.username = null
  }

  const login = async (payload: LoginPayload) => {
    await apiFetch('/login', {
      method: 'POST',
      body: payload
    })
    state.value.checked = true
    setLoggedIn(true, payload.username)
  }

  const fetchStatus = async () => {
    return apiFetch<AuthStatus>('/auth/status', { method: 'GET' })
  }

  const refreshAuth = async () => {
    try {
      const status = await fetchStatus()
      state.value.checked = true
      state.value.loggedIn = Boolean(status.loggedIn)
      if (!state.value.loggedIn) state.value.username = null
      return status
    } catch {
      state.value.checked = true
      state.value.loggedIn = false
      state.value.username = null
      return null
    }
  }

  const initAccount = async (payload: LoginPayload) => {
    await apiFetch('/auth/init', {
      method: 'POST',
      body: payload
    })
  }

  const logout = async () => {
    try {
      await apiFetch('/logout', { method: 'POST' })
    } finally {
      state.value.checked = true
      setLoggedIn(false, null)
    }
  }

  const updateCredentials = async (payload: LoginPayload) => {
    await apiFetch('/users/update', {
      method: 'POST',
      body: payload
    })
  }

  return {
    state,
    login,
    fetchStatus,
    refreshAuth,
    logout,
    updateCredentials,
    initAccount
  }
}
