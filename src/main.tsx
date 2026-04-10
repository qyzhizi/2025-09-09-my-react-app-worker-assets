import { RouterView } from "./RouterLite";
import { createRoot } from 'react-dom/client'
import "./router";   // side-effect: registers routes


import './index.css'
import './sw-register';

// rendering
const root = createRoot(document.getElementById('root')!)
root.render(<RouterView />)
