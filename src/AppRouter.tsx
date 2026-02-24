import type { FC } from 'react'
import {useState, useEffect} from 'react'
import { Fragment } from 'react';
import { routes } from '@/Routers'


export const AppRouter: FC = () => {
  const [path, setPath] = useState(window.location.pathname)

  // Listen for address changes
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const route = routes.find(r => r.path === path)
  if (!route) return <div>404</div>

  const Layout = route.layout ?? Fragment
  return <Layout>{route.element}</Layout>
}