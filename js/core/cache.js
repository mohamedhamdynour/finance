// Browser caching is intentionally disabled. Supabase is the single source of truth.
export async function saveCache() {}
export async function loadCache() { return null; }
export function applyCacheToDB() { return false; }
export async function clearCache() {}
export async function cacheInfo() { return null; }
