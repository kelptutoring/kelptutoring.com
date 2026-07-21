import { supabase } from '../lib/supabase/supabaseClient.js'

export async function getMyLearningRelationships() {
  const { data, error } = await supabase.rpc('get_my_learning_relationships')
  if (error) throw error

  return {
    schemaVersion: Number(data?.schemaVersion) || 1,
    courses: Array.isArray(data?.courses) ? data.courses : [],
    supervisions: Array.isArray(data?.supervisions) ? data.supervisions : []
  }
}
