import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import Home from '@/src/pages/Home'
import Dashboard from '@/src/pages/Dashboard'

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="zendeeps-theme">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App
