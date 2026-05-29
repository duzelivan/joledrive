import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('darkMode') === 'true'
  })

  const [language, setLanguage] = useState(() => {
    return localStorage.getItem('language') || 'hr'
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', darkMode)
  }, [darkMode])

  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])

  const toggleTheme = () => setDarkMode(!darkMode)
  const toggleLanguage = () => setLanguage(language === 'hr' ? 'en' : 'hr')

  return (
    <ThemeContext.Provider value={{ darkMode, toggleTheme, language, toggleLanguage }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
