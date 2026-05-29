import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  Car, Wrench, Receipt, Bell, Calendar, TrendingUp,
  CheckCircle2, Clock, Fuel, ShieldAlert, FileText, AlertTriangle,
  Gauge, DollarSign, Users, Zap
} from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area
} from 'recharts'
import toast from 'react-hot-toast'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [chartPeriod, setChartPeriod] = useState('year') // 'year' | 'month'
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [currentTime, setCurrentTime] = useState(new Date())
  const { language } = useTheme()
  const { user } = useAuth()
  const navigate = useNavigate()
  const t = (hr, en) => language === 'hr' ? hr : en

  // Ažuriraj sat svaku minutu
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => { fetchDashboard() }, [])
  useEffect(() => { fetchAnalytics() }, [chartPeriod, selectedYear, selectedMonth])

  const fetchDashboard = async () => {
    try { const res = await axios.get('/api/dashboard'); setData(res.data) }
    catch (err) { toast.error(t('Greška', 'Error')) }
  }

  const fetchAnalytics = async () => {
    try {
      const params = { year: selectedYear }
      if (chartPeriod === 'month') {
        params.period = 'week'
        params.month = selectedMonth
      }
      const res = await axios.get('/api/dashboard/analytics', { params })
      setAnalytics(res.data)
    } catch (err) { console.error(err) }
  }

  const formatEur = (v) => (v || 0).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const formatDate = (d) => d ? new Date(d).toLocaleDateString(language === 'hr' ? 'hr-HR' : 'en-GB') : '-'

  const monthsHr = ['Sij', 'Velj', 'Ožu', 'Tra', 'Svi', 'Lip', 'Srp', 'Kol', 'Ruj', 'Lis', 'Stu', 'Pro']
  const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Stacked bar chart data (troškovi po kategorijama)
  const expenseColors = {
    fuel: '#06b6d4',
    maintenance: '#22d3ee',
    registration: '#67e8f9',
    insurance: '#a5f3fc',
    repair: '#0891b2',
    cleaning: '#164e63',
    tires: '#0e7490',
    other: '#155e75'
  }

  const expenseLabels = {
    fuel: t('Gorivo', 'Fuel'),
    maintenance: t('Servis', 'Service'),
    registration: t('Registracija', 'Reg.'),
    insurance: t('Osiguranje', 'Insur.'),
    repair: t('Popravak', 'Repair'),
    cleaning: t('Čišćenje', 'Clean.'),
    tires: t('Gume', 'Tires'),
    other: t('Ostalo', 'Other')
  }

  // Income/Expense area chart
  const chartData = []
  if (analytics) {
    if (chartPeriod === 'month') {
      // Tjedni prikaz unutar mjeseca
      const weeksInMonth = [1, 2, 3, 4, 5]
      for (const w of weeksInMonth) {
        const inc = analytics.income?.find(item => parseInt(item.period) === w)
        const exp = analytics.expenses?.find(item => parseInt(item.period) === w)
        chartData.push({
          name: `${t('Tj', 'Wk')}. ${w}`,
          prihodi: parseFloat(inc?.total || 0),
          troskovi: parseFloat(exp?.total || 0),
        })
      }
    } else {
      // Godišnji prikaz — 12 mjeseci
      for (let i = 1; i <= 12; i++) {
        const inc = analytics.income?.find(item => parseInt(item.period) === i)
        const exp = analytics.expenses?.find(item => parseInt(item.period) === i)
        chartData.push({
          name: language === 'hr' ? monthsHr[i - 1] : monthsEn[i - 1],
          prihodi: parseFloat(inc?.total || 0),
          troskovi: parseFloat(exp?.total || 0),
        })
      }
    }
  }

  // Mileage data
  const mileageData = []
  if (data?.mileageByMonth) {
    for (let i = 1; i <= 12; i++) {
      const m = data.mileageByMonth.find(item => parseInt(item.period) === i)
      mileageData.push({
        name: language === 'hr' ? monthsHr[i - 1] : monthsEn[i - 1],
        km: parseInt(m?.total || 0),
      })
    }
  }

  // Expense stacked bar data
  const expenseChartData = []
  if (data?.expensesByCategory) {
    // Grupiraj po mjesecima ako imaš više mjeseci, inače samo jedan bar
    const cats = data.expensesByCategory
    const row = { name: t('Ovaj mjesec', 'This month') }
    cats.forEach(c => { row[c.expense_type] = parseFloat(c.total) })
    expenseChartData.push(row)
  }

  if (!data) return (
    <div className="flex items-center justify-center h-96">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500" />
    </div>
  )

  const s = data.stats || {}
  const notifications = data.notifications || []
  const services = data.upcomingServices || []
  const activity = data.recentActivity || []
  const now = currentTime

  // Vehicle cards config — svaka kartica ima svoj label pair (left/right)
  const vehicleCards = [
    {
      label: t('Vozila', 'Vehicles'), count: s.vehicles || 0,
      leftVal: s.availableVehicles || 0, leftLabel: t('Dostupno', 'Avail'),
      rightVal: s.occupiedVehicles || 0, rightLabel: t('Zauzeto', 'Occ'),
      barColor: 'bg-cyan-500',
      icon: Car, color: 'text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/30',
      path: '/vehicles'
    },
    {
      label: t('Dostupna', 'Available'), count: s.availableVehicles || 0,
      leftVal: s.availableVehicles || 0, leftLabel: t('Dostupno', 'Avail'),
      rightVal: s.vehicles - s.availableVehicles || 0, rightLabel: t('Zauzeto', 'Occ'),
      barColor: 'bg-emerald-500',
      icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/30',
      path: '/vehicles'
    },
    {
      label: t('U servisu', 'In Service'), count: s.activeServices || 0,
      leftVal: s.activeServices || 0, leftLabel: t('Aktivno', 'Active'),
      rightVal: s.scheduledServices || 0, rightLabel: t('Zakazano', 'Sched'),
      barColor: 'bg-amber-500',
      icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/30',
      path: '/services'
    },
    {
      label: t('Neplaćeno', 'Unpaid'), count: s.unpaidInvoices || 0,
      leftVal: s.unpaidInvoices || 0, leftLabel: t('Neplaćeno', 'Unpaid'),
      rightVal: s.partialInvoices || 0, rightLabel: t('Djelomično', 'Part'),
      barColor: 'bg-rose-500',
      icon: Receipt, color: 'text-rose-400', bg: 'bg-rose-500/10', ring: 'ring-rose-500/30',
      path: '/invoices'
    },
  ]

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('Fleet Management', 'Fleet Management')}</h1>
        </div>
        <div className="text-right">
          <p className="text-2xl font-light text-gray-900 dark:text-white">
            {now.toLocaleTimeString(language === 'hr' ? 'hr-HR' : 'en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-sm text-gray-500">
            {now.toLocaleDateString(language === 'hr' ? 'hr-HR' : 'en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* ===== VEHICLE STAT CARDS ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {vehicleCards.map((card) => {
          const Icon = card.icon
          const total = card.leftVal + card.rightVal
          const leftPct = total > 0 ? (card.leftVal / total) * 100 : 0
          return (
            <div
              key={card.label}
              onClick={() => navigate(card.path)}
              className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5"
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${card.bg} ring-1 ${card.ring}`}>
                  <Icon size={24} className={card.color} />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">{card.count}</p>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{card.label}</p>
                </div>
              </div>
              {/* Labels */}
              <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                <span>{card.leftLabel}: {card.leftVal}</span>
                {card.rightVal > 0 && <span className="ml-auto">{card.rightLabel}: {card.rightVal}</span>}
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${card.barColor}`} style={{ width: `${leftPct}%` }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== MAIN GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Charts (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Costs BarChart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-6">
              {t('Troškovi', 'Costs')}
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expenseChartData.length > 0 ? expenseChartData : [{ name: '' }]} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}€`} />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '12px' }}
                    formatter={(value, name) => [`${Number(value).toLocaleString('hr-HR')} €`, expenseLabels[name] || name]}
                  />
                  {data?.expensesByCategory?.map((cat) => (
                    <Bar key={cat.expense_type} dataKey={cat.expense_type} stackId="a" fill={expenseColors[cat.expense_type] || '#64748b'} radius={[4, 4, 0, 0]} maxBarSize={80} />
                  )) || <Bar dataKey="name" fill="#e2e8f0" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Summary Cards Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl p-5 text-white">
              <p className="text-xs opacity-80 mb-1">{t('Ukupni prihod', 'Total Income')}</p>
              <p className="text-2xl font-bold">{formatEur(s.totalIncome)} €</p>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-5 text-white">
              <p className="text-xs opacity-80 mb-1">{t('Ukupni trošak', 'Total Expenses')}</p>
              <p className="text-2xl font-bold">{formatEur(s.totalExpenses)} €</p>
            </div>
            <div className={`rounded-xl p-5 text-white ${(s.monthProfit || 0) >= 0 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' : 'bg-gradient-to-br from-rose-500 to-red-600'}`}>
              <p className="text-xs opacity-80 mb-1">{t('Profit', 'Profit')}</p>
              <p className="text-2xl font-bold">{formatEur(s.monthProfit)} €</p>
            </div>
          </div>

          {/* Mileage AreaChart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {t('Kilometraža', 'Mileage')}
              </h2>
              <div className="text-right">
                <p className="text-xs text-gray-500">{t('Ukupno', 'Total')}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {parseInt(data.totalMileage || 0).toLocaleString()} km
                </p>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={mileageData.length > 0 ? mileageData : chartData.map((c, i) => ({ ...c, km: 0 }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradMileage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '12px' }} formatter={(v) => [`${Number(v).toLocaleString('hr-HR')} km`, '']} />
                  <Area type="monotone" dataKey="km" stroke="#06b6d4" strokeWidth={2.5} fill="url(#gradMileage)" dot={{ r: 3, fill: '#06b6d4' }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Income/Expenses AreaChart */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {t('Prihodi i troškovi', 'Income & Expenses')}
              </h2>
              <div className="flex items-center gap-2">
                {/* Period toggle */}
                <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                  <button
                    onClick={() => setChartPeriod('year')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartPeriod === 'year' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}
                  >
                    {t('Godišnji', 'Yearly')}
                  </button>
                  <button
                    onClick={() => setChartPeriod('month')}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${chartPeriod === 'month' ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500'}`}
                  >
                    {t('Mjesečni', 'Monthly')}
                  </button>
                </div>
                {chartPeriod === 'month' && (
                  <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="input-field text-xs py-1.5">
                    {monthsHr.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                  </select>
                )}
                <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="input-field text-xs py-1.5">
                  {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradInc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradExp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k €` : `${v} €`}
                    domain={[0, 'auto']}
                    allowDecimals={true}
                  />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: '12px' }} formatter={(v, n) => [`${Number(v).toLocaleString('hr-HR')} €`, n === 'prihodi' ? t('Prihodi', 'Income') : t('Troškovi', 'Expenses')]} />
                  <Area type="monotone" dataKey="prihodi" stroke="#10b981" strokeWidth={2.5} fill="url(#gradInc)" dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="troskovi" stroke="#f43f5e" strokeWidth={2.5} fill="url(#gradExp)" dot={{ r: 3, fill: '#f43f5e' }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* RIGHT: Services + Notifications (1/3) */}
        <div className="space-y-6">
          {/* Upcoming Services */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">
                {t('Servis i održavanje', 'Service & Maintenance')}
              </h2>
              <button onClick={() => navigate('/services')} className="text-xs text-cyan-600 hover:text-cyan-700 font-medium">
                {t('Sve →', 'All →')}
              </button>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {services.length === 0 && (
                <div className="px-5 py-10 text-center">
                  <CheckCircle2 className="mx-auto text-gray-300 mb-2" size={28} />
                  <p className="text-sm text-gray-500">{t('Nema zakazanih servisa', 'No scheduled services')}</p>
                </div>
              )}
              {services.map((svc) => {
                const overdue = new Date(svc.service_date) < new Date().setHours(0, 0, 0, 0)
                return (
                  <div
                    key={svc.id}
                    onClick={() => navigate(`/vehicles/${svc.vehicle_id}`)}
                    className="px-5 py-3.5 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  >
                    <div className="text-right shrink-0 w-12">
                      <p className="text-xs text-gray-500">{formatDate(svc.service_date).slice(3)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{svc.service_type}</p>
                    </div>
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded shrink-0">
                      {svc.license_plate || 'S : ---'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white text-sm">{t('Obavijesti', 'Notifications')}</h2>
              {notifications.length > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{notifications.length}</span>
              )}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {notifications.length === 0 && (
                <div className="px-5 py-8 text-center">
                  <CheckCircle2 className="mx-auto text-green-400 mb-2" size={28} />
                  <p className="text-sm text-gray-500">{t('Sve je u redu', 'All good')}</p>
                </div>
              )}
              {notifications.slice(0, 6).map((alert, i) => {
                const isReg = alert.alert_type?.includes('REGISTRATION')
                const isYellow = alert.alert_type?.includes('YELLOW')
                const expired = alert.alert_type?.includes('EXPIRED')
                const label = isReg ? t('Registracija', 'Reg.') : isYellow ? t('Žuti karton', 'Y.Card') : 'PP'
                return (
                  <div
                    key={i}
                    onClick={() => alert.vehicle_id && navigate(`/vehicles/${alert.vehicle_id}`)}
                    className={`px-5 py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${expired ? 'bg-red-50/40 dark:bg-red-900/10' : ''}`}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${expired ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white">{label}</p>
                      <p className="text-xs text-gray-500">{alert.manufacturer} {alert.model}</p>
                    </div>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${expired ? 'bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600'}`}>
                      {alert.license_plate}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Recent Activity */}
          {activity.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h2 className="font-semibold text-gray-900 dark:text-white text-sm">{t('Zadnje aktivnosti', 'Recent Activity')}</h2>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {activity.slice(0, 5).map((act, i) => (
                  <div key={i} className="px-5 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{act.description}</p>
                      <p className="text-xs text-gray-400">{formatDate(act.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
