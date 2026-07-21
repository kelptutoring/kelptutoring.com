import { supabase } from '../../lib/supabase/supabaseClient.js'
import {
  normalizeCountries,
  normalizeConfigurationOptions,
  normalizeLocations,
  normalizeProfileConfiguration,
  normalizeRegions
} from './profile-contract.js'

export async function listProfileCountries() {
  return normalizeCountries(await callRpc('list_profile_countries'))
}

export async function listProfileRegions(countryCode) {
  return normalizeRegions(await callRpc('list_profile_regions', {
    p_country_code: countryCode
  }))
}

export async function listProfileCities(countryCode, regionCode) {
  return normalizeLocations(await callRpc('list_profile_cities', {
    p_country_code: countryCode,
    p_region_code: regionCode
  }))
}

// Transitional compatibility only. New pickers use the hierarchical RPCs above.
export async function listProfileLocations() {
  return normalizeLocations(await callRpc('list_profile_locations'))
}

export async function listProfileConfigurationOptions() {
  return normalizeConfigurationOptions(await callRpc('list_profile_configuration_options'))
}

export async function getMyProfileConfiguration() {
  return normalizeProfileConfiguration(await callRpc('get_my_profile_configuration'))
}

export async function saveMyStudentProfile({ profile, hobbyKeys, learningGoalKeys }) {
  return normalizeProfileConfiguration(await callRpc('save_my_student_profile', {
    p_profile: profile,
    p_hobby_keys: hobbyKeys,
    p_learning_goal_keys: learningGoalKeys
  }))
}

export async function saveMyPreferences(preferences) {
  return normalizeProfileConfiguration(await callRpc('save_my_preferences', {
    p_preferences: preferences
  }))
}

export async function resetMyPreferences(scope = 'all') {
  return normalizeProfileConfiguration(await callRpc('reset_my_preferences', {
    p_scope: scope
  }))
}

async function callRpc(name, parameters) {
  const { data, error } = await supabase.rpc(name, parameters)
  if (error) throw error
  return data
}
