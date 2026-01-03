import { navigate } from '@/Routers'


export async function apiFetch(
  input: RequestInfo,
  init: RequestInit = {}
) {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
  })

  if (res.status === 401) {
    navigate('/login', { replace: true })
    throw new Error('Unauthorized')
  }

  return res
}



