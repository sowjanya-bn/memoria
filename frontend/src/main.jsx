import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import InstallationApp from './installation/InstallationApp.jsx'
import DriftDemo from './drift/DriftDemo.jsx'
import CosmosPage from './cosmos/CosmosPage.jsx'
const CosmosGPU = lazy(() => import('./cosmos/CosmosGPU.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/installation" element={<InstallationApp />} />
        <Route path="/drift-demo" element={<DriftDemo />} />
        <Route path="/cosmos" element={<CosmosPage />} />
        <Route path="/cosmos-gpu" element={
          <Suspense fallback={<div style={{ background: "#03050e", position: "fixed", inset: 0 }} />}>
            <CosmosGPU />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
