import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  Sun, Globe, Shield, User, Mail, Trash2, Plus, Key, Eye, EyeOff,
  Building2, MapPin, Phone, FileText, BadgeInfo, Save, CheckCircle2,
  Palette, Bell, Lock, ChevronRight, Package
} from 'lucide-react'
import toast from 'react-hot-toast'

const APP_VERSION = '2.0.0'

// Password strength checker
const getPasswordStrength = (password) => {
  if (!password) return null;
  let strength = 0;
  if (password.length >= 8) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[a-z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>_\-+=]/.test(password)) strength++;

  const levels = [
    { label: 'Vrlo slaba', color: 'bg-red-500', width: '20%', textColor: 'text-red-500' },
    { label: 'Slaba', color: 'bg-orange-500', width: '40%', textColor: 'text-orange-500' },
    { label: 'Srednja', color: 'bg-yellow-500', width: '60%', textColor: 'text-yellow-500' },
    { label: 'Dobra', color: 'bg-blue-500', width: '80%', textColor: 'text-blue-500' },
    { label: 'Jaka', color: 'bg-green-500', width: '100%', textColor: 'text-green-500' }
  ];
  return levels[Math.min(strength, 4)];
};

// Settings section component
const Section = ({ icon: Icon, iconColor, title, description, children }) => (
  <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
      <div className={`p-2 rounded-xl ${iconColor}`}>
        <Icon size={18} />
      </div>
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white">{title}</h2>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
    </div>
    <div className="p-6">
      {children}
    </div>
  </div>
);

