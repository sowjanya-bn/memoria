import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import GraphExplorerPage from './GraphExplorerPage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GraphExplorerPage />} />
        <Route path="/explore" element={<GraphExplorerPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
