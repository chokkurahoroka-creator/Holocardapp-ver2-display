import { Routes, Route } from 'react-router-dom'
import { DisplayPage } from './pages/DisplayPage'
import { CardPoolPage } from './pages/CardPoolPage'
import { SearchPage } from './pages/SearchPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<DisplayPage />} />
      <Route path="/cardpool" element={<CardPoolPage />} />
      <Route path="/search" element={<SearchPage />} />
    </Routes>
  )
}

export default App