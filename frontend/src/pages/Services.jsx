import { useState, useEffect } from 'react'
import axios from 'axios'
import { 
  Plus, Search, Check, Wrench, Calendar, Trash2, 
  Printer, DollarSign, FileText, X, ChevronLeft, 
  CreditCard, History, Clock, CheckCircle2, WrenchIcon
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

export default function Services() {
  const [services, setServices] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [mechanics, setMechanics] = useState([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('') // ''=all, 'scheduled', 'confirmed', 'completed'
  const [showModal, setShowModal] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedService, setSelectedService] = useState(null)
  const [serviceDetail, setServiceDetail] = useState(null)
  const [warehouseParts, setWarehouseParts] = useState([])
  const [mechanicDebts, setMechanicDebts] = useState([])
  const [mechanicDebtsLoading, setMechanicDebtsLoading] = useState(false)
  const [mechanicPayments, setMechanicPayments] = useState([])
  const [allPayments, setAllPayments] = useState([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const { user } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [formData, setFormData] = useState({ 
    vehicle_id: '', service_type: '', description: '', service_date: '' 
  })

  const [completeData, setCompleteData] = useState({ 
    work_description: '', labor_cost: '', mileage: '', parts_used: [] 
  })

  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    note: ''
  })

  useEffect(() => { 
    fetchServices(); 
    fetchWarehouse();
    fetchVehicles();
    fetchMechanics();
    fetchMechanicDebts();
  }, [groupFilter])

  const fetchServices = async () => {
    try { 
      const params = {}
      if (groupFilter) params.status = groupFilter
      const res = await axios.get('/api/services', { params })
      setServices(res.data)
    } catch (err) { toast.error(t('\u274c Greška pri učitavanju', '\u274c Error loading')) }
  }

  const fetchVehicles = async () => {
    try {
      const res = await axios.get('/api/vehicles')
      setVehicles(res.data)
    } catch (err) { console.error('Vehicles fetch error:', err) }
  }

  const fetchMechanics = async () => {
    try {
      const res = await axios.get('/api/users')
      setMechanics(res.data.filter(u => u.role === 'mechanic'))
    } catch (err) { console.error('Mechanics fetch error:', err) }
  }

  const fetchWarehouse = async () => {
    try {
      const res = await axios.get('/api/warehouse')
      setWarehouseParts(res.data)
    } catch (err) { console.error('Warehouse fetch error:', err) }
  }

  const fetchServiceDetail = async (id) => {
    try {
      const res = await axios.get(`/api/services/${id}`)
      setServiceDetail(res.data)
      fetchMechanicPayments(id)
    } catch (err) {
      toast.error(t('\u274c Greška', '\u274c Error'))
    }
  }

  const fetchMechanicPayments = async (serviceId) => {
    setPaymentsLoading(true)
    try {
      const res = await axios.get(`/api/services/${serviceId}/mechanic-payments`)
      setMechanicPayments(res.data)
    } catch (err) {
      console.error('Fetch payments error:', err)
      setMechanicPayments([])
    } finally {
      setPaymentsLoading(false)
    }
  }

  const fetchMechanicDebts = async () => {
    setMechanicDebtsLoading(true)
    try {
      const usersRes = await axios.get('/api/users')
      const mechList = usersRes.data.filter(u => u.role === 'mechanic')
      setMechanics(mechList)

      if (mechList.length === 0) {
        setMechanicDebts([])
        setAllPayments([])
        setMechanicDebtsLoading(false)
        return
      }

      const debts = await Promise.all(
        mechList.map(async (m) => {
          try {
            const res = await axios.get(`/api/services/mechanic-debt/${m.id}`)
            return { ...m, ...res.data }
          } catch (err) {
            return { ...m, total_labor: 0, total_paid: 0, remaining_debt: 0, error: true }
          }
        })
      )
      setMechanicDebts(debts)

      await fetchAllPayments()

    } catch (err) {
      console.error('fetchMechanicDebts error:', err)
    } finally {
      setMechanicDebtsLoading(false)
    }
  }

  const fetchAllPayments = async () => {
    setPaymentsLoading(true)
    try {
      const res = await axios.get('/api/services/mechanic-payments/all')
      setAllPayments(res.data)
    } catch (err) {
      console.error('Fetch all payments error:', err)
      setAllPayments([])
    } finally {
      setPaymentsLoading(false)
    }
  }

  const handlePayment = async (e) => {
    e.preventDefault()
    if (!selectedService) return

    const paymentToast = toast.loading(t('\u23f3 Zapisivanje plaćanja...', '\u23f3 Recording payment...'))

    try {
      let res

      if (selectedService.id) {
        res = await axios.post(`/api/services/${selectedService.id}/mechanic-payments`, {
          amount: parseFloat(paymentForm.amount),
          payment_date: paymentForm.payment_date,
          note: paymentForm.note
        })
      } else {
        res = await axios.post('/api/services/mechanic-payments/by-mechanic', {
          mechanic_id: selectedService.mechanic_id,
          amount: parseFloat(paymentForm.amount),
          payment_date: paymentForm.payment_date,
          note: paymentForm.note
        })
      }

      toast.success(
        t(`\u2705 Plaćanje zabilježeno. Preostalo: €${res.data.remaining_debt.toFixed(2)}`, 
          `\u2705 Payment recorded. Remaining: €${res.data.remaining_debt.toFixed(2)}`),
        { id: paymentToast }
      )

      setShowPaymentModal(false)
      setPaymentForm({ amount: '', payment_date: new Date().toISOString().split('T')[0], note: '' })
      setSelectedService(null)

      fetchMechanicDebts()
      fetchServices()
    } catch (err) {
      toast.error(err.response?.data?.error || t('\u274c Greška pri plaćanju', '\u274c Payment error'), { id: paymentToast })
    }
  }

  const handleDeletePayment = async (paymentId) => {
    if (!confirm(t('Jeste li sigurni?', 'Are you sure?'))) return

    const delToast = toast.loading(t('\u23f3 Brisanje...', '\u23f3 Deleting...'))

    try {
      await axios.delete(`/api/services/mechanic-payments/${paymentId}`)
      toast.success(t('\u2705 Plaćanje obrisano', '\u2705 Payment deleted'), { id: delToast })
      fetchMechanicDebts()
      fetchServices()
    } catch (err) {
      toast.error(t('\u274c Greška', '\u274c Error'), { id: delToast })
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()

    const createToast = toast.loading(t('\u23f3 Zakazivanje...', '\u23f3 Scheduling...'))

    try { 
      await axios.post('/api/services', formData)
      toast.success(t('\u2705 Servis zakazan', '\u2705 Scheduled'), { id: createToast })
      setShowModal(false)
      setFormData({ vehicle_id: '', service_type: '', description: '', service_date: '' })
      fetchServices()
    } catch (err) { 
      toast.error(t('\u274c Greška', '\u274c Error'), { id: createToast })
    }
  }

  const handleConfirm = async (id) => {
    const confirmToast = toast.loading(t('\u23f3 Potvrđivanje...', '\u23f3 Confirming...'))

    try { 
      await axios.put(`/api/services/${id}/confirm`)
      toast.success(t('\u2705 Servis potvrđen', '\u2705 Confirmed'), { id: confirmToast })
      fetchServices()
    } catch (err) { 
      toast.error(t('\u274c Greška', '\u274c Error'), { id: confirmToast })
    }
  }

  const handleComplete = async (e) => {
    e.preventDefault()

    const completeToast = toast.loading(t('\u23f3 Završavanje...', '\u23f3 Completing...'))

    try { 
      await axios.put(`/api/services/${selectedService.id}/complete`, completeData)
      toast.success(t('\u2705 Servis završen', '\u2705 Completed'), { id: completeToast })
      setShowCompleteModal(false)
      setSelectedService(null)
      setCompleteData({ work_description: '', labor_cost: '', mileage: '', parts_used: [] })
      fetchServices()
      if (serviceDetail?.id === selectedService.id) fetchServiceDetail(selectedService.id)
    } catch (err) { 
      toast.error(err.response?.data?.error || t('\u274c Greška', '\u274c Error'), { id: completeToast })
    }
  }

  const handleDelete = async (id) => {
    const service = services.find(s => s.id === id)
    let confirmMessage = t('Jeste li sigurni da želite obrisati ovaj servis?', 'Are you sure you want to delete this service?')

    if (service?.status === 'completed') {
      confirmMessage = t(
        'Servis je završen. Brisanjem će se dijelovi vratiti na skladište i kilometraža vozila biti vraćena. Nastaviti?',
        'Service is completed. Deleting will return parts to warehouse and revert vehicle mileage. Continue?'
      )
    } else if (service?.status === 'confirmed') {
      confirmMessage = t(
        'Servis je potvrđen. Jeste li sigurni da želite obrisati?',
        'Service is confirmed. Are you sure you want to delete?'
      )
    }

    if (!confirm(confirmMessage)) return

    const deleteToast = toast.loading(t('\u23f3 Brisanje...', '\u23f3 Deleting...'))

    try { 
      const res = await axios.delete(`/api/services/${id}`)
      const msg = res.data.partsReturned > 0 
        ? t(`\u2705 Servis obrisan. Vraćeno ${res.data.partsReturned} dijelova na skladište.`, `\u2705 Service deleted. ${res.data.partsReturned} parts returned to warehouse.`)
        : t('\u2705 Servis obrisan', '\u2705 Service deleted')
      toast.success(msg, { id: deleteToast })
      fetchServices()
      if (serviceDetail?.id === id) setServiceDetail(null)
    } catch (err) { 
      toast.error(err.response?.data?.error || t('\u274c Greška pri brisanju', '\u274c Delete error'), { id: deleteToast })
    }
  }

  const addPart = (part) => {
    const existing = completeData.parts_used.find(p => p.part_id === part.id)
    if (existing) {
      toast.error(t('\u26a0\ufe0f Dio je već dodan', '\u26a0\ufe0f Part already added'))
      return
    }
    setCompleteData(prev => ({
      ...prev,
      parts_used: [...prev.parts_used, { 
        part_id: part.id, 
        name: part.name,
        part_number: part.part_number,
        quantity: 1, 
        unit_price: part.unit_price || 0 
      }]
    }))
  }

  const removePart = (partId) => {
    setCompleteData(prev => ({
      ...prev,
      parts_used: prev.parts_used.filter(p => p.part_id !== partId)
    }))
  }

  const updatePartQuantity = (partId, quantity) => {
    setCompleteData(prev => ({
      ...prev,
      parts_used: prev.parts_used.map(p => 
        p.part_id === partId ? { ...p, quantity: parseInt(quantity) || 1 } : p
      )
    }))
  }

  const canCreate = user?.role === 'admin' || user?.permissions?.['services.create']
  const canDelete = user?.role === 'admin' || user?.permissions?.['services.delete']
  const isMechanic = user?.role === 'admin' || user?.role === 'mechanic'

  const getStatusColor = (status) => {
    switch(status) {
      case 'scheduled': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'confirmed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusLabel = (status) => {
    const labels = {
      scheduled: t('Zakazano', 'Scheduled'),
      confirmed: t('Potvrđeno', 'Confirmed'),
      completed: t('Završeno', 'Completed')
    }
    return labels[status] || status
  }

  // Brojači za grupe
  const scheduledServices = services.filter(s => s.status === 'scheduled')
  const confirmedServices = services.filter(s => s.status === 'confirmed')
  const completedServices = services.filter(s => s.status === 'completed')

  if (serviceDetail) {
    const partsTotal = serviceDetail.parts_used?.reduce((sum, p) => sum + (p.quantity * p.unit_price), 0) || 0
    const laborCost = parseFloat(serviceDetail.labor_cost || 0)
    const totalCost = laborCost + partsTotal

    const paidForThisService = mechanicPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0)
    const remainingForThisService = laborCost - paidForThisService

    return (
      <div className="space-y-4 md:space-y-6 px-2 md:px-0">
        <div className="flex items-center gap-3 print:hidden">
          <button 
            onClick={() => setServiceDetail(null)} 
            className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('Servisni zapisnik', 'Service Report')}</h1>
          <div className="ml-auto flex gap-2">
            <button 
              onClick={() => window.print()} 
              className="btn-secondary flex items-center gap-2"
            >
              <Printer size={16} /> <span className="hidden sm:inline">{t('Print', 'Print')}</span>
            </button>
          </div>
        </div>

        <div className="hidden print:block mb-8">
          <h1 className="text-2xl font-bold">JoleDrive d.o.o - {t('Servisni zapisnik', 'Service Report')}</h1>
          <p className="text-sm text-gray-500">{new Date().toLocaleDateString('hr-HR')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-4">
            <p className="text-sm text-gray-500 mb-1">{t('Vozilo', 'Vehicle')}</p>
            <p className="font-bold text-lg dark:text-white">{serviceDetail.manufacturer} {serviceDetail.model}</p>
            <p className="text-sm text-gray-500">{serviceDetail.license_plate}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500 mb-1">{t('Mehaničar', 'Mechanic')}</p>
            <p className="font-bold text-lg dark:text-white">{serviceDetail.mechanic_name || '-'}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500 mb-1">{t('Status', 'Status')}</p>
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(serviceDetail.status)}`}>
              {getStatusLabel(serviceDetail.status)}
            </span>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-medium mb-2 dark:text-white">{t('Opis kvara', 'Issue Description')}</h3>
          <p className="dark:text-gray-300">{serviceDetail.description}</p>
        </div>

        {serviceDetail.status === 'completed' && (
          <>
            <div className="card p-4">
              <h3 className="font-medium mb-2 dark:text-white">{t('Obavljeni radovi', 'Work Done')}</h3>
              <p className="dark:text-gray-300">{serviceDetail.work_description}</p>
            </div>

            <div className="card p-4">
              <h3 className="font-medium mb-3 dark:text-white">{t('Korišteni dijelovi', 'Used Parts')}</h3>
              {serviceDetail.parts_used?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border rounded-lg">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs dark:text-gray-300">{t('Dio', 'Part')}</th>
                        <th className="px-4 py-2 text-left text-xs dark:text-gray-300">{t('Šifra', 'Part #')}</th>
                        <th className="px-4 py-2 text-left text-xs dark:text-gray-300">{t('Kol.', 'Qty')}</th>
                        <th className="px-4 py-2 text-left text-xs dark:text-gray-300">{t('Cijena', 'Price')}</th>
                        <th className="px-4 py-2 text-left text-xs dark:text-gray-300">{t('Ukupno', 'Total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {serviceDetail.parts_used.map((part, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 dark:text-gray-300">{part.part_name}</td>
                          <td className="px-4 py-2 dark:text-gray-300">{part.part_number}</td>
                          <td className="px-4 py-2 dark:text-gray-300">{part.quantity}</td>
                          <td className="px-4 py-2 dark:text-gray-300">€{part.unit_price}</td>
                          <td className="px-4 py-2 font-medium dark:text-gray-300">€{(part.quantity * part.unit_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 italic">{t('Nema korištenih dijelova', 'No parts used')}</p>
              )}
            </div>

            <div className="card p-4 bg-gray-50 dark:bg-gray-700/50">
              <h3 className="font-medium mb-3 dark:text-white">{t('Financijski pregled', 'Financial Overview')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('Cijena rada', 'Labor Cost')}</p>
                  <p className="text-xl font-bold dark:text-white">€{laborCost.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('Dijelovi', 'Parts')}</p>
                  <p className="text-xl font-bold dark:text-white">€{partsTotal.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('Ukupno troškovi', 'Total Costs')}</p>
                  <p className="text-xl font-bold text-red-600">€{totalCost.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {serviceDetail.mechanic_id && (
              <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium dark:text-white flex items-center gap-2">
                    <DollarSign size={18} className="text-blue-600" />
                    {t('Dugovanje mehaničaru', 'Mechanic Debt')}
                  </h3>
                  <span className={`text-xl font-bold ${remainingForThisService > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    €{remainingForThisService.toFixed(2)}
                  </span>
                </div>

                <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-3">
                  <span>{t('Cijena rada', 'Labor')}: €{laborCost.toFixed(2)}</span>
                  <span>{t('Plaćeno', 'Paid')}: €{paidForThisService.toFixed(2)}</span>
                </div>

                {remainingForThisService > 0 && (
                  <button
                    onClick={() => {
                      setSelectedService(serviceDetail)
                      setPaymentForm({
                        amount: remainingForThisService.toFixed(2),
                        payment_date: new Date().toISOString().split('T')[0],
                        note: ''
                      })
                      setShowPaymentModal(true)
                    }}
                    className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
                  >
                    <CreditCard size={16} /> {t('Plati mehaničaru', 'Pay Mechanic')}
                  </button>
                )}

                {mechanicPayments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-700">
                    <h4 className="text-sm font-medium mb-2 dark:text-white flex items-center gap-2">
                      <History size={14} />
                      {t('Povijest plaćanja', 'Payment History')}
                    </h4>
                    <div className="space-y-2">
                      {mechanicPayments.map(payment => (
                        <div key={payment.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg">
                          <div>
                            <p className="text-sm font-medium dark:text-white">€{parseFloat(payment.amount).toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(payment.payment_date).toLocaleDateString('hr-HR')}
                              {payment.note && ` - ${payment.note}`}
                            </p>
                          </div>
                          {user?.role === 'admin' && (
                            <button
                              onClick={() => handleDeletePayment(payment.id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 print:hidden">
          <button 
            onClick={() => setServiceDetail(null)} 
            className="btn-secondary"
          >
            {t('Natrag', 'Back')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('Servis', 'Service')}</h1>
        <div className="flex gap-2">
          {canCreate && (
            <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 w-full sm:w-auto justify-center">
              <Plus size={20} /> {t('Zakaži', 'Schedule')}
            </button>
          )}
        </div>
      </div>

      {mechanicDebts.length > 0 && (
        <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
              <DollarSign size={20} className="text-blue-600" />
              {t('Preostalo dugovanje mehaničaru', 'Remaining Mechanic Debt')}
            </h2>
            <span className={`text-2xl font-bold ${
              mechanicDebts.reduce((sum, m) => sum + m.remaining_debt, 0) > 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              €{mechanicDebts.reduce((sum, m) => sum + m.remaining_debt, 0).toFixed(2)}
            </span>
          </div>

          <div className="space-y-2 mb-3">
            {mechanicDebts.map(mechanic => (
              <div key={mechanic.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg">
                <div>
                  <p className="font-medium dark:text-white">{mechanic.name}</p>
                  <p className="text-xs text-gray-500">
                    {t('Ukupno rada', 'Total Labor')}: €{mechanic.total_labor.toFixed(2)} | 
                    {t('Plaćeno', 'Paid')}: €{mechanic.total_paid.toFixed(2)}
                  </p>
                </div>
                <span className={`text-lg font-bold ${mechanic.remaining_debt > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  €{mechanic.remaining_debt.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700">
            <h3 className="text-sm font-medium mb-2 dark:text-white flex items-center gap-2">
              <History size={14} />
              {t('Povijest plaćanja', 'Payment History')}
            </h3>

            {paymentsLoading ? (
              <p className="text-sm text-gray-500">{t('Učitavanje...', 'Loading...')}</p>
            ) : allPayments.length === 0 ? (
              <p className="text-sm text-gray-500 italic">{t('Nema plaćanja', 'No payments')}</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allPayments.map(payment => (
                  <div key={payment.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="text-sm font-medium dark:text-white">
                        €{parseFloat(payment.amount).toFixed(2)}
                        {payment.mechanic_name && ` - ${payment.mechanic_name}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(payment.payment_date).toLocaleDateString('hr-HR')}
                        {payment.note && ` - ${payment.note}`}
                      </p>
                    </div>
                    {user?.role === 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePayment(payment.id);
                        }}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {mechanicDebts.some(m => m.remaining_debt > 0) && (
            <button
              onClick={() => {
                const firstDebt = mechanicDebts.find(m => m.remaining_debt > 0)
                if (firstDebt) {
                  setSelectedService({ 
                    id: null,
                    mechanic_id: firstDebt.id,
                    mechanic_name: firstDebt.name,
                    service_type: t('Dugovanje mehaničaru', 'Mechanic Debt')
                  })
                  setPaymentForm({
                    amount: firstDebt.remaining_debt.toFixed(2),
                    payment_date: new Date().toISOString().split('T')[0],
                    note: ''
                  })
                  setShowPaymentModal(true)
                }
              }}
              className="mt-3 btn-primary flex items-center gap-2 w-full sm:w-auto justify-center"
            >
              <CreditCard size={16} /> {t('Plati mehaničaru', 'Pay Mechanic')}
            </button>
          )}
        </div>
      )}

      {/* ===== TABS ZA GRUPIRANJE SERVISA ===== */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder={t('Pretraži vozilo ili opis...', 'Search vehicle or description...')} 
            value={search} 
            onChange={e => setSearch(e.target.value)} 
            className="input-field pl-10 w-full" 
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setGroupFilter('')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === ''
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          {t('Svi servisi', 'All Services')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === '' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
          }`}>
            {services.length}
          </span>
        </button>
        <button
          onClick={() => setGroupFilter('scheduled')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === 'scheduled'
              ? 'bg-yellow-600 text-white'
              : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:hover:bg-yellow-900/30'
          }`}
        >
          <Clock size={16} />
          {t('Zakazano', 'Scheduled')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === 'scheduled' ? 'bg-white/20 text-white' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200'
          }`}>
            {scheduledServices.length}
          </span>
        </button>
        <button
          onClick={() => setGroupFilter('confirmed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === 'confirmed'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30'
          }`}
        >
          <Wrench size={16} />
          {t('U servisu', 'In Service')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === 'confirmed' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200'
          }`}>
            {confirmedServices.length}
          </span>
        </button>
        <button
          onClick={() => setGroupFilter('completed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === 'completed'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30'
          }`}
        >
          <CheckCircle2 size={16} />
          {t('Završeno', 'Completed')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === 'completed' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
          }`}>
            {completedServices.length}
          </span>
        </button>
      </div>
      {/* ===== KRAJ TABS ===== */}

      <div className="space-y-3">
        {services.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Wrench size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg">{t('Nema servisa', 'No services')}</p>
          </div>
        )}

        {/* Prikaži servise grupirane po statusu */}
        {(groupFilter === '' || groupFilter === 'scheduled') && scheduledServices.length > 0 && (
          <div>
            {groupFilter === '' && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <Clock size={16} className="text-yellow-600" />
                <h3 className="font-semibold text-yellow-700 dark:text-yellow-300">
                  {t('Zakazano', 'Scheduled')}
                </h3>
                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs dark:bg-yellow-900/30 dark:text-yellow-300">
                  {scheduledServices.length}
                </span>
              </div>
            )}
            {scheduledServices
              .filter(s => 
                !search || 
                s.service_type?.toLowerCase().includes(search.toLowerCase()) ||
                s.description?.toLowerCase().includes(search.toLowerCase()) ||
                s.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
                s.model?.toLowerCase().includes(search.toLowerCase()) ||
                s.license_plate?.toLowerCase().includes(search.toLowerCase())
              )
              .map(service => renderServiceCard(service))}
          </div>
        )}

        {(groupFilter === '' || groupFilter === 'confirmed') && confirmedServices.length > 0 && (
          <div>
            {groupFilter === '' && (
              <div className="flex items-center gap-2 mb-2 px-1 mt-4">
                <Wrench size={16} className="text-blue-600" />
                <h3 className="font-semibold text-blue-700 dark:text-blue-300">
                  {t('U servisu', 'In Service')}
                </h3>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs dark:bg-blue-900/30 dark:text-blue-300">
                  {confirmedServices.length}
                </span>
              </div>
            )}
            {confirmedServices
              .filter(s => 
                !search || 
                s.service_type?.toLowerCase().includes(search.toLowerCase()) ||
                s.description?.toLowerCase().includes(search.toLowerCase()) ||
                s.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
                s.model?.toLowerCase().includes(search.toLowerCase()) ||
                s.license_plate?.toLowerCase().includes(search.toLowerCase())
              )
              .map(service => renderServiceCard(service))}
          </div>
        )}

        {(groupFilter === '' || groupFilter === 'completed') && completedServices.length > 0 && (
          <div>
            {groupFilter === '' && (
              <div className="flex items-center gap-2 mb-2 px-1 mt-4">
                <CheckCircle2 size={16} className="text-green-600" />
                <h3 className="font-semibold text-green-700 dark:text-green-300">
                  {t('Završeno', 'Completed')}
                </h3>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs dark:bg-green-900/30 dark:text-green-300">
                  {completedServices.length}
                </span>
              </div>
            )}
            {completedServices
              .filter(s => 
                !search || 
                s.service_type?.toLowerCase().includes(search.toLowerCase()) ||
                s.description?.toLowerCase().includes(search.toLowerCase()) ||
                s.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
                s.model?.toLowerCase().includes(search.toLowerCase()) ||
                s.license_plate?.toLowerCase().includes(search.toLowerCase())
              )
              .map(service => renderServiceCard(service))}
          </div>
        )}
      </div>

      {showPaymentModal && selectedService && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold dark:text-white">{t('Plati mehaničaru', 'Pay Mechanic')}</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('Mehaničar', 'Mechanic')}: <strong>{selectedService.mechanic_name}</strong>
              </p>
            </div>

            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('Iznos (€)', 'Amount')} *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={paymentForm.amount} 
                  onChange={e => setPaymentForm({...paymentForm, amount: e.target.value})} 
                  className="input-field w-full" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Datum plaćanja', 'Payment Date')} *</label>
                <input 
                  type="date" 
                  required 
                  value={paymentForm.payment_date} 
                  onChange={e => setPaymentForm({...paymentForm, payment_date: e.target.value})} 
                  className="input-field w-full" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Napomena', 'Note')}</label>
                <textarea 
                  value={paymentForm.note} 
                  onChange={e => setPaymentForm({...paymentForm, note: e.target.value})} 
                  className="input-field w-full" 
                  rows={2} 
                  placeholder={t('npr. Gotovina, bankovni transfer...', 'e.g. Cash, bank transfer...')}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button type="submit" className="btn-primary w-full sm:w-auto flex items-center gap-2 justify-center">
                  <CreditCard size={16} /> {t('Zabilježi plaćanje', 'Record Payment')}
                </button>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary w-full sm:w-auto">
                  {t('Odustani', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-lg p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('Zakaži servis', 'Schedule Service')}</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('Vozilo', 'Vehicle')} *</label>
                <select 
                  required 
                  value={formData.vehicle_id} 
                  onChange={e => setFormData({...formData, vehicle_id: e.target.value})} 
                  className="input-field w-full" 
                >
                  <option value="">{t('Odaberi vozilo...', 'Select vehicle...')}</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.license_plate} - {v.manufacturer} {v.model}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Vrsta servisa', 'Type')} *</label>
                <input 
                  type="text" 
                  required 
                  value={formData.service_type} 
                  onChange={e => setFormData({...formData, service_type: e.target.value})} 
                  className="input-field w-full" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Opis', 'Description')}</label>
                <textarea 
                  value={formData.description} 
                  onChange={e => setFormData({...formData, description: e.target.value})} 
                  className="input-field w-full" 
                  rows={2} 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Datum', 'Date')} *</label>
                <input 
                  type="datetime-local" 
                  required 
                  value={formData.service_date} 
                  onChange={e => setFormData({...formData, service_date: e.target.value})} 
                  className="input-field w-full" 
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button type="submit" className="btn-primary w-full sm:w-auto">{t('Zakaži', 'Schedule')}</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary w-full sm:w-auto">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCompleteModal && selectedService && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-2xl w-full max-w-2xl p-4 sm:p-6 my-0 sm:my-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">{t('Završi servis', 'Complete Service')}</h2>
            <form onSubmit={handleComplete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('Opis obavljenog posla', 'Work Description')} *</label>
                <textarea 
                  required 
                  value={completeData.work_description} 
                  onChange={e => setCompleteData({...completeData, work_description: e.target.value})} 
                  className="input-field w-full" 
                  rows={3} 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Cijena rada (€)', 'Labor Cost')} *</label>
                <input 
                  type="number" 
                  step="0.01" 
                  required 
                  value={completeData.labor_cost} 
                  onChange={e => setCompleteData({...completeData, labor_cost: e.target.value})} 
                  className="input-field w-full" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('Trenutna kilometraža (km)', 'Current Mileage')} *</label>
                <input 
                  type="number" 
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required 
                  value={completeData.mileage} 
                  onChange={e => setCompleteData({...completeData, mileage: e.target.value})} 
                  className="input-field w-full" 
                  placeholder="npr. 125000" 
                />
                <p className="text-xs text-gray-500 mt-1">
                  {t('Kilometraža će se automatski ažurirati u profilu vozila', 'Mileage will auto-update in vehicle profile')}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">{t('Dijelovi sa skladišta', 'Warehouse Parts')}</label>
                <div className="max-h-48 overflow-y-auto border dark:border-gray-600 rounded-lg mb-3">
                  {warehouseParts.map(part => (
                    <div 
                      key={part.id} 
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700 border-b dark:border-gray-600 last:border-0 gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{part.name}</p>
                        <p className="text-xs text-gray-500">{part.part_number} | {t('Zaliha', 'Stock')}: {part.quantity}</p>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => addPart(part)}
                        className="px-3 py-1.5 text-xs bg-primary-100 text-primary-700 rounded hover:bg-primary-200 w-full sm:w-auto"
                      >
                        {t('Dodaj', 'Add')}
                      </button>
                    </div>
                  ))}
                </div>

                {completeData.parts_used.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">{t('Odabrani dijelovi:', 'Selected parts:')}</p>
                    <div className="overflow-x-auto">
                      {completeData.parts_used.map(part => (
                        <div 
                          key={part.part_id} 
                          className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg mb-2 min-w-[300px]"
                        >
                          <span className="flex-1 text-sm break-words min-w-0">{part.name} ({part.part_number})</span>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <label className="text-xs whitespace-nowrap">{t('Kol', 'Qty')}:</label>
                            <input 
                              type="number" 
                              min="1" 
                              max={warehouseParts.find(p => p.id === part.part_id)?.quantity || 99}
                              value={part.quantity} 
                              onChange={e => updatePartQuantity(part.part_id, e.target.value)}
                              className="w-20 input-field text-sm py-1"
                            />
                            <span className="text-sm text-gray-500 whitespace-nowrap">{part.unit_price} €/kom</span>
                            <button 
                              type="button" 
                              onClick={() => removePart(part.part_id)}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded shrink-0"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <button type="submit" className="btn-primary w-full sm:w-auto">{t('Završi', 'Complete')}</button>
                <button type="button" onClick={() => setShowCompleteModal(false)} className="btn-secondary w-full sm:w-auto">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )

  function renderServiceCard(service) {
    return (
      <div 
        key={service.id} 
        onClick={() => fetchServiceDetail(service.id)}
        className="card p-3 md:p-4 cursor-pointer hover:shadow-md transition-shadow"
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="font-semibold text-base md:text-lg break-words">{service.service_type}</h3>
              <span className={`px-2 md:px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>
                {getStatusLabel(service.status)}
              </span>
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm break-words">
              {service.manufacturer} {service.model} 
              <span className="block sm:inline sm:ml-1 text-gray-400">({service.chassis_number})</span>
            </p>
            <p className="text-gray-500 text-sm mt-1 break-words">{service.description}</p>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs md:text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar size={14} /> 
                {new Date(service.service_date).toLocaleString(language === 'hr' ? 'hr-HR' : 'en-US', {
                  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </span>
              {service.mechanic_name && (
                <span className="break-words">{t('Mehaničar', 'Mechanic')}: {service.mechanic_name}</span>
              )}
            </div>

            {service.status === 'completed' && (
              <div className="mt-3 p-2 md:p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm break-words">
                  <strong>{t('Obavljeni posao', 'Work')}:</strong> {service.work_description}
                </p>
                {service.labor_cost > 0 && (
                  <p className="text-sm mt-1">
                    <strong>{t('Cijena rada', 'Labor')}: {service.labor_cost} €</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-row md:flex-col gap-2 md:ml-4 shrink-0 print:hidden">
            {service.status === 'scheduled' && isMechanic && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleConfirm(service.id); }} 
                className="p-2.5 md:p-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 flex-1 md:flex-none flex items-center justify-center gap-1"
                title={t('Potvrdi', 'Confirm')}
              >
                <Check size={18} />
                <span className="md:hidden text-sm">{t('Potvrdi', 'Confirm')}</span>
              </button>
            )}
            {service.status === 'confirmed' && isMechanic && (
              <button 
                onClick={(e) => { e.stopPropagation(); setSelectedService(service); setShowCompleteModal(true); }} 
                className="p-2.5 md:p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 flex-1 md:flex-none flex items-center justify-center gap-1"
                title={t('Završi', 'Complete')}
              >
                <Wrench size={18} />
                <span className="md:hidden text-sm">{t('Završi', 'Complete')}</span>
              </button>
            )}
            {canDelete && (
              <button 
                onClick={(e) => { e.stopPropagation(); handleDelete(service.id); }} 
                className="p-2.5 md:p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex-1 md:flex-none flex items-center justify-center gap-1"
                title={t('Obriši', 'Delete')}
              >
                <Trash2 size={18} />
                <span className="md:hidden text-sm">{t('Obriši', 'Delete')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
}
