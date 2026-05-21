import axios from 'axios'

// ⚠️ ZAMIJENITE OVO SA SVOJIM RAILWAY URL-OM!
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://VAS-BACKEND.up.railway.app'

axios.defaults.baseURL = API_BASE_URL
axios.defaults.headers.common['Content-Type'] = 'application/json'

// Automatski dodaj token na SVAKI poziv
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Ako dobijemo 401, preusmjeri na login
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default axios
