import type { APIRoute } from 'astro'
import { livePreviewBridgeSource } from '../assets/live-preview-bridge.content.js'

export const GET: APIRoute = async () => {
  return new Response(livePreviewBridgeSource, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
