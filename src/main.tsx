import {AppRouter} from '@/AppRouter'
import { createRoot } from 'react-dom/client'


import './index.css'
import './sw-register';

// rendering
const root = createRoot(document.getElementById('root')!)
root.render(<AppRouter />)
