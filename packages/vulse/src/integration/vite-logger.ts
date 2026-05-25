import { createLogger } from 'vite'

/** Upstream packages (Tailwind, tsx, blake3-wasm) ship broken source maps in dev. */
const BROKEN_SOURCEMAP_RE =
  /Failed to load source map|Sourcemap for .* points to missing source files/

function shouldSuppressSourcemapWarning(msg: unknown): boolean {
  return typeof msg === 'string' && BROKEN_SOURCEMAP_RE.test(msg)
}

export function createVulseViteLogger() {
  const logger = createLogger()
  const warn = logger.warn.bind(logger)
  logger.warn = (msg, options) => {
    if (shouldSuppressSourcemapWarning(msg)) return
    warn(msg, options)
  }
  const warnOnce = logger.warnOnce.bind(logger)
  logger.warnOnce = (msg, options) => {
    if (shouldSuppressSourcemapWarning(msg)) return
    warnOnce(msg, options)
  }
  return logger
}
