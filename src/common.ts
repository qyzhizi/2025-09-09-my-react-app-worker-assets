import { navigate } from "@/RouterLite";

export async function apiFetch(
  input: RequestInfo,
  init: RequestInit = {}
) {
  const res = await fetch(input, {
    ...init,
    credentials: 'include',
  })

  if (res.status === 401) {
    navigate('/login', false)
    throw new Error('Unauthorized')
  }

  return res
}



