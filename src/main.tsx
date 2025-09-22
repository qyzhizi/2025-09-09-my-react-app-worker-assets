import './index.css'

import {useState, useEffect} from 'react'
import type { FC, ReactNode  } from 'react'

import { App, Home, Pictures, Contact, Chatgpt } from './components/Components'
import LogInput from './components/LogInput'
import { Login } from './components/Login'
import { createRoot } from 'react-dom/client'

// 路由映射：路径对应渲染组件
const routes: { [key: string]: () => ReactNode } = {
  '/': () => <Login/>,
  '/home': () => <Home />,
  '/pictures': () => <Pictures />,
  '/contact': () => <Contact />,
  '/chatgpt': () => <Chatgpt />,
  '/loginput': () => <LogInput/>
}

// // 定义一个简单的 Link 组件，拦截点击事件并使用 History API 进行 SPA 导航
// const Link = ({ to, children }: { to: string; children: ReactNode }) => {
//   const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
//     e.preventDefault()
//     window.history.pushState({}, '', to)
//     // 手动触发 popstate 事件，通知路由更新
//     window.dispatchEvent(new PopStateEvent('popstate'))
//   }
//   return (
//     <a href={to} onClick={handleClick}>
//       {children}
//     </a>
//   )
// }

// Router 组件，使用状态监听 window.location.pathname 的变化
const AppRouter: FC = () => {
  const [route, setRoute] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const Component = routes[route] || (() => <div>Not Found</div>)
  return <App>{Component()}</App>
}


// 渲染
const root = createRoot(document.getElementById('root')!)
root.render(<AppRouter />)
