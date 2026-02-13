import type { ReactNode, FC } from 'react'

import Logs from './components/Logs'
import { Login } from './components/Login'
import { InitRefreshToken } from './components/InitRefreshToken'
import MainSettingPage from './components/settings/MainSettingPage'
import LocalStoreApp from './LocalStoreApp'
import GithubAppSetupSuccess from './components/GithubAppSetupSuccess'

import {AppLayout} from './layouts/AppLayout'
import {EmptyLayout} from './layouts/EmptyLayout'

export type RouteConfig = {
  path: string
  element: ReactNode
  layout?: FC<{ children: ReactNode }>
  auth?: boolean
}

type NavigateOptions = {
  replace?: boolean
}

export const routes: RouteConfig[] = [
  {
    path: '/login',
    element: <Login />,
    layout: EmptyLayout,
  },
  {
    path: '/',
    element: <Logs />,
    layout: AppLayout,
    auth: true,
  },
  {
    path: '/settings-page',
    element: <MainSettingPage />,
    layout: AppLayout,
    auth: true,
  },
  {
    path: '/local-store',
    element: <LocalStoreApp />,
    layout: AppLayout,
    auth: true,
  },
  {
    path:'/login-callback-init-refresh-token',
    element: <InitRefreshToken />,
    layout: EmptyLayout,
  },
  {
    path: '/github-app-setup-success',
    element: <GithubAppSetupSuccess />,
    layout: EmptyLayout,
  }

]


export function navigate(path: string, options: NavigateOptions = {}) {
  const { replace = false } = options

  if (replace) {
    window.history.replaceState({}, '', path)
  } else {
    window.history.pushState({}, '', path)
  }

  // 通知你的 AppRouter 更新
  window.dispatchEvent(new PopStateEvent('popstate'))
}
