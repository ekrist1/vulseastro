/** Normalize Astro/Vue boolean props (`false`, `"false"`, `0`, etc.). */
export function isLivePreviewEnabled(value: unknown): boolean {
  if (value === false || value === 'false' || value === 0 || value === '0') return false
  return true
}
