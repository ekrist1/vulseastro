import morphdom from 'morphdom'

const ROOT = document.documentElement.dataset.vulsePreviewRoot ?? 'main'

window.addEventListener('message', async (event) => {
  if (event.origin !== window.location.origin) return
  if (event.data?.name !== 'vulse.preview.updated') return

  const res = await fetch(window.location.href, {
    cache: 'no-store',
    credentials: 'include',
    headers: { Accept: 'text/html' },
  })
  if (!res.ok) return
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const from = doc.querySelector(ROOT)
  const to = document.querySelector(ROOT)
  if (from && to) morphdom(to, from, { childrenOnly: true })
})
