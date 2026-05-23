import bridgeJs from '../assets/live-preview-bridge.js?raw'

export function previewBridgeRoute() {
  return async () => new Response(bridgeJs, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
