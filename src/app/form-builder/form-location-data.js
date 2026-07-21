(function attachKelpLocationData(root) {
  'use strict';

  const MODULE_URL = 'https://cdn.jsdelivr.net/npm/@countrystatecity/countries-browser@1.0.2/+esm';
  const ATTRIBUTION = Object.freeze({
    label: 'Countries States Cities Database',
    url: 'https://github.com/dr5hn/countries-states-cities-database',
    license: 'ODbL 1.0'
  });
  let apiPromise = null;

  function loadApi() {
    if (!apiPromise) {
      apiPromise = import(MODULE_URL).catch((error) => {
        apiPromise = null;
        throw error;
      });
    }
    return apiPromise;
  }

  function byLabel(first, second) {
    return String(first.label).localeCompare(String(second.label), undefined, { sensitivity: 'base' });
  }

  function cleanOptions(items, codeKey = 'iso2') {
    return (Array.isArray(items) ? items : [])
      .map((item) => ({
        code: String(item?.[codeKey] ?? item?.id ?? '').trim(),
        label: String(item?.name || '').trim()
      }))
      .filter((item) => item.code && item.label)
      .sort(byLabel);
  }

  async function getCountries() {
    const api = await loadApi();
    return cleanOptions(await api.getCountries());
  }

  async function getStates(countryCode) {
    if (!countryCode) return [];
    const api = await loadApi();
    return cleanOptions(await api.getStatesOfCountry(countryCode));
  }

  async function getCities(countryCode, stateCode) {
    if (!countryCode || !stateCode) return [];
    const api = await loadApi();
    return cleanOptions(await api.getCitiesOfState(countryCode, stateCode), 'id');
  }

  root.KelpLocationData = Object.freeze({
    ATTRIBUTION,
    getCountries,
    getStates,
    getCities
  });
})(globalThis);