export default function Settings() {
  const { user } = useAuth()
  const { darkMode, toggleTheme, language, toggleLanguage } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [emails, setEmails] = useState([])
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('general')

  const [company, setCompany] = useState({
    company_name: '', company_address: '', company_oib: '', company_email: '', company_phone: ''
  })
  const [companySaving, setCompanySaving] = useState(false)

  const [passwordData, setPasswordData] = useState({
    currentPassword: '', newPassword: '', confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({ current: false, new: false, confirm: false })

  const passwordStrength = useMemo(() => getPasswordStrength(passwordData.newPassword), [passwordData.newPassword]);

  useEffect(() => {
    if (hasSettingsAccess()) {
      fetchEmails()
      fetchCompany()
    }
  }, [])

  const hasSettingsAccess = () => {
    if (!user) return false
    if (user.role === 'admin') return true
    return user.entities?.settings === true
  }

  const canEditSettings = () => {
    if (user?.role === 'admin') return true
    return user?.permissions?.['settings.edit'] === true
  }

  const fetchEmails = async () => {
    try {
      const res = await axios.get('/api/settings/notification-emails')
      setEmails(res.data.emails || [])
    } catch (error) { console.error(error) }
  }

  const fetchCompany = async () => {
    try {
      const res = await axios.get('/api/settings/company')
      setCompany(prev => ({ ...prev, ...res.data }))
    } catch (error) { console.error(error) }
  }

  const saveCompany = async () => {
    setCompanySaving(true)
    try {
      await axios.put('/api/settings/company', company)
      toast.success(t('Podaci o firmi spremljeni', 'Company info saved'))
    } catch (error) {
      toast.error(t('Greška pri spremanju', 'Error saving'))
    }
    setCompanySaving(false)
  }

  const addEmail = async (e) => {
    e.preventDefault()
    if (!newEmail.trim() || !newEmail.includes('@')) {
      toast.error(t('Unesite ispravan email', 'Please enter a valid email'))
      return
    }
    setLoading(true)
    try {
      const res = await axios.post('/api/settings/notification-emails', { email: newEmail.trim() })
      setNewEmail('')
      setEmails(res.data.emails)
      toast.success(t('Email dodan', 'Email added'))
    } catch (error) {
      toast.error(error.response?.data?.error || t('Greška', 'Error'))
    }
    setLoading(false)
  }

  const deleteEmail = async (email) => {
    if (!confirm(t(`Obrisati ${email}?`, `Delete ${email}?`))) return
    setLoading(true)
    try {
      const res = await axios.delete(`/api/settings/notification-emails/${encodeURIComponent(email)}`)
      setEmails(res.data.emails)
      toast.success(t('Email obrisan', 'Email deleted'))
    } catch (error) {
      toast.error(t('Greška', 'Error'))
    }
    setLoading(false)
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('Lozinke se ne podudaraju', 'Passwords do not match'))
      return
    }
    try {
      await axios.post('/api/auth/change-password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      toast.success(t('Lozinka uspješno promijenjena!', 'Password changed successfully!'))
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || t('Greška', 'Error'))
    }
  }

  // Sidebar tabs
  const tabs = [
    { id: 'general', label: t('Općenito', 'General'), icon: Palette },
    { id: 'company', label: t('Podaci o firmi', 'Company'), icon: Building2 },
    { id: 'security', label: t('Sigurnost', 'Security'), icon: Lock },
    ...(canEditSettings() ? [{ id: 'notifications', label: t('Obavijesti', 'Notifications'), icon: Bell }] : []),
    { id: 'about', label: t('O aplikaciji', 'About'), icon: BadgeInfo },
  ]

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('Postavke', 'Settings')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('Upravljaj postavkama aplikacije', 'Manage application settings')}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-64 shrink-0">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden sticky top-4">
            <nav className="p-2">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                      : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                  {activeTab === tab.id && <ChevronRight size={14} className="ml-auto" />}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* ===== GENERAL ===== */}
          {activeTab === 'general' && (
            <>
              <Section icon={Palette} iconColor="bg-purple-100 text-purple-600" title={t('Izgled', 'Appearance')} description={t('Prilagodi izgled aplikacije', 'Customize app appearance')}>
                <div className="space-y-4">
                  {/* Dark mode */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Sun size={20} className="text-yellow-500" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{t('Tamna tema', 'Dark Theme')}</p>
                        <p className="text-xs text-gray-500">{t('Uključi tamni način rada', 'Enable dark mode')}</p>
                      </div>
                    </div>
                    <button onClick={toggleTheme} className={`relative w-14 h-8 rounded-full transition-colors ${darkMode ? 'bg-primary-600' : 'bg-gray-300'}`}>
                      <span className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow transition-transform ${darkMode ? 'translate-x-6' : ''}`} />
                    </button>
                  </div>

                  {/* Language */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <div className="flex items-center gap-3">
                      <Globe size={20} className="text-blue-500" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{t('Jezik', 'Language')}</p>
                        <p className="text-xs text-gray-500">{t('Odaberi jezik sučelja', 'Select interface language')}</p>
                      </div>
                    </div>
                    <button onClick={toggleLanguage} className="px-5 py-2 bg-primary-100 text-primary-700 rounded-xl font-semibold text-sm hover:bg-primary-200 transition-colors">
                      {language === 'hr' ? 'HR' : 'EN'}
                    </button>
                  </div>
                </div>
              </Section>

              {/* Profile */}
              <Section icon={User} iconColor="bg-blue-100 text-blue-600" title={t('Profil', 'Profile')} description={t('Informacije o tvom računu', 'Your account information')}>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase mb-1">{t('Ime', 'Name')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{user?.name || '-'}</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase mb-1">{t('Email', 'Email')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{user?.email || '-'}</p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase mb-1">{t('Uloga', 'Role')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white capitalize">{user?.role || '-'}</p>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ===== COMPANY ===== */}
          {activeTab === 'company' && (
            <Section icon={Building2} iconColor="bg-indigo-100 text-indigo-600" title={t('Podaci o firmi', 'Company Information')} description={t('Podaci koji se prikazuju na dokumentima', 'Information displayed on documents')}>
              <div className="space-y-4 max-w-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('Naziv firme', 'Company Name')}</label>
                  <div className="relative">
                    <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={company.company_name || ''}
                      onChange={e => setCompany({ ...company, company_name: e.target.value })}
                      placeholder="JoleDrive d.o.o."
                      className="input-field w-full pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('Adresa', 'Address')}</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={company.company_address || ''}
                      onChange={e => setCompany({ ...company, company_address: e.target.value })}
                      placeholder="Ulica i broj, Grad"
                      className="input-field w-full pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('OIB', 'Tax ID')}</label>
                  <div className="relative">
                    <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={company.company_oib || ''}
                      onChange={e => setCompany({ ...company, company_oib: e.target.value })}
                      placeholder="12345678901"
                      className="input-field w-full pl-10"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('Email', 'Email')}</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="email"
                        value={company.company_email || ''}
                        onChange={e => setCompany({ ...company, company_email: e.target.value })}
                        placeholder="info@firma.hr"
                        className="input-field w-full pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('Telefon', 'Phone')}</label>
                    <div className="relative">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={company.company_phone || ''}
                        onChange={e => setCompany({ ...company, company_phone: e.target.value })}
                        placeholder="+385 1 234 5678"
                        className="input-field w-full pl-10"
                      />
                    </div>
                  </div>
                </div>
                <button
                  onClick={saveCompany}
                  disabled={companySaving}
                  className="btn-primary flex items-center gap-2 mt-2"
                >
                  <Save size={16} />
                  {companySaving ? t('Spremanje...', 'Saving...') : t('Spremi podatke', 'Save')}
                </button>
              </div>
            </Section>
          )}

          {/* ===== SECURITY ===== */}
          {activeTab === 'security' && (
            <>
              <Section icon={Lock} iconColor="bg-yellow-100 text-yellow-600" title={t('Promjena lozinke', 'Change Password')} description={t('Ažuriraj svoju lozinku', 'Update your password')}>
                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium mb-1.5 dark:text-gray-300">{t('Trenutna lozinka', 'Current Password')}</label>
                    <div className="relative">
                      <input type={showPasswords.current ? "text" : "password"} value={passwordData.currentPassword} onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })} className="input-field w-full pr-10" required />
                      <button type="button" onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 dark:text-gray-300">{t('Nova lozinka', 'New Password')}</label>
                    <div className="relative">
                      <input type={showPasswords.new ? "text" : "password"} value={passwordData.newPassword} onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })} className="input-field w-full pr-10" required />
                      <button type="button" onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>

                    {passwordStrength && passwordData.newPassword && (
                      <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{t('Jakost lozinke', 'Password strength')}</span>
                          <span className={`text-xs font-semibold ${passwordStrength.textColor}`}>{passwordStrength.label}</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div className={`h-2 rounded-full ${passwordStrength.color} transition-all`} style={{ width: passwordStrength.width }} />
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-500">
                          {[
                            { test: passwordData.newPassword.length >= 8, label: language === 'hr' ? 'Minimalno 8 znakova' : 'At least 8 chars' },
                            { test: /[A-Z]/.test(passwordData.newPassword), label: language === 'hr' ? 'Veliko slovo' : 'Uppercase' },
                            { test: /[a-z]/.test(passwordData.newPassword), label: language === 'hr' ? 'Malo slovo' : 'Lowercase' },
                            { test: /\d/.test(passwordData.newPassword), label: language === 'hr' ? 'Brojka' : 'Number' },
                          ].map((req, i) => (
                            <p key={i} className={`flex items-center gap-1 ${req.test ? 'text-green-500' : ''}`}>
                              {req.test ? <CheckCircle2 size={12} /> : <span className="w-3" />} {req.label}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5 dark:text-gray-300">{t('Potvrdi novu lozinku', 'Confirm New Password')}</label>
                    <div className="relative">
                      <input type={showPasswords.confirm ? "text" : "password"} value={passwordData.confirmPassword} onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })} className="input-field w-full pr-10" required />
                      <button type="button" onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                        {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" className="btn-primary">{t('Promijeni lozinku', 'Change Password')}</button>
                </form>
              </Section>

              <Section icon={Shield} iconColor="bg-green-100 text-green-600" title={t('Sigurnosne informacije', 'Security Info')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase mb-1">{t('Dvofaktorska autentikacija', 'Two-Factor Auth')}</p>
                    <p className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                      <CheckCircle2 size={14} className="text-green-500" /> {t('Aktivno', 'Active')}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                    <p className="text-xs text-gray-500 uppercase mb-1">{t('Sesija', 'Session')}</p>
                    <p className="font-medium text-gray-900 dark:text-white">15 {t('minuta', 'minutes')}</p>
                  </div>
                </div>
              </Section>
            </>
          )}

          {/* ===== NOTIFICATIONS ===== */}
          {activeTab === 'notifications' && canEditSettings() && (
            <Section icon={Bell} iconColor="bg-red-100 text-red-600" title={t('Emailovi za obavijesti', 'Notification Emails')} description={t('Emailovi koji primaju obavijesti o ističućim registracijama', 'Emails that receive expiry notifications')}>
              <form onSubmit={addEmail} className="flex gap-3 mb-6">
                <div className="relative flex-1">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder={t('unesite email adresu', 'enter email')} className="input-field w-full pl-10" disabled={loading} />
                </div>
                <button type="submit" disabled={loading || !newEmail.trim()} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  <Plus size={16} /> {t('Dodaj', 'Add')}
                </button>
              </form>

              <div className="space-y-2">
                {emails.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Mail size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{t('Nema dodanih emailova', 'No emails added')}</p>
                  </div>
                ) : (
                  emails.map((email, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold">
                          {email[0].toUpperCase()}
                        </div>
                        <span className="text-gray-900 dark:text-white font-medium">{email}</span>
                      </div>
                      <button onClick={() => deleteEmail(email)} disabled={loading} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </Section>
          )}

          {/* ===== ABOUT ===== */}
          {activeTab === 'about' && (
            <Section icon={BadgeInfo} iconColor="bg-gray-100 text-gray-600" title={t('O aplikaciji', 'About')}>
              <div className="text-center py-6">
                <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
                  <Package size={36} className="text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">JoleDrive</h3>
                <p className="text-sm text-gray-500 mt-1">{t('Sustav za evidenciju vozila', 'Vehicle Management System')}</p>

                <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-full">
                  <span className="text-xs text-gray-500 uppercase">{t('Verzija', 'Version')}</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{APP_VERSION}</span>
                </div>

                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-xs text-gray-400">
                    © {new Date().getFullYear()} JoleDrive d.o.o.<br />
                    {t('Sva prava pridržana.', 'All rights reserved.')}
                  </p>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
