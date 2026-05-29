import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Car, Sun, Moon, Eye, EyeOff, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'

// === JEDNOSTAVNI LOADING SCREEN ===
function LoadingScreen({ onComplete, user, darkMode, language }) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(onComplete, 300)
          return 100
        }
        return prev + 2
      })
    }, 30)

    return () => clearInterval(interval)
  }, [onComplete])

  const welcomeText = language === 'hr' ? 'Dobrodošli!' : 'Welcome!'
  const loadingText = language === 'hr' ? 'Učitavanje...' : 'Loading...'

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      
      {progress < 100 ? (
        // LOADING FAZA
        <div className="flex flex-col items-center">
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200 dark:border-gray-700"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Car className="text-primary-600" size={32} />
            </div>
          </div>
          
          <h2 className={`mt-4 text-lg font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            JoleDrive
          </h2>
          <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {loadingText}
          </p>
          
          {/* Progress bar */}
          <div className="w-48 h-2 bg-gray-200 dark:bg-gray-700 rounded-full mt-4 overflow-hidden">
            <div 
              className="h-full bg-primary-600 rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className={`mt-1 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            {progress}%
          </p>
        </div>
      ) : (
        // SUCCESS FAZA
        <div className="flex flex-col items-center animate-pulse">
          <div className="w-20 h-20 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
            <CheckCircle className="text-green-600" size={40} />
          </div>
          
          <h1 className={`mt-4 text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {welcomeText}
          </h1>
          <p className={`mt-1 text-lg text-primary-600`}>
            {user?.name || ''}
          </p>
        </div>
      )}
    </div>
  )
}

// === GLAVNA LOGIN KOMPONENTA ===
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [show2FA, setShow2FA] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showLoadingScreen, setShowLoadingScreen] = useState(false)
  const { login, user } = useAuth()
  const { darkMode, toggleTheme, language, toggleLanguage } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from || '/'

  const t = {
    hr: { 
      title: 'JoleDrive d.o.o', 
      subtitle: 'Prijava u sustav', 
      email: 'Email', 
      password: 'Lozinka', 
      login: 'Prijava', 
      loggingIn: 'Prijava...', 
    },
    en: { 
      title: 'JoleDrive d.o.o', 
      subtitle: 'System Login', 
      email: 'Email', 
      password: 'Password', 
      login: 'Login', 
      loggingIn: 'Logging in...', 
    }
  }
  const text = t[language]

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(email, password, totpCode)
      setShowLoadingScreen(true)
    } catch (err) {
      if (err.response?.data?.error?.includes('2FA')) {
        setShow2FA(true)
        toast(language === 'hr' ? '🔐 Unesite 2FA kod' : '🔐 Enter 2FA code')
      } else if (err.response?.status === 401) {
        toast.error(language === 'hr' 
          ? '❌ Neispravni podaci za prijavu' 
          : '❌ Invalid credentials')
      } else if (err.response?.status === 403) {
        toast.error(language === 'hr'
          ? '❌ Zakupci se ne mogu prijaviti'
          : '❌ Clients cannot login')
      } else {
        toast.error(language === 'hr' 
          ? '❌ Greška pri prijavi' 
          : '❌ Login error')
      }
    } finally { 
      setLoading(false) 
    }
  }

  const handleLoadingComplete = () => {
    navigate(from, { replace: true })
  }

  return (
    <>
      {showLoadingScreen && (
        <LoadingScreen 
          onComplete={handleLoadingComplete} 
          user={user}
          darkMode={darkMode}
          language={language}
        />
      )}
      
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800">
        <div className="absolute top-4 right-4 flex gap-2">
          <button onClick={toggleTheme} className="p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 shadow">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button onClick={toggleLanguage} className="p-2 rounded-lg bg-white/80 dark:bg-gray-800/80 shadow font-bold text-sm">
            {language === 'hr' ? 'EN' : 'HR'}
          </button>
        </div>
        
        <div className="w-full max-w-md p-8 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full mb-4">
              <Car size={32} className="text-primary-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{text.title}</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">{text.subtitle}</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{text.email}</label>
              <input 
                type="email" 
                required 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                className="input-field" 
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{text.password}</label>
              <div className="relative">
                <input 
                  type={showPassword ? "text" : "password"} 
                  required 
                  value={password} 
                  onChange={e => setPassword(e.target.value)} 
                  className="input-field pr-10" 
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {show2FA && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">2FA Kod</label>
                <input 
                  type="text" 
                  value={totpCode} 
                  onChange={e => setTotpCode(e.target.value)} 
                  className="input-field" 
                  placeholder={language === 'hr' ? 'Unesite 6-znamenkasti kod' : 'Enter 6-digit code'} 
                  maxLength={6} 
                />
              </div>
            )}

            <button 
              type="submit" 
              disabled={loading} 
              className="w-full btn-primary py-3 font-semibold disabled:opacity-50"
            >
              {loading ? text.loggingIn : text.login}
            </button>
          </form>
        </div>
      </div>
    </>
  )
}