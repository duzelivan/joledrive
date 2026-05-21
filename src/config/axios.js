import axios from 'axios'

// Railway backend URL - zamijenite s vašim točnim URL-om!
const API_BASE_URL = import.meta.env.VITE_API_URL || 'joledrive-production.up.railway.app'

axios.defaults.baseURL = API_BASE_URL

// Dodaj interceptor za token
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default axios
