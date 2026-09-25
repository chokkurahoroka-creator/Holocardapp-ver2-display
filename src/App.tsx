import { Routes, Route } from 'react-router-dom'
import { DisplayPage } from './pages/DisplayPage'
import { CardPoolPage } from './pages/CardPoolPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<DisplayPage />} />
      <Route path="/cardpool" element={<CardPoolPage />} />
    </Routes>
  )
}

export default App