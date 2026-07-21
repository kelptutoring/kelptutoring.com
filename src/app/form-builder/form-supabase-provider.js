import { supabase } from '../../lib/supabase/supabaseClient.js';
import { createSupabaseFormAdapters } from './form-supabase-adapters.js';

const registry = globalThis.KelpBackendAdapters || (globalThis.KelpBackendAdapters = {});

// Respect an explicitly installed provider. This module supplies the platform
// default only when no other forms provider has been registered.
if (!registry.forms) {
  registry.forms = async () => createSupabaseFormAdapters({ supabase });
}

export { createSupabaseFormAdapters };
