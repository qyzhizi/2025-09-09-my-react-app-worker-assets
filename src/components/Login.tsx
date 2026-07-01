import { useState, useEffect } from "react";
import { apiFetch } from "@/common"

export function Login() {
  const [data, setData] = useState<{ message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await apiFetch('/api/hello?name=Pages') // Request same-site Worker interface
        if (!res.ok) {
          console.error('Request failed:', res.status)
          return
        }
        const responseData = await res.json()
        setData(responseData)
      } catch (err) {
        console.error('Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  return (
    <div className="w-full h-full flex items-center justify-center text-gray-900 dark:text-gray-100 px-4 py-10">
      <div className="w-full max-w-sm bg-white/95 dark:bg-zinc-900/95 rounded-3xl shadow-2xl shadow-black/5 border border-gray-200 dark:border-zinc-800 p-8 text-center space-y-6 backdrop-blur-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {loading ? "加载中..." : data?.message ?? "欢迎"}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">请使用 GitHub 账号登录</p>
        </div>

        <a
          href="/api/github/login"
          className="inline-flex items-center justify-center gap-2 w-full max-w-[220px] px-4 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 transition-colors duration-200 mx-auto"
        >
          <GithubMark />
          使用 GitHub 登录
        </a>
      </div>
    </div>
  )
}

// 简单的 GitHub 图标，用于登录按钮
const GithubMark = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 016 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22 0 1.6-.02 2.89-.02 3.29 0 .32.22.7.83.58C20.56 21.79 24 17.29 24 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

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
    className="w-8 h-8 rounded-full ring-2 ring-white shadow-sm"
  />
);