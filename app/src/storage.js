// Storage abstraction layer
// Uses localStorage (works everywhere) with fallback

const STORAGE_PREFIX = "faro_";

export async function storageGet(key) {
  try {
    // Try window.storage first (Claude artifacts)
    if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") {
      const result = await window.storage.get(key);
      if (result && result.value) return result.value;
    }
  } catch {}

  // Fallback to localStorage
  try {
    const val = localStorage.getItem(STORAGE_PREFIX + key);
    return val || null;
  } catch {
    return null;
  }
}

export async function storageSet(key, value) {
  // Always save to localStorage
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {}

  // Also try window.storage (Claude artifacts)
  try {
    if (typeof window !== "undefined" && window.storage && typeof window.storage.set === "function") {
      await window.storage.set(key, value);
    }
  } catch {}
}
