import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const hostedSupabase = {
  url: 'https://vzbgijnwmavmdahybcxw.supabase.co',
  key: 'sb_publishable_QPRgN6fF4Pd5EoLeARWZsQ_P8_4FIAO'
}

const localSupabase = {
  url: 'http://127.0.0.1:54321',
  key: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'
}

function shouldUseLocalSupabase() {
  const hostname = globalThis.location?.hostname
  return hostname === '127.0.0.1' || hostname === 'localhost'
}

const supabaseTarget = shouldUseLocalSupabase() ? localSupabase : hostedSupabase

export const supabase = createClient(supabaseTarget.url, supabaseTarget.key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
