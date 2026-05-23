export async function sendFormWebhook(
  url: string,
  payload: unknown,
  headers: Record<string, string> = {},
): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`webhook failed: ${res.status}`)
  } finally {
    clearTimeout(timeout)
  }
}
