// このファイルは、管理画面（horoka-admin）から、同期したコピーです。直接は、直さないでください（node scripts/sync-versus.mjs で、上書きされます）。直すときは、管理画面側のファイルを直して、同期してください。
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import VersusApp from './versus/VersusApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VersusApp />
  </StrictMode>,
)