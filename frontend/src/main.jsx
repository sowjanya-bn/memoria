import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import InstallationApp from './installation/InstallationApp.jsx'
import DriftDemo from './drift/DriftDemo.jsx'
import CosmosPage from './cosmos/CosmosPage.jsx'
import GraphExplorerPage from './GraphExplorerPage.jsx'
const CosmosGPU = lazy(() => import('./cosmos/CosmosGPU.jsx'))
const ReagraphExplorer = lazy(() => import('./reagraph/ReagraphExplorer.jsx'))
const SigmaExplorer = lazy(() => import('./sigma/SigmaExplorer.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/installation" element={<InstallationApp />} />
        <Route path="/drift-demo" element={<DriftDemo />} />
        <Route path="/cosmos" element={<CosmosPage />} />
        <Route path="/explore" element={<GraphExplorerPage />} />
        <Route path="/sigma" element={
          <Suspense fallback={<div style={{ background: "#03050e", position: "fixed", inset: 0 }} />}>
            <SigmaExplorer />
          </Suspense>
        } />
        <Route path="/reagraph" element={
          <Suspense fallback={<div style={{ background: "#03050e", position: "fixed", inset: 0 }} />}>
            <ReagraphExplorer />
          </Suspense>
        } />
        <Route path="/cosmos-gpu" element={
          <Suspense fallback={<div style={{ background: "#03050e", position: "fixed", inset: 0 }} />}>
            <CosmosGPU />
          </Suspense>
        } />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
