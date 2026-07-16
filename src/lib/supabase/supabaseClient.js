import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://vzbgijnwmavmdahybcxw.supabase.co'
const supabaseKey = 'sb_publishable_QPRgN6fF4Pd5EoLeARWZsQ_P8_4FIAO'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
