import { supabase } from '../../lib/supabase/supabaseClient.js';
import { createSupabaseExamAdapters } from './exam-supabase-adapters.js';

const registry = globalThis.KelpBackendAdapters || (globalThis.KelpBackendAdapters = {});

// Respect an explicitly installed provider. This is the platform default only
// when the host application has not registered another exams provider.
if (!registry.exams) {
  registry.exams = async () => createSupabaseExamAdapters({ supabase });
}

export { createSupabaseExamAdapters };
