import type { FC } from 'react'
import {useState, useEffect} from 'react'
import { Fragment } from 'react';
import { routes } from '@/Routers'
// import { useAuth } from '@/auth/AuthContext'


export const AppRouter: FC = () => {
  const [path, setPath] = useState(window.location.pathname)
  // const { isAuthenticated, isReady } = useAuth()

  // 监听地址变化
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // 🔐 Auth Guard（副作用放在 effect）
  // useEffect(() => {
  //   if (!isReady) return

  //   const route = routes.find(r => r.path === path)
  //   if (route?.auth && !isAuthenticated) {
  //     navigate('/login', { replace: true })
  //   }
  // }, [path, isAuthenticated, isReady])

  // if (!isReady) return null

  const route = routes.find(r => r.path === path)
  if (!route) return <div>404</div>

  // 防止未授权页面短暂闪现
  // if (route.auth && !isAuthenticated) return null

  const Layout = route.layout ?? Fragment
  return <Layout>{route.element}</Layout>
}