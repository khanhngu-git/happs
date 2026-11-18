export const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
/** Advanced Markers need a Map ID; DEMO_MAP_ID works for development only. */
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'
export const hasMaps = MAPS_API_KEY.length > 0
