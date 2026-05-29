import { useEffect, useState } from 'react'
import { Car, CheckCircle, Shield, Zap } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

export default function LoadingScreen({ onComplete }) {
  const [phase, setPhase] = useState('loading') // 'loading' | 'success' | 'done'
  const { user } = useAuth()
  const { darkMode, language } = useTheme()

  useEffect(() => {
    // Faza 1: Loading (0-1.5s)
    const t1 = setTimeout(() => setPhase('success'), 1500)
    // Faza 2: Success prikaz (1.5-3s)
    const t2 = setTimeout(() => setPhase('done'), 3000)
    // Faza 3: Završi
    const t3 = setTimeout(onComplete, 3300)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [onComplete])

  const t = {
    hr: {
      loading: 'Učitavanje sustava...',
      welcome: 'Dobrodošli!',
      success: 'Prijava uspješna',
      security: 'Sigurna veza',
      fast: 'Brzi pristup'
    },
    en: {
      loading: 'Loading system...',
      welcome: 'Welcome!',
      success: 'Login successful',
      security: 'Secure connection',
      fast: 'Fast access'
    }
  }
  const text = language === 'hr' ? t.hr : t.en

  if (phase === 'done') {
    return (
      <div className={`fixed inset-0 z-50 transition-opacity duration-300 opacity-0 ${darkMode ? 'bg-gray-900' : 'bg-white'}`} />
    )
  }

  return (
    <div className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-all duration-500 ${phase === 'done' ? 'opacity-0' : 'opacity-100'} ${darkMode ? 'bg-gray-900' : 'bg-white'}`}>
      
      {/* LOADING FAZA */}
      {phase === 'loading' && (
        <div className="flex flex-col items-center animate-fade-in">
          <div className="relative w-24 h-24">
            {/* Više koncentričnih prstenova */}
            <div className="absolute inset-0 rounded-full border-4 border-gray-100 dark:border-gray-800"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary-600 animate-spin" style={{ animationDuration: '1s' }}></div>
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-primary-400 animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Car className="text-primary-600" size={36} />
            </div>
          </div>
          
          <h2 className={`mt-6 text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            JoleDrive
          </h2>
          <p className={`mt-2 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {text.loading}
          </p>
          
          {/* Animirani progress dots */}
          <div className="flex gap-1 mt-4">
            {[0, 1, 2].map(i => (
              <div 
                key={i} 
                className="w-2 h-2 bg-primary-600 rounded-full animate-bounce"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>
        </div>
      )}

      {/* SUCCESS FAZA */}
      {phase === 'success' && (
        <div className="flex flex-col items-center animate-scale-in">
          {/* Success circle s pulse efektom */}
          <div className="relative">
            <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-20"></div>
            <div className="relative w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
              <CheckCircle className="text-green-600" size={48} />
            </div>
          </div>
          
          <h1 className={`mt-6 text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            {text.welcome}
          </h1>
          <p className={`mt-2 text-xl font-medium ${darkMode ? 'text-primary-400' : 'text-primary-600'}`}>
            {user?.name || ''}
          </p>
          <p className={`mt-1 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {text.success}
          </p>

          {/* Mali feature ikone */}
          <div className="flex gap-6 mt-6">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Shield size={14} className="text-green-500" />
              {text.security}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Zap size={14} className="text-yellow-500" />
              {text.fast}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}