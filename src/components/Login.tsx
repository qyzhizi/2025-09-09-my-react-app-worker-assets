import { useState, useEffect } from "react";
import {apiFetch} from "@/common"

export function Login() {
  const [data, setData] = useState<{ message: string } | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch('/api/hello?name=Pages') // 请求同站Worker接口
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
    </div>
  )
}

export const LoginIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5.121 17.804A13.937 13.937 0 0112 15c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

export const Avatar = ({ src }: { src: string }) => (
  <img
    src={src}
    alt="avatar"
    className="w-8 h-8 rounded-full"
  />
);
