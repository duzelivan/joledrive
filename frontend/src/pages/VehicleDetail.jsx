import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  ArrowLeft, Car, Wrench, Receipt, FileText, User,
  Eye, Download, ChevronDown, ChevronUp, Gauge, Fuel, Palette, Hash,
  Calendar, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  History, Key, Plus, Trash2, Clock, Upload, X, BookOpen
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

export default function VehicleDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [vehicle, setVehicle] = useState(null)
  const [activeTab, setActiveTab] = useState('timeline')
  const [expandedItem, setExpandedItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [assignments, setAssignments] = useState([])
  const [users, setUsers] = useState([])
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showReturnModal, setShowReturnModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedAssignment, setSelectedAssignment] = useState(null)
  const [assignForm, setAssignForm] = useState({ user_id: '', start_mileage: '', notes: '' })
  const [returnForm, setReturnForm] = useState({ end_mileage: '', notes: '' })

  // Edit form state
  const [editForm, setEditForm] = useState({
    manufacturer: '', model: '', license_plate: '', chassis_number: '', year: '',
    mileage: '', fuel_type: 'dizel', color: '', registration_date: '',
    yellow_card_date: '', pp_apparatus_date: '', image_url: '', notes: '', assigned_to: ''
  })
  const [editFile, setEditFile] = useState(null)
  const [editImagePreview, setEditImagePreview] = useState(null)
  const [editUploading, setEditUploading] = useState(false)

  useEffect(() => {
    fetchVehicle()
    fetchAssignments()
    fetchUsers()
  }, [id])

  const fetchVehicle = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`/api/vehicles/${id}`)
      setVehicle(res.data)
    } catch (err) {
      toast.error(err.response?.data?.error || t('Greška', 'Error'))
    } finally { setLoading(false) }
  }

  const fetchUsers = async () => {
    try { setUsers((await axios.get('/api/users')).data.filter(u => u.active === 1 || u.active === true)) }
    catch (err) { console.error(err) }
  }

  // ===== EDIT FUNCTIONS =====
  const openEditModal = () => {
    if (!vehicle) return
    setEditForm({
      manufacturer: vehicle.manufacturer || '',
      model: vehicle.model || '',
      license_plate: vehicle.license_plate || '',
      chassis_number: vehicle.chassis_number || '',
      year: vehicle.year || '',
      mileage: vehicle.mileage || '',
      fuel_type: vehicle.fuel_type || 'dizel',
      color: vehicle.color || '',
      registration_date: vehicle.registration_date ? vehicle.registration_date.split('T')[0] : '',
      yellow_card_date: vehicle.yellow_card_date ? vehicle.yellow_card_date.split('T')[0] : '',
      pp_apparatus_date: vehicle.pp_apparatus_date ? vehicle.pp_apparatus_date.split('T')[0] : '',
      image_url: vehicle.image_url || '',
      notes: vehicle.notes || '',
      assigned_to: vehicle.assigned_to || ''
    })
    setEditImagePreview(vehicle.image_url || null)
    setEditFile(null)
    setShowEditModal(true)
  }

  const handleEditImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) { toast.error(t('Samo JPG, PNG, GIF, WebP', 'Only JPG, PNG, GIF, WebP')); return }
    if (file.size > 5 * 1024 * 1024) { toast.error(t('Max 5MB', 'Max 5MB')); return }
    setEditFile(file)
    const reader = new FileReader()
    reader.onloadend = () => setEditImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const handleEditRemoveImage = () => {
    setEditFile(null)
    setEditImagePreview(null)
    setEditForm(p => ({ ...p, image_url: '' }))
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditUploading(true)
    const toastId = toast.loading(t('Ažuriranje...', 'Updating...'))
    try {
      let imageUrl = editForm.image_url
      if (editFile) {
        const data = new FormData()
        data.append('image', editFile)
        data.append('manufacturer', editForm.manufacturer || 'vehicle')
        data.append('model', editForm.model || '')
        const res = await axios.post('https://joledrive.com/upload_vehicle_image.php', data, { headers: { 'Content-Type': 'multipart/form-data' } })
        imageUrl = res.data.image_url
      }
      await axios.put(`/api/vehicles/${id}`, { ...editForm, image_url: imageUrl || '' })
      toast.success(t('Vozilo ažurirano', 'Vehicle updated'), { id: toastId })
      setShowEditModal(false)
      fetchVehicle()
    } catch (err) {
      toast.error(err.response?.data?.error || t('Greška', 'Error'), { id: toastId })
    } finally { setEditUploading(false) }
  }

  const handleDeleteVehicle = async () => {
    if (!confirm(t('Jeste li sigurni da želite obrisati ovo vozilo?', 'Are you sure?'))) return
    try {
      await axios.delete(`/api/vehicles/${id}`)
      toast.success(t('Vozilo obrisano', 'Vehicle deleted'))
      navigate('/vehicles')
    } catch { toast.error(t('Greška', 'Error')) }
  }

  const fetchAssignments = async () => {
    try { setAssignments((await axios.get(`/api/vehicle-assignments/vehicle/${id}`)).data) }
    catch (err) { console.error(err) }
  }

  const handleAssign = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/vehicle-assignments', {
        vehicle_id: parseInt(id),
        user_id: parseInt(assignForm.user_id),
        start_mileage: assignForm.start_mileage ? parseInt(assignForm.start_mileage) : vehicle.mileage,
        notes: assignForm.notes
      })
      toast.success(t('Vozilo zaduženo', 'Vehicle assigned'))
      setShowAssignModal(false)
      setAssignForm({ user_id: '', start_mileage: '', notes: '' })
      fetchAssignments()
      fetchVehicle()
    } catch (err) { toast.error(err.response?.data?.error || t('Greška', 'Error')) }
  }

  const handleReturn = async (e) => {
    e.preventDefault()
    if (!selectedAssignment) return
    try {
      await axios.put(`/api/vehicle-assignments/${selectedAssignment.id}/return`, {
        end_mileage: parseInt(returnForm.end_mileage),
        notes: returnForm.notes
      })
      toast.success(t('Vozilo razduženo', 'Vehicle returned'))
      setShowReturnModal(false)
      setReturnForm({ end_mileage: '', notes: '' })
      setSelectedAssignment(null)
      fetchAssignments()
      fetchVehicle()
    } catch (err) { toast.error(err.response?.data?.error || t('Greška', 'Error')) }
  }

  const handleDeleteAssignment = async (assignmentId) => {
    if (!confirm(t('Jeste li sigurni?', 'Are you sure?'))) return
    try {
      await axios.delete(`/api/vehicle-assignments/${assignmentId}`)
      toast.success(t('Zapis obrisan', 'Record deleted'))
      fetchAssignments()
      fetchVehicle()
    } catch (err) { toast.error(t('Greška', 'Error')) }
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString(language === 'hr' ? 'hr-HR' : 'en-US')
  }

  const formatAmount = (amount) => {
    if (!amount) return '0,00 €'
    return parseFloat(amount).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-700'
      case 'partial': return 'bg-yellow-100 text-yellow-700'
      case 'completed': return 'bg-green-100 text-green-700'
      case 'confirmed': return 'bg-blue-100 text-blue-700'
      case 'scheduled': return 'bg-gray-100 text-gray-700'
      default: return 'bg-red-100 text-red-700'
    }
  }

  const getStatusLabel = (status) => {
    const labels = {
      paid: t('Plaćen', 'Paid'), partial: t('Djelomično', 'Partial'), unpaid: t('Neplaćen', 'Unpaid'),
      completed: t('Završen', 'Completed'), confirmed: t('Potvrđen', 'Confirmed'), scheduled: t('Zakazan', 'Scheduled')
    }
    return labels[status] || status
  }

  const translateDocType = (type) => {
    const labels = {
      insurance: t('Osiguranje', 'Insurance'),
      registration: t('Registracija', 'Registration'),
      contract: t('Ugovor', 'Contract'),
      invoice: t('Račun', 'Invoice'),
      other: t('Ostalo', 'Other')
    }
    return labels[type] || type
  }

  const getInvoiceTypeColor = (type) => type === 'expense'
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'

  const getInvoiceTypeLabel = (type) => type === 'expense' ? t('Trošak', 'Expense') : t('Prihod', 'Income')
  const toggleExpand = (itemId) => setExpandedItem(expandedItem === itemId ? null : itemId)

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>

  if (!vehicle) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <p className="text-gray-500 text-lg">{t('Vozilo nije pronađeno', 'Vehicle not found')}</p>
        <button onClick={() => navigate('/vehicles')} className="btn-primary flex items-center gap-2"><ArrowLeft size={16} /> {t('Natrag', 'Back')}</button>
      </div>
    )
  }

  const incomeInvoices = vehicle.invoices?.filter(inv => inv.invoice_type !== 'expense') || []
  const expenseInvoices = vehicle.invoices?.filter(inv => inv.invoice_type === 'expense') || []
  const totalIncome = incomeInvoices.reduce((s, inv) => s + parseFloat(inv.amount || 0), 0)
  const totalExpenses = expenseInvoices.reduce((s, inv) => s + parseFloat(inv.amount || 0), 0)
  const paidIncome = incomeInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0)
  const paidExpenses = expenseInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + parseFloat(i.amount || 0), 0)
  const currentAssignment = assignments.find(a => a.returned_at === null)
  const canEdit = user?.role === 'admin' || user?.permissions?.['vehicles.edit']
  const canDelete = user?.role === 'admin' || user?.permissions?.['vehicles.delete']

  // ===== TIMELINE =====
  const buildTimeline = () => {
    const events = []
    if (vehicle.created_at) {
      events.push({ type: 'created', date: vehicle.created_at, title: t('Vozilo kreirano', 'Vehicle created'), description: `${vehicle.manufacturer} ${vehicle.model}`, icon: Car, color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' })
    }
    vehicle.service_history?.forEach(s => {
      events.push({ type: 'service', date: s.service_date || s.created_at, title: s.service_type, description: s.mechanic_name || s.work_description || '', status: s.status, icon: Wrench, color: s.status === 'completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400' : s.status === 'confirmed' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400', navigateTo: `/services` })
    })
    vehicle.invoices?.forEach(inv => {
      events.push({ type: 'invoice', date: inv.created_at, title: inv.invoice_number, description: `${inv.invoice_type === 'expense' ? '-' : '+'}${formatAmount(inv.amount)}${inv.description ? ' · ' + inv.description : ''}`, status: inv.status, icon: Receipt, color: inv.invoice_type === 'expense' ? 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400', navigateTo: `/invoices` })
    })
    vehicle.documents?.forEach(doc => {
      events.push({ type: 'document', date: doc.created_at, title: doc.title, description: translateDocType(doc.document_type), icon: FileText, color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400', navigateTo: `/documents` })
    })
    assignments.forEach(a => {
      events.push({ type: 'assign', date: a.assigned_at, title: t('Zaduženo', 'Assigned'), description: `${a.user_name}${a.start_mileage ? ' · ' + a.start_mileage.toLocaleString() + ' km' : ''}`, icon: User, color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400', navigateTo: `/users` })
      if (a.returned_at) {
        events.push({ type: 'return', date: a.returned_at, title: t('Razduženo', 'Returned'), description: `${a.user_name}${a.distance_driven ? ' · ' + a.distance_driven.toLocaleString() + ' km' : ''}`, icon: Key, color: 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400', navigateTo: `/users` })
      }
    })
    return events.sort((a, b) => new Date(b.date) - new Date(a.date))
  }

  const MobileTimelineCard = ({ event }) => {
    const Icon = event.icon
    return (
      <div
        onClick={() => event.navigateTo && navigate(event.navigateTo)}
        className={`flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-2 ${event.navigateTo ? 'cursor-pointer active:bg-gray-100 dark:active:bg-gray-700' : ''}`}
      >
        <div className={`p-2 rounded-full shrink-0 ${event.color}`}><Icon size={14} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="font-medium text-sm text-gray-900 dark:text-white">{event.title}</p>
            {event.status && <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(event.status)}`}>{getStatusLabel(event.status)}</span>}
          </div>
          {event.description && <p className="text-xs text-gray-500 dark:text-gray-400">{event.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{formatDate(event.date)}</p>
        </div>
      </div>
    )
  }

  const renderTimeline = () => {
    const events = buildTimeline()
    return (
      <div className="hidden md:block">
        {events.length === 0 ? <p className="text-gray-500 text-center py-8">{t('Nema zapisa', 'No records')}</p> : (
          <div className="relative pl-8">
            <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />
            <div className="space-y-1">
              {events.map((event, i) => {
                const Icon = event.icon
                return (
                  <div
                    key={i}
                    onClick={() => event.navigateTo && navigate(event.navigateTo)}
                    className={`relative flex items-start gap-4 py-2 ${event.navigateTo ? 'cursor-pointer' : ''}`}
                  >
                    <div className={`absolute left-[-22px] p-1.5 rounded-full ${event.color}`}><Icon size={13} /></div>
                    <div className={`flex-1 rounded-lg p-3 transition-colors ${event.navigateTo ? 'hover:bg-gray-50 dark:hover:bg-gray-700/30' : ''}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="font-medium text-sm text-gray-900 dark:text-white">{event.title}</p>
                            {event.status && <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(event.status)}`}>{getStatusLabel(event.status)}</span>}
                          </div>
                          {event.description && <p className="text-sm text-gray-500 dark:text-gray-400">{event.description}</p>}
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">{formatDate(event.date)}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    )
  }


  // ===== MOBILE CARDS =====
  const MobileServiceCard = ({ service }) => {
    const isExpanded = expandedItem === `service-${service.id}`
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 border-l-4 border-l-blue-500">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(`service-${service.id}`)}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(service.status)}`}>{getStatusLabel(service.status)}</span>
              <span className="text-xs text-gray-500">{formatDate(service.service_date)}</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">{service.service_type}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{service.description || service.work_description}</p>
          </div>
          {isExpanded ? <ChevronUp size={20} className="text-gray-400 ml-2" /> : <ChevronDown size={20} className="text-gray-400 ml-2" />}
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {service.mechanic_name && <p className="text-sm"><span className="text-gray-500">{t('Mehaničar', 'Mechanic')}:</span> {service.mechanic_name}</p>}
            {service.labor_cost && <p className="text-sm"><span className="text-gray-500">{t('Rad', 'Labor')}:</span> {formatAmount(service.labor_cost)}</p>}
            {service.work_description && <p className="text-sm text-gray-600 dark:text-gray-300">{service.work_description}</p>}
          </div>
        )}
      </div>
    )
  }

  const MobileInvoiceCard = ({ invoice }) => {
    const isExpanded = expandedItem === `inv-${invoice.id}`
    const paid = parseFloat(invoice.paid_amount || 0)
    const remaining = parseFloat(invoice.remaining_amount || 0)
    const total = parseFloat(invoice.amount || 0)
    const isPaid = invoice.status === 'paid'
    const isPartial = invoice.status === 'partial'
    const isExpense = invoice.invoice_type === 'expense'
    return (
      <div className={`p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 border-l-4 ${isExpense ? 'border-l-red-500' : isPaid ? 'border-l-green-500' : isPartial ? 'border-l-yellow-500' : 'border-l-blue-500'}`}>
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(`inv-${invoice.id}`)}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>{getStatusLabel(invoice.status)}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getInvoiceTypeColor(invoice.invoice_type)}`}>{getInvoiceTypeLabel(invoice.invoice_type)}</span>
              <span className="text-xs text-gray-500">{formatDate(invoice.due_date)}</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{invoice.description}</p>
            {isPartial && <div className="mt-2"><div className="w-full bg-gray-200 rounded-full h-1.5"><div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${(paid / total) * 100}%` }} /></div></div>}
          </div>
          <p className={`font-bold text-lg ml-2 ${isExpense ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{isExpense ? '-' : ''}{formatAmount(total)}</p>
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            <div className="bg-white dark:bg-gray-800 rounded p-3 space-y-1">
              <div className="flex justify-between text-sm"><span>{t('Ukupno', 'Total')}:</span><span className={`font-semibold ${isExpense ? 'text-red-600' : ''}`}>{isExpense ? '-' : ''}{formatAmount(total)}</span></div>
              {(isPaid || isPartial) && <div className="flex justify-between text-sm"><span className="text-green-600">{t('Plaćeno', 'Paid')}:</span><span className="font-semibold text-green-600">{formatAmount(paid)}</span></div>}
              {!isPaid && <div className="flex justify-between text-sm"><span className="text-red-500">{t('Preostalo', 'Remaining')}:</span><span className="font-semibold text-red-500">{formatAmount(isPartial ? remaining : total)}</span></div>}
            </div>
            {invoice.file_path && (
              <div className="flex gap-3">
                <a href={`https://joledrive.com${invoice.file_path}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600"><Eye size={16} /> {t('Pregled', 'View')}</a>
                <a href={`https://joledrive.com${invoice.file_path}`} download className="flex items-center gap-1 text-sm text-green-600"><Download size={16} /> {t('Preuzmi', 'Download')}</a>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const MobileDocumentCard = ({ doc }) => {
    const isExpanded = expandedItem === `doc-${doc.id}`
    return (
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 border-l-4 border-l-purple-500">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(`doc-${doc.id}`)}>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 dark:text-white truncate">{doc.title}</p>
            <p className="text-xs text-gray-500">{doc.document_type} · {formatFileSize(doc.file_size)}</p>
          </div>
          {isExpanded ? <ChevronUp size={20} className="text-gray-400 ml-2" /> : <ChevronDown size={20} className="text-gray-400 ml-2" />}
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {doc.description && <p className="text-sm text-gray-600 dark:text-gray-300">{doc.description}</p>}
            <p className="text-sm text-gray-500">{t('Učitano', 'Uploaded')}: {formatDate(doc.created_at)}</p>
            {doc.file_path && (
              <div className="flex gap-3">
                <a href={`https://joledrive.com${doc.file_path}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600"><Eye size={16} /> {t('Pregled', 'View')}</a>
                <a href={`https://joledrive.com${doc.file_path}`} download className="flex items-center gap-1 text-sm text-green-600"><Download size={16} /> {t('Preuzmi', 'Download')}</a>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  const MobileAssignmentCard = ({ assignment }) => {
    const isExpanded = expandedItem === `assign-${assignment.id}`
    const isActive = !assignment.returned_at
    return (
      <div className={`p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg mb-3 border-l-4 ${isActive ? 'border-l-blue-500' : 'border-l-green-500'}`}>
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(`assign-${assignment.id}`)}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{isActive ? t('Aktivno', 'Active') : t('Završeno', 'Completed')}</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white">{assignment.user_name}</p>
            <p className="text-xs text-gray-500">{formatDate(assignment.assigned_at)}</p>
          </div>
          <div className="flex items-center gap-2 ml-2">
            {canDelete && <button onClick={(e) => { e.stopPropagation(); handleDeleteAssignment(assignment.id) }} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>}
            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-gray-500">{t('Start km', 'Start')}:</span><p className="font-medium">{assignment.start_mileage?.toLocaleString() || '-'} km</p></div>
              <div><span className="text-gray-500">{t('End km', 'End')}:</span><p className="font-medium">{assignment.end_mileage?.toLocaleString() || '-'} km</p></div>
            </div>
            {assignment.distance_driven > 0 && <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded"><span className="text-primary-600 font-medium">{t('Prijeđeno', 'Distance')}: {assignment.distance_driven.toLocaleString()} km</span></div>}
            {assignment.notes && <p className="text-gray-600 dark:text-gray-300">{assignment.notes}</p>}
            {/* RAZDUŽI gumb za aktivna zaduženja na mobitelu */}
            {isActive && canEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedAssignment(assignment)
                  setShowReturnModal(true)
                }}
                className="w-full mt-2 py-2.5 bg-yellow-100 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 rounded-lg font-medium text-sm flex items-center justify-center gap-2"
              >
                <Key size={16} /> {t('Razduži vozilo', 'Return vehicle')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderMobileList = () => {
    switch (activeTab) {
      case 'timeline': {
        const tlEvents = buildTimeline()
        return tlEvents.length > 0 ? tlEvents.map((e, i) => <MobileTimelineCard key={i} event={e} />) : <p className="text-gray-500">{t('Nema zapisa', 'No records')}</p>
      }
      case 'services': return vehicle.service_history?.length > 0 ? vehicle.service_history.map(s => <MobileServiceCard key={s.id} service={s} />) : <p className="text-gray-500">{t('Nema zapisa', 'No records')}</p>
      case 'invoices': return vehicle.invoices?.length > 0 ? vehicle.invoices.map(i => <MobileInvoiceCard key={i.id} invoice={i} />) : <p className="text-gray-500">{t('Nema računa', 'No invoices')}</p>
      case 'documents': return vehicle.documents?.length > 0 ? vehicle.documents.map(d => <MobileDocumentCard key={d.id} doc={d} />) : <p className="text-gray-500">{t('Nema dokumenata', 'No documents')}</p>
      case 'assignments': return assignments.length > 0 ? assignments.map(a => <MobileAssignmentCard key={a.id} assignment={a} />) : <p className="text-gray-500">{t('Nema zapisa zaduživanja', 'No assignment records')}</p>
      default: return null
    }
  }


  // ===== DESKTOP TABLES =====
  const renderServicesTable = () => (
    <div className="hidden md:block space-y-3">
      {vehicle.service_history?.length === 0 ? <p className="text-gray-500">{t('Nema zapisa', 'No records')}</p> : vehicle.service_history?.map(service => (
        <div key={service.id} className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{service.service_type}</p>
              <p className="text-sm text-gray-500">{service.mechanic_name || t('Nema mehaničara', 'No mechanic')}</p>
            </div>
            <div className="text-right">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>{getStatusLabel(service.status)}</span>
              <p className="text-sm text-gray-500 mt-1">{formatDate(service.service_date)}</p>
            </div>
          </div>
          {service.work_description && <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{service.work_description}</p>}
          {service.labor_cost > 0 && <p className="text-sm font-medium mt-1">{t('Cijena rada', 'Labor')}: {formatAmount(service.labor_cost)}</p>}
        </div>
      ))}
    </div>
  )

  const renderInvoicesTable = () => (
    <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
      <table className="min-w-full">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="table-header text-left px-4 py-3">{t('Broj', 'Number')}</th>
            <th className="table-header text-left px-4 py-3">{t('Tip', 'Type')}</th>
            <th className="table-header text-left px-4 py-3">{t('Opis', 'Description')}</th>
            <th className="table-header text-left px-4 py-3">{t('Iznos', 'Amount')}</th>
            <th className="table-header text-left px-4 py-3">{t('Plaćeno', 'Paid')}</th>
            <th className="table-header text-left px-4 py-3">{t('Preostalo', 'Remaining')}</th>
            <th className="table-header text-left px-4 py-3">{t('Status', 'Status')}</th>
            <th className="table-header text-left px-4 py-3">{t('Dospijeće', 'Due')}</th>
            <th className="table-header text-center px-4 py-3">{t('Akcije', 'Actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {vehicle.invoices?.length === 0 ? <tr><td colSpan="9" className="px-4 py-8 text-center text-gray-500">{t('Nema računa', 'No invoices')}</td></tr> : vehicle.invoices?.map(inv => {
            const paid = parseFloat(inv.paid_amount || 0)
            const remaining = parseFloat(inv.remaining_amount || 0)
            const isExpense = inv.invoice_type === 'expense'
            return (
              <tr key={inv.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${inv.status === 'unpaid' ? 'bg-red-50/30' : inv.status === 'partial' ? 'bg-yellow-50/30' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{inv.invoice_number}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${getInvoiceTypeColor(inv.invoice_type)}`}>{getInvoiceTypeLabel(inv.invoice_type)}</span></td>
                <td className="px-4 py-3 text-gray-900 dark:text-white max-w-[150px] truncate">{inv.description}</td>
                <td className={`px-4 py-3 font-semibold ${isExpense ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{isExpense ? '-' : ''}{formatAmount(inv.amount)}</td>
                <td className="px-4 py-3 text-green-600">{paid > 0 ? formatAmount(paid) : '-'}</td>
                <td className="px-4 py-3 text-red-500">{inv.status !== 'paid' ? formatAmount(remaining) : '-'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(inv.status)}`}>{getStatusLabel(inv.status)}</span></td>
                <td className="px-4 py-3 text-gray-900 dark:text-white">{formatDate(inv.due_date)}</td>
                <td className="px-4 py-3"><div className="flex justify-center gap-1">{inv.file_path && <><a href={`https://joledrive.com${inv.file_path}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={16} /></a><a href={`https://joledrive.com${inv.file_path}`} download className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Download size={16} /></a></>}</div></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const renderDocumentsTable = () => (
    <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
      <table className="min-w-full">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>
            <th className="table-header text-left px-4 py-3">{t('Naziv', 'Title')}</th>
            <th className="table-header text-left px-4 py-3">{t('Tip', 'Type')}</th>
            <th className="table-header text-left px-4 py-3">{t('Veličina', 'Size')}</th>
            <th className="table-header text-left px-4 py-3">{t('Datum', 'Date')}</th>
            <th className="table-header text-center px-4 py-3">{t('Akcije', 'Actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {vehicle.documents?.length === 0 ? <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-500">{t('Nema dokumenata', 'No documents')}</td></tr> : vehicle.documents?.map(doc => (
            <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
              <td className="px-4 py-3"><div className="flex items-center gap-2"><FileText size={16} className="text-purple-500" /><span className="font-medium text-gray-900 dark:text-white">{doc.title}</span></div></td>
              <td className="px-4 py-3 text-gray-900 dark:text-white"><span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-xs">{doc.document_type}</span></td>
              <td className="px-4 py-3 text-gray-900 dark:text-white">{formatFileSize(doc.file_size)}</td>
              <td className="px-4 py-3 text-gray-900 dark:text-white">{formatDate(doc.created_at)}</td>
              <td className="px-4 py-3"><div className="flex justify-center gap-1">{doc.file_path && <><a href={`https://joledrive.com${doc.file_path}`} target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Eye size={16} /></a><a href={`https://joledrive.com${doc.file_path}`} download className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg"><Download size={16} /></a></>}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const renderAssignmentsTable = () => (
    <div className="hidden md:block">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {currentAssignment && <div className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">{t('Trenutno zadužio', 'Currently assigned')}: {currentAssignment.user_name}</div>}
        </div>
        <div className="flex gap-2">
          {canEdit && !currentAssignment && <button onClick={() => setShowAssignModal(true)} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> {t('Zaduži', 'Assign')}</button>}
          {canEdit && currentAssignment && <button onClick={() => { setSelectedAssignment(currentAssignment); setShowReturnModal(true) }} className="btn-secondary flex items-center gap-2 text-sm bg-yellow-100 text-yellow-700 hover:bg-yellow-200 border-yellow-300"><Key size={16} /> {t('Razduži', 'Return')}</button>}
        </div>
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="table-header text-left px-4 py-3">{t('Korisnik', 'User')}</th>
              <th className="table-header text-left px-4 py-3">{t('Od', 'From')}</th>
              <th className="table-header text-left px-4 py-3">{t('Do', 'To')}</th>
              <th className="table-header text-left px-4 py-3">{t('Start km', 'Start')}</th>
              <th className="table-header text-left px-4 py-3">{t('End km', 'End')}</th>
              <th className="table-header text-left px-4 py-3">{t('Prijeđeno', 'Distance')}</th>
              <th className="table-header text-left px-4 py-3">{t('Status', 'Status')}</th>
              {canDelete && <th className="table-header text-center px-4 py-3">{t('Akcije', 'Actions')}</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {assignments.length === 0 ? <tr><td colSpan={canDelete ? 8 : 7} className="px-4 py-8 text-center text-gray-500">{t('Nema zapisa', 'No records')}</td></tr> : assignments.map(a => (
              <tr key={a.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${!a.returned_at ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                <td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-white">{a.user_name}</div><div className="text-xs text-gray-500">{a.user_phone}</div></td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{formatDate(a.assigned_at)}</td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{a.returned_at ? formatDate(a.returned_at) : '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{a.start_mileage?.toLocaleString() || '-'} km</td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{a.end_mileage?.toLocaleString() || '-'} km</td>
                <td className="px-4 py-3 text-sm font-medium text-primary-600">{a.distance_driven ? `${a.distance_driven.toLocaleString()} km` : '-'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-1 rounded text-xs font-medium ${a.returned_at ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{a.returned_at ? t('Završeno', 'Completed') : t('Aktivno', 'Active')}</span></td>
                {canDelete && <td className="px-4 py-3"><div className="flex justify-center"><button onClick={() => handleDeleteAssignment(a.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title={t('Obriši', 'Delete')}><Trash2 size={16} /></button></div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )


  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/vehicles')} className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg transition-colors"><ArrowLeft size={20} /></button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{vehicle.manufacturer} {vehicle.model}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/vehicles/${vehicle.id}/service-book`)} className="btn-secondary flex items-center gap-2"><BookOpen size={16} /> {t('Servisna knjiga', 'Service Book')}</button>
          {canEdit && <button onClick={openEditModal} className="btn-secondary flex items-center gap-2"><History size={16} /> {t('Uredi', 'Edit')}</button>}
          {canDelete && <button onClick={handleDeleteVehicle} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>}
        </div>
      </div>

      {/* ===== BASIC INFO ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 card space-y-4">
          <div className="w-full h-48 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center overflow-hidden">
            {vehicle.image_url ? <img src={vehicle.image_url} alt={`${vehicle.manufacturer} ${vehicle.model}`} className="w-full h-full object-cover" /> : <Car className="text-primary-600" size={64} />}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2"><Hash size={16} className="text-gray-400" /><span className="text-sm text-gray-500">{t('Tablice', 'License')}</span><span className="ml-auto font-medium text-gray-900 dark:text-white">{vehicle.license_plate || '-'}</span></div>
            <div className="flex items-center gap-2"><Gauge size={16} className="text-gray-400" /><span className="text-sm text-gray-500">{t('Kilometraža', 'Mileage')}</span><span className="ml-auto font-medium text-gray-900 dark:text-white">{vehicle.mileage?.toLocaleString() || '-'} km</span></div>
            <div className="flex items-center gap-2"><Fuel size={16} className="text-gray-400" /><span className="text-sm text-gray-500">{t('Gorivo', 'Fuel')}</span><span className="ml-auto font-medium text-gray-900 dark:text-white">{vehicle.fuel_type || '-'}</span></div>
            <div className="flex items-center gap-2"><Palette size={16} className="text-gray-400" /><span className="text-sm text-gray-500">{t('Boja', 'Color')}</span><span className="ml-auto font-medium text-gray-900 dark:text-white">{vehicle.color || '-'}</span></div>
            <div className="flex items-center gap-2"><Calendar size={16} className="text-gray-400" /><span className="text-sm text-gray-500">{t('Godina', 'Year')}</span><span className="ml-auto font-medium text-gray-900 dark:text-white">{vehicle.year || '-'}</span></div>
          </div>
        </div>

        {/* ===== FINANCIAL OVERVIEW ===== */}
        <div className="lg:col-span-2 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2 mb-1"><TrendingUp size={16} className="text-green-600" /><span className="text-xs text-green-600 font-medium">{t('Prihodi', 'Income')}</span></div>
              <p className="text-xl font-bold text-green-700 dark:text-green-400">{formatAmount(totalIncome)}</p>
              <p className="text-xs text-green-600">{t('Plaćeno', 'Paid')}: {formatAmount(paidIncome)}</p>
            </div>
            <div className="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-1"><TrendingDown size={16} className="text-red-600" /><span className="text-xs text-red-600 font-medium">{t('Troškovi', 'Expenses')}</span></div>
              <p className="text-xl font-bold text-red-700 dark:text-red-400">{formatAmount(totalExpenses)}</p>
              <p className="text-xs text-red-600">{t('Plaćeno', 'Paid')}: {formatAmount(paidExpenses)}</p>
            </div>
            <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 mb-1"><DollarSign size={16} className="text-blue-600" /><span className="text-xs text-blue-600 font-medium">{t('Profit', 'Profit')}</span></div>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{formatAmount(totalIncome - totalExpenses)}</p>
              <p className="text-xs text-blue-600">{t('Marža', 'Margin')}: {totalIncome > 0 ? (((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1) : 0}%</p>
            </div>
            <div className="card p-4 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
              <div className="flex items-center gap-2 mb-1"><ArrowUpRight size={16} className="text-yellow-600" /><span className="text-xs text-yellow-600 font-medium">{t('ROI', 'ROI')}</span></div>
              <p className="text-xl font-bold text-yellow-700 dark:text-yellow-400">{totalExpenses > 0 ? ((totalIncome / totalExpenses) * 100).toFixed(0) : 0}%</p>
              <p className="text-xs text-yellow-600">{t('Omjer', 'Ratio')}</p>
            </div>
          </div>

          {/* Financial detail grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: t('Neplaćeni prihodi', 'Unpaid Income'), value: formatAmount(incomeInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.remaining_amount || i.amount || 0), 0)), color: 'text-red-600' },
              { label: t('Neplaćeni troškovi', 'Unpaid Expenses'), value: formatAmount(expenseInvoices.filter(i => i.status !== 'paid').reduce((s, i) => s + parseFloat(i.remaining_amount || i.amount || 0), 0)), color: 'text-orange-600' },
              { label: t('Broj računa', 'Invoices'), value: vehicle.invoices?.length || 0, color: 'text-gray-900 dark:text-white' },
              { label: t('Broj servisa', 'Services'), value: vehicle.service_history?.length || 0, color: 'text-gray-900 dark:text-white' },
              { label: t('Broj dokumenata', 'Documents'), value: vehicle.documents?.length || 0, color: 'text-gray-900 dark:text-white' },
              { label: t('Trenutni vozač', 'Current Driver'), value: vehicle.assigned_name || t('Dostupno', 'Available'), color: vehicle.assigned_name ? 'text-blue-600' : 'text-green-600' },
            ].map((item, i) => (
              <div key={i} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                <p className={`font-semibold ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg overflow-x-auto mb-4">
          {[
            { id: 'timeline', label: t('Povijest', 'History'), icon: Clock, count: buildTimeline().length },
            { id: 'services', label: t('Servisi', 'Services'), icon: Wrench, count: vehicle.service_history?.length || 0 },
            { id: 'invoices', label: t('Računi', 'Invoices'), icon: Receipt, count: vehicle.invoices?.length || 0 },
            { id: 'documents', label: t('Dokumenti', 'Documents'), icon: FileText, count: vehicle.documents?.length || 0 },
            { id: 'assignments', label: t('Zaduženja', 'Assignments'), icon: User, count: assignments.length },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              <span className={`ml-1 px-2 py-0.5 rounded-full text-xs ${activeTab === tab.id ? 'bg-gray-200 dark:bg-gray-500' : 'bg-gray-200 dark:bg-gray-600'}`}>{tab.count}</span>
            </button>
          ))}
        </div>

        {/* TAB CONTENT */}
        {activeTab === 'timeline' && renderTimeline()}
        {activeTab === 'services' && renderServicesTable()}
        {activeTab === 'invoices' && renderInvoicesTable()}
        {activeTab === 'documents' && renderDocumentsTable()}
        {activeTab === 'assignments' && renderAssignmentsTable()}

        {/* MOBILE LISTS */}
        <div className="md:hidden">
          {renderMobileList()}
        </div>
      </div>

      {/* ===== ASSIGN MODAL ===== */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4 dark:text-white">{t('Zaduži vozilo', 'Assign Vehicle')}</h2>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Korisnik', 'User')} *</label>
                <select required value={assignForm.user_id} onChange={e => setAssignForm({ ...assignForm, user_id: e.target.value })} className="input-field w-full">
                  <option value="">{t('Odaberi korisnika', 'Select user')}</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.type === 'client' ? `(${t('Klijent', 'Client')})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Početna kilometraža', 'Start Mileage')}</label>
                <input type="number" value={assignForm.start_mileage} onChange={e => setAssignForm({ ...assignForm, start_mileage: e.target.value })} placeholder={vehicle.mileage?.toString()} className="input-field w-full" />
                <p className="text-xs text-gray-500 mt-1">{t('Trenutna', 'Current')}: {vehicle.mileage?.toLocaleString() || 0} km</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Napomena', 'Notes')}</label>
                <textarea value={assignForm.notes} onChange={e => setAssignForm({ ...assignForm, notes: e.target.value })} rows={3} className="input-field w-full" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary">{t('Zaduži', 'Assign')}</button>
                <button type="button" onClick={() => setShowAssignModal(false)} className="btn-secondary">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== RETURN MODAL ===== */}
      {showReturnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4 dark:text-white">{t('Razduži vozilo', 'Return Vehicle')}</h2>
            <form onSubmit={handleReturn} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Završna kilometraža', 'End Mileage')} *</label>
                <input type="number" required value={returnForm.end_mileage} onChange={e => setReturnForm({ ...returnForm, end_mileage: e.target.value })} className="input-field w-full" />
                {selectedAssignment?.start_mileage && <p className="text-xs text-gray-500 mt-1">{t('Start', 'Start')}: {selectedAssignment.start_mileage.toLocaleString()} km</p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Napomena', 'Notes')}</label>
                <textarea value={returnForm.notes} onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })} rows={3} className="input-field w-full" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary">{t('Razduži', 'Return')}</button>
                <button type="button" onClick={() => setShowReturnModal(false)} className="btn-secondary">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== EDIT VEHICLE MODAL ===== */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold dark:text-white">{t('Uredi vozilo', 'Edit Vehicle')}</h2>
              <button onClick={() => setShowEditModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X size={20} className="text-gray-500" /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Proizvođač', 'Manufacturer')} *</label><input type="text" required value={editForm.manufacturer} onChange={e => setEditForm({...editForm, manufacturer: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Model', 'Model')} *</label><input type="text" required value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Registracija', 'License Plate')} *</label><input type="text" required value={editForm.license_plate} onChange={e => setEditForm({...editForm, license_plate: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Šasija', 'Chassis')}</label><input type="text" value={editForm.chassis_number} onChange={e => setEditForm({...editForm, chassis_number: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Godina', 'Year')}</label><input type="number" value={editForm.year} onChange={e => setEditForm({...editForm, year: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Kilometraža', 'Mileage')}</label><input type="number" value={editForm.mileage} onChange={e => setEditForm({...editForm, mileage: e.target.value})} className="input-field w-full" /></div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Gorivo', 'Fuel')}</label>
                  <select value={editForm.fuel_type} onChange={e => setEditForm({...editForm, fuel_type: e.target.value})} className="input-field w-full">
                    <option value="benzin">Benzin</option>
                    <option value="dizel">Dizel</option>
                    <option value="plin">Plin</option>
                    <option value="hibrid">Hibrid</option>
                    <option value="električni">Električni</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Boja', 'Color')}</label><input type="text" value={editForm.color} onChange={e => setEditForm({...editForm, color: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Registracija do', 'Reg until')}</label><input type="date" value={editForm.registration_date} onChange={e => setEditForm({...editForm, registration_date: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Žuti karton do', 'Yellow card')}</label><input type="date" value={editForm.yellow_card_date} onChange={e => setEditForm({...editForm, yellow_card_date: e.target.value})} className="input-field w-full" /></div>
                <div><label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('PP aparat do', 'PP apparatus')}</label><input type="date" value={editForm.pp_apparatus_date} onChange={e => setEditForm({...editForm, pp_apparatus_date: e.target.value})} className="input-field w-full" /></div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Zadužio', 'Assigned To')}</label>
                  <select value={editForm.assigned_to} onChange={e => setEditForm({...editForm, assigned_to: e.target.value})} className="input-field w-full">
                    <option value="">{t('Nitko', 'Nobody')}</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
              </div>

              {/* IMAGE UPLOAD */}
              <div>
                <label className="block text-sm font-medium mb-2 dark:text-gray-300">{t('Slika vozila', 'Vehicle Image')}</label>
                {editImagePreview && (
                  <div className="relative w-full h-48 mb-3 rounded-xl overflow-hidden border dark:border-gray-600">
                    <img src={editImagePreview} alt="Preview" className="w-full h-full object-cover" />
                    <button type="button" onClick={handleEditRemoveImage} className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700"><X size={16} /></button>
                  </div>
                )}
                {!editImagePreview && (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <Upload size={24} className="text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">{t('Klikni za upload', 'Click to upload')}</p>
                    <p className="text-xs text-gray-400">JPG, PNG, GIF, WebP (max 5MB)</p>
                    <input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" onChange={handleEditImageSelect} className="hidden" />
                  </label>
                )}
                {editImagePreview && (
                  <label className="flex items-center gap-2 text-sm text-primary-600 cursor-pointer mt-2">
                    <Upload size={16} /> {t('Zamijeni sliku', 'Replace image')}
                    <input type="file" accept=".jpg,.jpeg,.png,.gif,.webp" onChange={handleEditImageSelect} className="hidden" />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Napomene', 'Notes')}</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes: e.target.value})} rows={3} className="input-field w-full" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex items-center gap-2" disabled={editUploading}>
                  {editUploading && <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
                  {t('Spremi', 'Save')}
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
