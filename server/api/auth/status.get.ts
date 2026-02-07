import { fail, isLoggedIn, ok, usePicmi } from '../../utils/nitro'

export default defineEventHandler(async (event) => {
  try {
    const picmi = await usePicmi(event)
    const users = await picmi.store.getUsers()
    return ok({ needsSetup: users.length === 0, loggedIn: isLoggedIn(event) })
  } catch {
    return fail(event, 500, 1, '服务异常')
  }
})
