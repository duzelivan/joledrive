import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import {
  Plus, Search, Edit, Trash2, Key, RefreshCw, User, Building2,
  Phone, Mail, Eye, EyeOff
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

const PERMISSIONS = [
  { key: 'vehicles.create', hr: 'Dodaj vozilo', en: 'Add vehicle' },
  { key: 'vehicles.edit', hr: 'Uredi vozilo', en: 'Edit vehicle' },
  { key: 'vehicles.delete', hr: 'Obriši vozilo', en: 'Delete vehicle' },
  { key: 'documents.create', hr: 'Dodaj dokument', en: 'Add document' },
  { key: 'documents.delete', hr: 'Obriši dokument', en: 'Delete document' },
  { key: 'services.create', hr: 'Zakaži servis', en: 'Schedule service' },
  { key: 'services.delete', hr: 'Obriši servis', en: 'Delete service' },
  { key: 'invoices.create', hr: 'Dodaj račun', en: 'Add invoice' },
  { key: 'invoices.edit', hr: 'Uredi račun', en: 'Edit invoice' },
  { key: 'invoices.delete', hr: 'Obriši račun', en: 'Delete invoice' },
  { key: 'warehouse.create', hr: 'Dodaj dio', en: 'Add part' },
  { key: 'warehouse.edit', hr: 'Uredi dio', en: 'Edit part' },
  { key: 'warehouse.delete', hr: 'Obriši dio', en: 'Delete part' },
]

const ENTITIES = [
  { key: 'dashboard', hr: 'Dashboard', en: 'Dashboard' },
  { key: 'vehicles', hr: 'Vozila', en: 'Vehicles' },
  { key: 'documents', hr: 'Dokumenti', en: 'Documents' },
  { key: 'services', hr: 'Servis', en: 'Service' },
  { key: 'invoices', hr: 'Računi', en: 'Invoices' },
  { key: 'warehouse', hr: 'Skladište', en: 'Warehouse' },
  { key: 'users', hr: 'Korisnici', en: 'Users' },
  { key: 'settings', hr: 'Postavke', en: 'Settings' },
  { key: 'profit', hr: 'Profit', en: 'Profit' },
]

const ROLE_LABELS = {
  hr: { admin: 'Administrator', user: 'Korisnik', mechanic: 'Mehaničar', manager: 'Manager', accountant: 'Računovođa' },
  en: { admin: 'Administrator', user: 'User', mechanic: 'Mechanic', manager: 'Manager', accountant: 'Accountant' }
}

const getPasswordStrength = (password) => {
  if (!password) return null
  let strength = 0
  if (password.length >= 8) strength++
  if (/[A-Z]/.test(password)) strength++
  if (/[a-z]/.test(password)) strength++
  if (/\d/.test(password)) strength++
  if (/[!@#$%^&*(),.?":{}|<>_\-+=]/.test(password)) strength++
  const levels = [
    { label: 'Vrlo slaba', color: 'bg-red-500', width: '20%', textColor: 'text-red-500' },
    { label: 'Slaba', color: 'bg-orange-500', width: '40%', textColor: 'text-orange-500' },
    { label: 'Srednja', color: 'bg-yellow-500', width: '60%', textColor: 'text-yellow-500' },
    { label: 'Dobra', color: 'bg-blue-500', width: '80%', textColor: 'text-blue-500' },
    { label: 'Jaka', color: 'bg-green-500', width: '100%', textColor: 'text-green-500' }
  ]
  return levels[Math.min(strength, 4)]
}

const validatePasswordFrontend = (password) => {
  const errors = []
  if (password.length < 8) errors.push('Minimalno 8 znakova')
  if (!/[A-Z]/.test(password)) errors.push('Jedno veliko slovo')
  if (!/[a-z]/.test(password)) errors.push('Jedno malo slovo')
  if (!/\d/.test(password)) errors.push('Jedna brojka')
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=]/.test(password)) errors.push('Jedan specijalni znak')
  return errors
}

const safeParseJSON = (str) => {
  if (!str) return {}
  if (typeof str === 'object') return str
  try { return JSON.parse(str) } catch (e) { return {} }
}

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [passwordError, setPasswordError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { user: currentUser } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [formData, setFormData] = useState({
    name: '', email: '', password: '', role: 'user', type: 'user',
    phone: '', driver_license: '', address: '', oib: '',
    company_name: '', company_oib: '', permissions: {}, entities: {}
  })

  const passwordStrength = useMemo(() => getPasswordStrength(formData.password), [formData.password])

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    try { setUsers((await axios.get('/api/users')).data) }
    catch { toast.error(t('Greška', 'Error')) }
  }

  const resetForm = () => {
    setFormData({
      name: '', email: '', password: '', role: 'user', type: 'user',
      phone: '', driver_license: '', address: '', oib: '',
      company_name: '', company_oib: '', permissions: {}, entities: {}
    })
    setPasswordError('')
    setShowPassword(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!editingUser && formData.type === 'user' && formData.password) {
      const errors = validatePasswordFrontend(formData.password)
      if (errors.length > 0) { setPasswordError(errors.join(', ')); return }
    }
    setPasswordError('')
    const toastId = toast.loading(editingUser ? t('Ažuriranje...', 'Updating...') : t('Dodavanje...', 'Adding...'))
    try {
      if (editingUser) {
        await axios.put(`/api/users/${editingUser.id}`, formData)
        toast.success(t('Korisnik ažuriran', 'User updated'), { id: toastId })
      } else {
        await axios.post('/api/users', formData)
        toast.success(t('Korisnik dodan', 'User added'), { id: toastId })
      }
      setShowModal(false)
      setEditingUser(null)
      resetForm()
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.error || t('Greška', 'Error'), { id: toastId })
    }
  }

  const handleDelete = async (id) => {
    if (!confirm(t('Jeste li sigurni?', 'Are you sure?'))) return
    const toastId = toast.loading(t('Brisanje...', 'Deleting...'))
    try {
      await axios.delete(`/api/users/${id}`)
      toast.success(t('Obrisano', 'Deleted'), { id: toastId })
      fetchUsers()
    } catch { toast.error(t('Greška', 'Error'), { id: toastId }) }
  }

  const handleResetPassword = async (id) => {
    if (!confirm(t('Resetirati lozinku?', 'Reset password?'))) return
    const toastId = toast.loading(t('Resetiranje...', 'Resetting...'))
    try {
      const res = await axios.post(`/api/users/${id}/reset-password`)
      toast.success(
        <div>
          <p>{t('Nova lozinka:', 'New password:')}</p>
          <p className="font-mono font-bold bg-gray-800 text-white p-2 rounded mt-1">{res.data.password}</p>
        </div>,
        { id: toastId, duration: 10000 }
      )
    } catch { toast.error(t('Greška', 'Error'), { id: toastId }) }
  }

  const togglePermission = (key) => {
    setFormData(p => ({ ...p, permissions: { ...p.permissions, [key]: !p.permissions[key] } }))
  }
  const toggleEntity = (key) => {
    setFormData(p => ({ ...p, entities: { ...p.entities, [key]: !p.entities[key] } }))
  }

  const openEdit = (user) => {
    setEditingUser(user)
    setFormData({
      name: user.name || '', email: user.email || '', password: '',
      role: user.role || 'user', type: user.type || 'user',
      phone: user.phone || '', driver_license: user.driver_license || '',
      address: user.address || '', oib: user.oib || '',
      company_name: user.company_name || '', company_oib: user.company_oib || '',
      permissions: safeParseJSON(user.permissions),
      entities: safeParseJSON(user.entities)
    })
    setPasswordError('')
    setShowPassword(false)
    setShowModal(true)
  }

  // ---- AVATAR ----
  const Avatar = ({ name }) => {
    const initial = name?.charAt(0)?.toUpperCase() || '?'
    return (
      <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{initial}</span>
      </div>
    )
  }

  // ---- BADGES ----
  const TypeBadge = ({ type }) => {
    if (type === 'client') return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">{t('Klijent', 'Client')}</span>
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{t('Aplikacija', 'Application')}</span>
  }

  const RoleBadge = ({ role }) => {
    const isAdmin = role === 'admin'
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isAdmin ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>{t(ROLE_LABELS.hr[role] || role, ROLE_LABELS.en[role] || role)}</span>
  }

  const StatusBadge = ({ active }) => (
    <span className={`text-sm font-medium ${active ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
      {active ? t('Aktivan', 'Active') : t('Neaktivan', 'Inactive')}
    </span>
  )

  // ---- ENTITY TAGS ----
  const EntityTags = ({ entities }) => {
    const parsed = safeParseJSON(entities)
    const active = ENTITIES.filter(e => parsed[e.key] === true)
    if (active.length === 0) return <span className="text-gray-400 text-xs">-</span>
    return (
      <div className="flex flex-wrap gap-1">
        {active.slice(0, 6).map(e => (
          <span key={e.key} className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded text-xs font-medium">
            {t(e.hr, e.en)}
          </span>
        ))}
        {active.length > 6 && <span className="text-xs text-gray-400 self-center">+{active.length - 6}</span>}
      </div>
    )
  }

  // ---- FILTER ----
  const filteredUsers = users.filter(u => {
    const matchSearch = !search ||
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.phone?.includes(search) ||
      u.oib?.includes(search)
    const matchType = typeFilter === 'all' || u.type === typeFilter
    return matchSearch && matchType
  })

  const isClient = formData.type === 'client'

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('Korisnici', 'Users')}</h1>
        <button
          onClick={() => { setEditingUser(null); resetForm(); setShowModal(true) }}
          className="btn-primary flex items-center gap-2 px-4 py-2 self-start"
        >
          <Plus size={18} /> {t('Novi korisnik', 'New user')}
        </button>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={t('Pretraži po imenu, email, telefonu, OIB...', 'Search by name, email, phone, OIB...')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
        <div className="flex gap-2">
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field text-sm py-2">
            <option value="all">{t('Svi tipovi', 'All types')}</option>
            <option value="user">{t('Aplikacija', 'Application')}</option>
            <option value="client">{t('Klijent', 'Client')}</option>
          </select>
          <button onClick={fetchUsers} className="btn-secondary flex items-center gap-2 px-3" title={t('Osvježi', 'Refresh')}>
            <RefreshCw size={16} />
            <span className="hidden sm:inline text-sm">{t('Osvježi', 'Refresh')}</span>
          </button>
        </div>
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table className="min-w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('Ime', 'Name')}</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('Tip', 'Type')}</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('Uloga', 'Role')}</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('Kontakt', 'Contact')}</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('Stranice', 'Pages')}</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('Status', 'Status')}</th>
              <th className="text-center px-5 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28">{t('Akcije', 'Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {filteredUsers.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                {/* IME */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar name={u.name} />
                    <span className="font-medium text-sm text-gray-900 dark:text-white">{u.name}</span>
                  </div>
                </td>
                {/* TIP */}
                <td className="px-5 py-3.5"><TypeBadge type={u.type} /></td>
                {/* ULOGA */}
                <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                {/* KONTAKT */}
                <td className="px-5 py-3.5">
                  <div className="space-y-0.5">
                    {u.email && !u.email.includes('@joledrive.local') && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400">
                        <Mail size={12} /> <span className="truncate max-w-[160px]">{u.email}</span>
                      </div>
                    )}
                    {u.phone && (
                      <div className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-500">
                        <Phone size={12} /> {u.phone}
                      </div>
                    )}
                    {!u.email && !u.phone && <span className="text-gray-400 text-sm">-</span>}
                  </div>
                </td>
                {/* STRANICE */}
                <td className="px-5 py-3.5"><EntityTags entities={u.entities} /></td>
                {/* STATUS */}
                <td className="px-5 py-3.5"><StatusBadge active={u.active} /></td>
                {/* AKCIJE */}
                <td className="px-5 py-3.5">
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => openEdit(u)} className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors" title={t('Uredi', 'Edit')}>
                      <Edit size={15} />
                    </button>
                    {u.type === 'user' && (
                      <button onClick={() => handleResetPassword(u.id)} className="p-1.5 text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg transition-colors" title={t('Reset lozinke', 'Reset password')}>
                        <Key size={15} />
                      </button>
                    )}
                    {currentUser?.id !== u.id && (
                      <button onClick={() => handleDelete(u.id)} className="p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title={t('Obriši', 'Delete')}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-500">
                  {t('Nema korisnika', 'No users found')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MOBILE CARDS */}
      <div className="md:hidden space-y-3">
        {filteredUsers.map(u => (
          <div key={u.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={u.name} />
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{u.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <TypeBadge type={u.type} />
                    <RoleBadge role={u.role} />
                  </div>
                </div>
              </div>
              <StatusBadge active={u.active} />
            </div>
            <div className="mt-3 space-y-1">
              {u.email && !u.email.includes('@joledrive.local') && (
                <p className="text-sm text-gray-500 flex items-center gap-1.5"><Mail size={12} /> {u.email}</p>
              )}
              {u.phone && <p className="text-sm text-gray-500 flex items-center gap-1.5"><Phone size={12} /> {u.phone}</p>}
            </div>
            <div className="mt-2"><EntityTags entities={u.entities} /></div>
            <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <button onClick={() => openEdit(u)} className="flex-1 py-2 text-sm text-blue-600 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center gap-1.5"><Edit size={14} /> {t('Uredi', 'Edit')}</button>
              {u.type === 'user' && <button onClick={() => handleResetPassword(u.id)} className="flex-1 py-2 text-sm text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center justify-center gap-1.5"><Key size={14} /> {t('Lozinka', 'Pass')}</button>}
              {currentUser?.id !== u.id && <button onClick={() => handleDelete(u.id)} className="flex-1 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center gap-1.5"><Trash2 size={14} /> {t('Obriši', 'Del')}</button>}
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto">
          <div className="flex min-h-full items-start justify-center p-4 pt-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl p-6 mb-8">
              <h2 className="text-xl font-bold mb-4 dark:text-white">
                {editingUser ? t('Uredi', 'Edit') : t('Novi', 'New')} {isClient ? t('klijent', 'client') : t('korisnik', 'user')}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!editingUser && (
                  <div className="flex gap-4 mb-4">
                    <label className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${!isClient ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="radio" name="type" value="user" checked={!isClient} onChange={() => setFormData(p => ({ ...p, type: 'user' }))} className="hidden" />
                      <User size={24} className={!isClient ? 'text-primary-600' : 'text-gray-400'} />
                      <div>
                        <p className="font-medium dark:text-white">{t('Korisnik aplikacije', 'Application User')}</p>
                        <p className="text-xs text-gray-500">{t('Može se prijaviti u aplikaciju', 'Can login to application')}</p>
                      </div>
                    </label>
                    <label className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${isClient ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="radio" name="type" value="client" checked={isClient} onChange={() => setFormData(p => ({ ...p, type: 'client' }))} className="hidden" />
                      <Building2 size={24} className={isClient ? 'text-green-600' : 'text-gray-400'} />
                      <div>
                        <p className="font-medium dark:text-white">{t('Zakupac', 'Client')}</p>
                        <p className="text-xs text-gray-500">{t('Samo za evidenciju', 'For records only')}</p>
                      </div>
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Ime i prezime / Naziv', 'Full Name / Company')} *</label>
                    <input type="text" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="input-field w-full" />
                  </div>

                  {!isClient && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Email', 'Email')} *</label>
                        <input type="email" required={!editingUser} value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="input-field w-full" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Lozinka', 'Password')} {!editingUser && '*'}</label>
                        <div className="relative">
                          <input type={showPassword ? "text" : "password"} required={!isClient && !editingUser} value={formData.password} onChange={e => { setFormData({ ...formData, password: e.target.value }); setPasswordError('') }} className={`input-field w-full pr-10 ${passwordError ? 'border-red-500' : ''}`} />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                        </div>
                        {passwordStrength && formData.password && (
                          <div className="mt-2">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-gray-500">{t('Jakost', 'Strength')}</span>
                              <span className={`text-xs font-medium ${passwordStrength.textColor}`}>{passwordStrength.label}</span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${passwordStrength.color}`} style={{ width: passwordStrength.width }} /></div>
                          </div>
                        )}
                        {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Uloga', 'Role')}</label>
                        <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className="input-field w-full">
                          <option value="user">{t('Korisnik', 'User')}</option>
                          <option value="mechanic">{t('Mehaničar', 'Mechanic')}</option>
                          <option value="manager">{t('Manager', 'Manager')}</option>
                          <option value="accountant">{t('Računovođa', 'Accountant')}</option>
                          <option value="admin">{t('Administrator', 'Administrator')}</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Telefon', 'Phone')}</label>
                    <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('OIB', 'OIB')}</label>
                    <input type="text" maxLength={11} value={formData.oib} onChange={e => setFormData({ ...formData, oib: e.target.value })} className="input-field w-full" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Adresa', 'Address')}</label>
                    <input type="text" value={formData.address} onChange={e => setFormData({ ...formData, address: e.target.value })} className="input-field w-full" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Broj vozačke', 'Driver License')} {isClient && '*'}</label>
                    <input type="text" required={isClient} value={formData.driver_license} onChange={e => setFormData({ ...formData, driver_license: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Naziv tvrtke', 'Company Name')}</label>
                    <input type="text" value={formData.company_name} onChange={e => setFormData({ ...formData, company_name: e.target.value })} className="input-field w-full" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('OIB tvrtke', 'Company OIB')}</label>
                    <input type="text" maxLength={11} value={formData.company_oib} onChange={e => setFormData({ ...formData, company_oib: e.target.value })} className="input-field w-full" />
                  </div>
                </div>

                {!isClient && formData.role !== 'admin' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('Pristup modulima', 'Module Access')}</label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {ENTITIES.map(e => (
                          <label key={e.key} className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-colors text-sm ${formData.entities[e.key] ? 'border-primary-400 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700'}`}>
                            <input type="checkbox" checked={!!formData.entities[e.key]} onChange={() => toggleEntity(e.key)} className="hidden" />
                            {t(e.hr, e.en)}
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('Dozvole akcija', 'Action Permissions')}</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PERMISSIONS.map(p => (
                          <label key={p.key} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg cursor-pointer text-sm">
                            <input type="checkbox" checked={!!formData.permissions[p.key]} onChange={() => togglePermission(p.key)} className="rounded" />
                            <span className="dark:text-gray-300">{t(p.hr, p.en)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="btn-primary">{t('Spremi', 'Save')}</button>
                  <button type="button" onClick={() => { setShowModal(false); setEditingUser(null); resetForm() }} className="btn-secondary">{t('Odustani', 'Cancel')}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
