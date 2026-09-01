import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/context'
import { RequireAuth } from './router/RequireAuth'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { AuthCallback } from './pages/AuthCallback'
import { WarDetail } from './pages/WarDetail'
import { VoteMode } from './pages/VoteMode'
import { Rankings } from './pages/Rankings'
import { CreateWar } from './pages/CreateWar'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/wars/:id" element={<WarDetail />} />
          <Route
            path="/wars/:id/vote"
            element={
              <RequireAuth>
                <VoteMode />
              </RequireAuth>
            }
          />
          <Route path="/wars/:id/rankings" element={<Rankings />} />
          <Route
            path="/wars/new"
            element={
              <RequireAuth>
                <CreateWar />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
