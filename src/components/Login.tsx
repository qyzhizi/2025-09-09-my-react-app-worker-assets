import { useEffect, useState } from 'react'

export function Login() {
  const [data, setData] = useState<{ message: string } | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/hello?name=Pages') // 请求同站 Worker 接口
        if (!res.ok) {
          console.error('Request failed:', res.status)
          return
        }

        const responseData = await res.json()
        setData(responseData)
      } catch (err) {
        console.error('Fetch error:', err)
      }
    }

    fetchData()
  }, [])

  return (
    <div className="p-4 mb-5 space-y-4">
      <h1>{data?.message}</h1>
      <a
        href="/api/github/login"
        className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 inline-block"
      >
        GitHub Login
      </a>
      <a
        href="/api/github-app/auth"
        className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-900 inline-block"
      >
        GitHub App Auth
      </a>
    </div>
  )
}
