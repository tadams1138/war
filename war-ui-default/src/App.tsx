import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/context'
import { Footer } from './components/Footer'
import { NavBar } from './components/NavBar'
import { RequireAuth } from './router/RequireAuth'
import { ThemeProvider } from './theme/ThemeContext'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { AuthCallback } from './pages/AuthCallback'
import { WarDetail } from './pages/WarDetail'
import { VoteMode } from './pages/VoteMode'
import { CreateWar } from './pages/CreateWar'
import { EditWar } from './pages/EditWar'
import { ImportWar } from './pages/ImportWar'
import { MyWars } from './pages/MyWars'
import { PrivacyPolicy } from './pages/PrivacyPolicy'
import { TermsOfService } from './pages/TermsOfService'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <NavBar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/wars/:id" element={<WarDetail />} />
            <Route
              path="/wars/:id/vote"
              element={
                <RequireAuth>
                  <VoteMode />
                </RequireAuth>
              }
            />
            <Route
              path="/wars/:id/edit"
              element={
                <RequireAuth>
                  <EditWar />
                </RequireAuth>
              }
            />
            <Route
              path="/wars/new"
              element={
                <RequireAuth>
                  <CreateWar />
                </RequireAuth>
              }
            />
            <Route
              path="/wars/import"
              element={
                <RequireAuth>
                  <ImportWar />
                </RequireAuth>
              }
            />
            <Route
              path="/my-wars"
              element={
                <RequireAuth>
                  <MyWars />
                </RequireAuth>
              }
            />
          </Routes>
          <Footer />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
