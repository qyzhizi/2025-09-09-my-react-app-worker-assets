import { createRouter } from "./RouterLite";
import Logs from './components/Logs'
import SearchLogs from '@/components/SearchLogs'
import { Login } from './components/Login'
import { InitRefreshToken } from './components/InitRefreshToken'
import MainSettingPage from './components/settings/MainSettingPage'
import LocalStoreApp from './LocalStoreApp'
import GithubAppSetupSuccess from './components/GithubAppSetupSuccess'

import {AppLayout} from './layouts/AppLayout'
import {EmptyLayout} from './layouts/EmptyLayout'

createRouter([
  {
    path: '/login',
    element: <Login />,
    layout: EmptyLayout,
  },
  {
    path: '/',
    element: <Logs />,
    layout: AppLayout,
  },
  {
    path: '/search',
    element: <SearchLogs />,
    layout: AppLayout,
  },
  {
    path: '/settings-page',
    element: <MainSettingPage />,
    layout: AppLayout,
  },
  {
    path: '/local-store',
    element: <LocalStoreApp />,
    layout: AppLayout,
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
]);
