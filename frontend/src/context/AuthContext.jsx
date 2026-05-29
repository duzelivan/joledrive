import { createContext, useContext, useState, useEffect } from 'react'
import axios from 'axios'

// === BACKEND API URL ===
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://joledrive-production.up.railway.app'

// Postavi base URL za sve axios pozive
axios.defaults.baseURL = API_BASE_URL

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      fetchUser()
    } else {
      setLoading(false)
    }

    let timeout
    const resetTimer = () => {
      clearTimeout(timeout)
      timeout = setTimeout(() => {
        logout()
      }, 15 * 60 * 1000)
    }

    window.addEventListener('mousemove', resetTimer)
    window.addEventListener('keydown', resetTimer)
    resetTimer()

    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', resetTimer)
      window.removeEventListener('keydown', resetTimer)
    }
  }, [])

  const fetchUser = async () => {
    try {
      const res = await axios.get('/api/auth/me')
      const userData = res.data.user

      // Osiguraj da entities i permissions postoje
      if (userData) {
        if (!userData.entities) userData.entities = {}
        if (!userData.permissions) userData.permissions = {}

        // Parsiraj ako su string (JSON)
        if (typeof userData.entities === 'string') {
          try { userData.entities = JSON.parse(userData.entities) } catch { userData.entities = {} }
        }
        if (typeof userData.permissions === 'string') {
          try { userData.permissions = JSON.parse(userData.permissions) } catch { userData.permissions = {} }
        }
      }

      setUser(userData)
    } catch {
      localStorage.removeItem('token')
      delete axios.defaults.headers.common['Authorization']
    } finally {
      setLoading(false)
    }
  }

  const login = async (email, password, totpCode = '') => {
    const res = await axios.post('/api/auth/login', { email, password, totpCode })
    const { token, user } = res.data

    if (user) {
      if (!user.entities) user.entities = {}
      if (!user.permissions) user.permissions = {}

      if (typeof user.entities === 'string') {
        try { user.entities = JSON.parse(user.entities) } catch { user.entities = {} }
      }
      if (typeof user.permissions === 'string') {
        try { user.permissions = JSON.parse(user.permissions) } catch { user.permissions = {} }
      }
    }

    localStorage.setItem('token', token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(user)
    return user
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }

  // ============================================
  // ENTITY ACCESS - provjera pristupa modulu
  // ============================================
  const hasEntityAccess = (entity) => {
    if (!user) return false
    if (user.role === 'admin') return true
    // Non-admin: mora imati eksplicitno entities[entity] === true
    if (!user.entities) return false
    return user.entities[entity] === true
  }

  const getVisibleEntities = () => {
    if (!user) return []
    if (user.role === 'admin') {
      return ['dashboard', 'vehicles', 'documents', 'services', 'invoices', 'warehouse', 'users', 'settings']
    }
    // Non-admin: samo entiteti gdje je value === true
    if (!user.entities) return []
    return Object.entries(user.entities)
      .filter(([key, value]) => value === true)
      .map(([key]) => key)
  }

  // ============================================
  // PERMISSION CHECK - provjera specifičnih permisija
  // ============================================
  const hasPermission = (permission) => {
    if (!user) return false
    if (user.role === 'admin') return true
    if (!user.permissions) return false
    return user.permissions[permission] === true
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, hasEntityAccess, getVisibleEntities, hasPermission }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
