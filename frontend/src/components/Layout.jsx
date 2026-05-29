import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { 
  LayoutDashboard, Car, FileText, Wrench, Receipt, 
  Users, Package, Settings, Menu, X, Sun, Moon, LogOut,
  DollarSign
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'

// Svi mogući linkovi s pripadajućim entity ključem
const allNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', labelEn: 'Dashboard', entity: 'dashboard' },
  { path: '/vehicles', icon: Car, label: 'Vozila', labelEn: 'Vehicles', entity: 'vehicles' },
  { path: '/documents', icon: FileText, label: 'Dokumenti', labelEn: 'Documents', entity: 'documents' },
  { path: '/services', icon: Wrench, label: 'Servis', labelEn: 'Service', entity: 'services' },
  { path: '/invoices', icon: Receipt, label: 'Računi', labelEn: 'Invoices', entity: 'invoices' },
  { path: '/warehouse', icon: Package, label: 'Skladište', labelEn: 'Warehouse', entity: 'warehouse' },
  { path: '/profit', icon: DollarSign, label: 'Profit', labelEn: 'Profitability', entity: 'dashboard' },
  { path: '/users', icon: Users, label: 'Korisnici', labelEn: 'Users', entity: 'users' },
  { path: '/settings', icon: Settings, label: 'Postavke', labelEn: 'Settings', entity: 'settings' },
]

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const { darkMode, toggleTheme, language, toggleLanguage } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  // Filtriraj linkove prema dozvolama korisnika
  const getVisibleNavItems = () => {
    // ZAŠTITA: ako nema usera, ne prikazuj ništa (ili samo dashboard)
    if (!user) return []
    if (user.role === 'admin') return allNavItems

    const userEntities = user.entities || {}
    return allNavItems.filter(item => userEntities[item.entity] === true)
  }

  const navItems = getVisibleNavItems()

  // ZAŠTITA: Ako nema usera, ne renderiraj Layout (ProtectedRoute bi trebao redirectati, ali za svaki slučaj)
  if (!user) return null

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Mobile header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 shadow-sm px-4 py-3 flex items-center justify-between h-14">
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2">
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <h1 className="text-xl font-bold text-primary-600">JoleDrive</h1>
        <div className="w-8"></div>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 lg:translate-x-0 lg:static lg:shadow-none ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b dark:border-gray-700">
            <h1 className="text-2xl font-bold text-primary-600">JoleDrive</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">d.o.o - Evidencija vozila</p>
          </div>

          <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
            {navItems.length === 0 ? (
              <p className="px-4 py-3 text-sm text-gray-400">Nema dostupnih modula</p>
            ) : (
              navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}`
                  }
                >
                  <item.icon size={20} />
                  <span className="font-medium">{t(item.label, item.labelEn)}</span>
                </NavLink>
              ))
            )}
          </nav>

          <div className="p-4 border-t dark:border-gray-700 space-y-2">
            <div className="flex items-center gap-2 px-4 py-2">
              <span className="text-sm text-gray-600 dark:text-gray-400">{user?.name}</span>
              <span className="text-xs px-2 py-1 bg-primary-100 text-primary-700 rounded-full dark:bg-primary-900/30">{user?.role}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
              <button onClick={toggleLanguage} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-sm font-bold">{language === 'hr' ? 'HR' : 'EN'}</button>
              <button onClick={logout} className="p-2 rounded-lg hover:bg-red-100 text-red-600 dark:hover:bg-red-900/20 ml-auto"><LogOut size={18} /></button>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)}></div>}

      {/* Main content - DODAN pt-16 na mobitelu da kompenzira fiksirani header */}
      <main className="flex-1 min-h-screen overflow-y-auto lg:ml-0 w-full pt-14 lg:pt-0">
        <div className="p-4 lg:p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}