const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers)

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      ...options,
      headers,
    })
  } catch {
    throw new Error('Unable to connect to CareerForge. Check that the API server is running.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = body?.detail
    const error = new Error(Array.isArray(detail) ? detail.map((item) => item.msg).join(', ') : detail || 'The request could not be completed.')
    error.status = response.status
    throw error
  }

  return body
}
