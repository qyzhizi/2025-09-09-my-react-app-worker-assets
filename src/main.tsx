import {AppRouter} from '@/AppRouter'
import { createRoot } from 'react-dom/client'


import './index.css'
import './sw-register';

// 渲染
const root = createRoot(document.getElementById('root')!)
root.render(<AppRouter />)
