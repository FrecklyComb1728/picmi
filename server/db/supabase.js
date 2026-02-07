import { createClient } from '@supabase/supabase-js'

const initSupabase = async (config) => {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false }
  })

  const all = async (table, select) => {
    const { data, error } = await client.from(table).select(select)
    if (error) throw error
    return data ?? []
  }

  const upsert = async (table, values) => {
    const { error } = await client.from(table).upsert(values)
    if (error) throw error
  }

  const del = async (table, match) => {
    const { error } = await client.from(table).delete().match(match)
    if (error) throw error
  }

  const replace = async (table, rows, matchKey) => {
    if (rows.length === 0) {
      await client.from(table).delete().neq(matchKey, '')
      return
    }
    await client.from(table).delete().neq(matchKey, '')
    const { error } = await client.from(table).insert(rows)
    if (error) throw error
  }

  return {
    all,
    upsert,
    del,
    replace,
    close: async () => {}
  }
}

export { initSupabase }
