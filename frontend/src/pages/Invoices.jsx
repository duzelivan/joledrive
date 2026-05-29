import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Search, Check, Trash2, Receipt, Eye, Download, Printer, X, ChevronDown, ChevronUp, FileText, TrendingUp, TrendingDown, Edit, Share2, RefreshCw, Play, Pause, Layers, SkipForward } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

const UPLOAD_URL = 'https://www.joledrive.com/upload.php'

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedInvoice, setExpandedInvoice] = useState(null)
  const [recurringList, setRecurringList] = useState([])
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [viewMode, setViewMode] = useState('invoices') // 'invoices' | 'recurring'
  const { user } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [formData, setFormData] = useState({
    invoice_number: '', description: '', amount: '', vehicle_id: '', due_date: '',
    recurring_type: 'none', recurring_interval: 1, file: null,
    invoice_type: 'income'
  })

  const [paymentData, setPaymentData] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'transfer',
    notes: ''
  })

  useEffect(() => { fetchInvoices(); fetchVehicles() }, [search, statusFilter, typeFilter])
  useEffect(() => { if (viewMode === 'recurring') fetchRecurring() }, [viewMode])

  const fetchInvoices = async () => {
    try { 
      const res = await axios.get('/api/invoices', { 
        params: { search, status: statusFilter, invoice_type: typeFilter } 
      })
      setInvoices(res.data)
    } catch (err) { toast.error(t('\u274c Gre\u0161ka pri u\u010ditavanju ra\u010duna', '\u274c Error loading invoices')) }
  }

  const fetchVehicles = async () => {
    try { setVehicles((await axios.get('/api/vehicles')).data) } 
    catch (err) { console.error(err) }
  }

  // ===== RECURRING =====
  const fetchRecurring = async () => {
    try { setRecurringList((await axios.get('/api/invoices/recurring/list')).data) }
    catch (err) { console.error(err) }
  }

  const toggleGroup = (parentId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(parentId)) next.delete(parentId)
      else next.add(parentId)
      return next
    })
  }

  const handleStopAll = async (parentId) => {
    if (!confirm(t('Zaustaviti sve ponavljajuće račune za ovu grupu?', 'Stop all recurring invoices in this group?'))) return
    try {
      await axios.put(`/api/invoices/recurring/${parentId}/stop-all`)
      toast.success(t('Sve zaustavljeno', 'All stopped'))
      fetchRecurring()
    } catch { toast.error(t('Greška', 'Error')) }
  }

  const handleStartAll = async (parentId) => {
    try {
      await axios.put(`/api/invoices/recurring/${parentId}/start-all`)
      toast.success(t('Sve pokrenuto', 'All started'))
      fetchRecurring()
    } catch { toast.error(t('Greška', 'Error')) }
  }

  const handleSkipNext = async (parentId) => {
    if (!confirm(t('Preskočiti sljedeći račun u nizu?', 'Skip the next invoice in sequence?'))) return
    try {
      await axios.delete(`/api/invoices/recurring/${parentId}/skip-next`)
      toast.success(t('Sljedeći preskočen', 'Next skipped'))
      fetchRecurring()
    } catch { toast.error(t('Greška', 'Error')) }
  }

  const handleDeleteGroup = async (parentId) => {
    if (!confirm(t('Obrisati cijelu grupu ponavljajućih računa?', 'Delete entire recurring group?'))) return
    try {
      await axios.delete(`/api/invoices/recurring/group/${parentId}`)
      toast.success(t('Grupa obrisana', 'Group deleted'))
      fetchRecurring()
    } catch { toast.error(t('Greška', 'Error')) }
  }

  const openInvoiceView = async (invoiceId) => {
    try {
      const res = await axios.get(`/api/invoices/${invoiceId}`)
      setSelectedInvoice(res.data)
      setShowViewModal(true)
    } catch {
      toast.error(t('Greška pri učitavanju računa', 'Error loading invoice'))
    }
  }

  const resetForm = () => {
    setFormData({ 
      invoice_number: '', description: '', amount: '', vehicle_id: '', due_date: '',
      recurring_type: 'none', recurring_interval: 1, file: null,
      invoice_type: 'income'
    })
    setEditingInvoice(null)
  }

  const openCreateModal = () => { resetForm(); setShowModal(true) }

  const openEditModal = async (invoice) => {
    setEditingInvoice(invoice)
    setFormData({
      invoice_number: invoice.invoice_number || '',
      description: invoice.description || '',
      amount: invoice.amount || '',
      vehicle_id: invoice.vehicle_id || '',
      due_date: invoice.due_date ? invoice.due_date.split('T')[0] : '',
      recurring_type: invoice.recurring_type || 'none',
      recurring_interval: invoice.recurring_interval || 1,
      file: null,
      invoice_type: invoice.invoice_type || 'income'
    })
    setShowModal(true)
  }

  // ===== SHARE =====
  const handleShare = async (invoice) => {
    try {
      const res = await axios.post('/api/share/create', { type: 'invoice', id: invoice.id })
      setShareUrl(res.data.shareUrl)
      setShowShareModal(true)
    } catch (err) {
      toast.error(t('\u274c Gre\u0161ka pri stvaranju linka', '\u274c Error creating share link'))
    }
  }

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(t('\u2705 Link kopiran!', '\u2705 Link copied!'))
    } catch {
      const el = document.createElement('input')
      el.value = shareUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      toast.success(t('\u2705 Link kopiran!', '\u2705 Link copied!'))
    }
  }
  // ===== END SHARE =====

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    const isEditing = !!editingInvoice
    const actionToast = toast.loading(
      isEditing
        ? t('\u23f3 A\u017euriranje ra\u010duna...', '\u23f3 Updating invoice...')
        : formData.invoice_type === 'expense'
          ? t('\u23f3 Spremanje tro\u0161ka...', '\u23f3 Saving expense...')
          : t('\u23f3 Spremanje ra\u010duna...', '\u23f3 Saving invoice...')
    )

    try {
      let filePath = null, fileSize = null, fileType = null

      if (formData.file) {
        const uploadData = new FormData()
        uploadData.append('file', formData.file)
        const selectedVehicle = vehicles.find(v => v.id == formData.vehicle_id)
        uploadData.append('license_plate', selectedVehicle?.license_plate || 'BEZ_VOZILA')
        uploadData.append('document_type', formData.invoice_type === 'expense' ? 'trosak' : 'prihod')
        uploadData.append('document_title', formData.invoice_number || 'racun')

        const uploadRes = await fetch(UPLOAD_URL, { method: 'POST', body: uploadData })
        const uploadResData = await uploadRes.json()
        if (!uploadResData.success) throw new Error(uploadResData.error || 'Upload failed')
        filePath = uploadResData.file_path
        fileSize = uploadResData.file_size
        fileType = uploadResData.file_type
      }

      const payload = {
        invoice_number: formData.invoice_number,
        description: formData.description,
        amount: formData.amount,
        vehicle_id: formData.vehicle_id || null,
        due_date: formData.due_date,
        recurring_type: formData.recurring_type,
        recurring_interval: formData.recurring_interval,
        invoice_type: formData.invoice_type
      }
      if (filePath) {
        payload.file_path = filePath
        payload.file_size = fileSize
        payload.file_type = fileType
      }

      if (isEditing) {
        await axios.put(`/api/invoices/${editingInvoice.id}`, payload)
        toast.success(t('\u2705 Ra\u010dun a\u017euriran', '\u2705 Invoice updated'), { id: actionToast })
      } else {
        await axios.post('/api/invoices', payload)
        toast.success(
          formData.invoice_type === 'expense'
            ? t('\u2705 Tro\u0161ak uspje\u0161no dodan!', '\u2705 Expense added!')
            : t('\u2705 Ra\u010dun uspje\u0161no dodan!', '\u2705 Invoice added!'),
          { id: actionToast }
        )
      }

      setShowModal(false)
      resetForm()
      fetchInvoices()
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('\u274c Gre\u0161ka', '\u274c Error'), { id: actionToast })
    } finally { setLoading(false) }
  }

  const openViewModal = async (invoice) => {
    try {
      const res = await axios.get(`/api/invoices/${invoice.id}`)
      setSelectedInvoice(res.data)
      setShowViewModal(true)
    } catch (err) {
      toast.error(t('\u274c Gre\u0161ka', '\u274c Error'))
    }
  }

  const openPaymentModal = (invoice) => {
    setSelectedInvoice(invoice)
    setPaymentData({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'transfer', notes: '' })
    setShowPaymentModal(true)
  }

  const handlePayment = async (e) => {
    e.preventDefault()
    if (!selectedInvoice) return
    setLoading(true)
    const paymentToast = toast.loading(t('\u23f3 Zapisujem uplatu...', '\u23f3 Recording payment...'))
    try {
      await axios.post(`/api/invoices/${selectedInvoice.id}/payments`, {
        amount: parseFloat(paymentData.amount),
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        notes: paymentData.notes
      })
      toast.success(
        selectedInvoice.invoice_type === 'expense' ? t('\u2705 Tro\u0161ak pla\u0107en!', '\u2705 Expense paid!') : t('\u2705 Uplata zabilje\u017eena!', '\u2705 Payment recorded!'),
        { id: paymentToast }
      )
      setShowPaymentModal(false)
      setPaymentData({ amount: '', payment_date: new Date().toISOString().split('T')[0], payment_method: 'transfer', notes: '' })
      fetchInvoices()
    } catch (err) {
      toast.error(err.response?.data?.error || t('\u274c Gre\u0161ka', '\u274c Error'), { id: paymentToast })
    } finally { setLoading(false) }
  }

  const deleteFileFromServer = async (filePath) => {
    if (!filePath) return
    try {
      await fetch('https://www.joledrive.com/delete-file.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Secret': 'jd_2024_xK9mPvL2nQ8wR5tY7uI3oP4aS6dF1gH'
        },
        body: JSON.stringify({ file_path: filePath })
      })
    } catch (err) { console.error('File delete error:', err) }
  }

  const handleDelete = async (id) => {
    if (!confirm(t('Jeste li sigurni?', 'Are you sure?'))) return
    const deleteToast = toast.loading(t('\u23f3 Brisanje...', '\u23f3 Deleting...'))
    try {
      // Pronađi račun da dobiješ file_path
      const inv = invoices.find(i => i.id === id)
      if (inv?.file_path) await deleteFileFromServer(inv.file_path)
      // Obriši iz baze
      await axios.delete(`/api/invoices/${id}`)
      toast.success(t('\u2705 Ra\u010dun obrisan', '\u2705 Deleted'), { id: deleteToast })
      fetchInvoices()
    } catch (err) {
      toast.error(t('\u274c Gre\u0161ka', '\u274c Error'), { id: deleteToast })
    }
  }

  const handlePrint = () => { window.print() }

  const formatFileSize = (bytes) => {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString(language === 'hr' ? 'hr-HR' : 'en-US')
  }

  const formatAmount = (amount) => {
    if (amount === null || amount === undefined || isNaN(parseFloat(amount))) return '0,00 \u20ac'
    return parseFloat(amount).toLocaleString('hr-HR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' \u20ac'
  }

  const getRemainingAmount = (invoice) => {
    if (!invoice) return 0
    const total = parseFloat(invoice.amount || 0)
    const paid = parseFloat(invoice.paid_amount || 0)
    const remaining = invoice.remaining_amount !== undefined && invoice.remaining_amount !== null 
      ? parseFloat(invoice.remaining_amount) 
      : total - paid
    return Math.max(0, remaining)
  }

  const canCreate = user?.role === 'admin' || user?.permissions?.['invoices.create']
  const canEdit = user?.role === 'admin' || user?.permissions?.['invoices.edit']
  const canDelete = user?.role === 'admin' || user?.permissions?.['invoices.delete']
  const canShare = user?.role === 'admin' || user?.permissions?.['invoices.share']

  const toggleExpand = (id) => { setExpandedInvoice(expandedInvoice === id ? null : id) }

  const getStatusColor = (status) => {
    switch (status) { case 'paid': return 'bg-green-100 text-green-700'; case 'partial': return 'bg-yellow-100 text-yellow-700'; default: return 'bg-red-100 text-red-700' }
  }
  const getStatusLabel = (status) => {
    switch (status) { case 'paid': return t('Pla\u0107en', 'Paid'); case 'partial': return t('Djelomi\u010dno', 'Partial'); default: return t('Nepla\u0107en', 'Unpaid') }
  }
  const getTypeColor = (type) => type === 'expense' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  const getTypeLabel = (type) => type === 'expense' ? t('Tro\u0161ak', 'Expense') : t('Prihod', 'Income')
  const getTypeIcon = (type) => type === 'expense' ? <TrendingDown size={14} /> : <TrendingUp size={14} />

  const MobileInvoiceCard = ({ invoice }) => {
    const isExpanded = expandedInvoice === invoice.id
    const isPaid = invoice.status === 'paid'
    const isPartial = invoice.status === 'partial'
    const paid = parseFloat(invoice.paid_amount || 0)
    const total = parseFloat(invoice.amount || 0)
    const remaining = getRemainingAmount(invoice)
    const isExpense = invoice.invoice_type === 'expense'

    return (
      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-3 border-l-4 ${
        isPaid ? 'border-l-green-500' : isPartial ? 'border-l-yellow-500' : 'border-l-red-500'
      }`}>
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(invoice.id)}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                {getStatusLabel(invoice.status)}
              </span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${getTypeColor(invoice.invoice_type)}`}>
                {getTypeIcon(invoice.invoice_type)}
                {getTypeLabel(invoice.invoice_type)}
              </span>
              <span className="text-xs text-gray-500">{formatDate(invoice.due_date)}</span>
            </div>
            <p className="font-medium text-gray-900 dark:text-white truncate">{invoice.invoice_number}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{invoice.description}</p>
            {isPartial && (
              <div className="mt-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-green-600 font-medium">{formatAmount(paid)}</span>
                  <span className="text-red-500">{formatAmount(remaining)}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${(paid / total) * 100}%` }}></div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <p className={`font-bold text-lg ${isExpense ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
              {isExpense ? '-' : ''}{formatAmount(invoice.amount)}
            </p>
            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-3">
            {invoice.manufacturer && (
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">{t('Vozilo', 'Vehicle')}</span>
                <p className="text-sm text-gray-900 dark:text-white">
                  {invoice.license_plate || invoice.vehicle_id} \u2014 {invoice.manufacturer} {invoice.model}
                </p>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('Ukupno', 'Total')}:</span>
                <span className={`font-semibold ${isExpense ? 'text-red-600' : ''}`}>
                  {isExpense ? '-' : ''}{formatAmount(total)}
                </span>
              </div>
              {(isPaid || isPartial) && (
                <div className="flex justify-between mb-1">
                  <span className="text-sm text-green-600">{t('Pla\u0107eno', 'Paid')}:</span>
                  <span className="font-semibold text-green-600">{formatAmount(paid)}</span>
                </div>
              )}
              {(isPartial || (!isPaid && !isPartial)) && (
                <div className="flex justify-between">
                  <span className="text-sm text-red-500">{t('Preostalo', 'Remaining')}:</span>
                  <span className="font-semibold text-red-500">{formatAmount(isPartial ? remaining : total)}</span>
                </div>
              )}
            </div>
            {invoice.file_path && (
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wide">{t('Dokument', 'Document')}</span>
                <div className="flex gap-2 mt-1">
                  <a href={`https://joledrive.com${invoice.file_path}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-sm text-blue-600">
                    <Eye size={16} /> {t('Pregled', 'View')}
                  </a>
                  <a href={`https://joledrive.com${invoice.file_path}`} download className="flex items-center gap-1 text-sm text-green-600">
                    <Download size={16} /> {t('Preuzmi', 'Download')}
                  </a>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              <button onClick={(e) => { e.stopPropagation(); openViewModal(invoice) }} className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg text-sm font-medium min-w-[80px]">
                <Receipt size={16} /> {t('Detalji', 'Details')}
              </button>
              {canEdit && (
                <button onClick={(e) => { e.stopPropagation(); openEditModal(invoice) }} className="flex-1 flex items-center justify-center gap-1 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 rounded-lg text-sm font-medium min-w-[80px]">
                  <Edit size={16} /> {t('Uredi', 'Edit')}
                </button>
              )}
              {canShare && (
                <button onClick={(e) => { e.stopPropagation(); handleShare(invoice) }} className="flex-1 flex items-center justify-center gap-1 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-lg text-sm font-medium min-w-[80px]">
                  <Share2 size={16} /> {t('Dijeli', 'Share')}
                </button>
              )}
              {!isPaid && canEdit && (
                <button onClick={(e) => { e.stopPropagation(); openPaymentModal(invoice) }} className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-lg text-sm font-medium min-w-[80px]">
                  <Check size={16} /> {t('Plati', 'Pay')}
                </button>
              )}
              {canDelete && (
                <button onClick={(e) => { e.stopPropagation(); handleDelete(invoice.id) }} className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg text-sm font-medium min-w-[80px]">
                  <Trash2 size={16} /> {t('Obri\u0161i', 'Delete')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('Ra\u010duni', 'Invoices')}</h1>
        {canCreate && (
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2 px-4 py-2">
            <Plus size={20} /> 
            <span className="hidden sm:inline">{t('Novi ra\u010dun', 'New Invoice')}</span>
            <span className="sm:hidden">{t('Novi', 'New')}</span>
          </button>
        )}
      </div>

      {/* VIEW MODE TABS */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setViewMode('invoices')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            viewMode === 'invoices'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          <Receipt size={16} />
          {t('Računi', 'Invoices')}
        </button>
        <button
          onClick={() => setViewMode('recurring')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            viewMode === 'recurring'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          <RefreshCw size={16} />
          {t('Ponavljajući', 'Recurring')}
          {recurringList.length > 0 && (
            <span className={`px-2 py-0.5 rounded-full text-xs ${viewMode === 'recurring' ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-600'}`}>
              {recurringList.length}
            </span>
          )}
        </button>
      </div>

      {viewMode === 'invoices' && (
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder={t('Pretra\u017ei...', 'Search...')} value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10 w-full" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input-field w-full sm:w-auto">
          <option value="">{t('Svi statusi', 'All Statuses')}</option>
          <option value="unpaid">{t('Nepla\u0107eni', 'Unpaid')}</option>
          <option value="partial">{t('Djelomi\u010dno', 'Partial')}</option>
          <option value="paid">{t('Pla\u0107eni', 'Paid')}</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input-field w-full sm:w-auto">
          <option value="">{t('Svi tipovi', 'All Types')}</option>
          <option value="income">{t('Prihodi', 'Income')}</option>
          <option value="expense">{t('Tro\u0161kovi', 'Expenses')}</option>
        </select>
      </div>
      )}

      {viewMode === 'invoices' && (<>
      {/* DESKTOP TABLE */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="table-header text-left px-4 py-3">{t('Broj', 'Number')}</th>
                <th className="table-header text-left px-4 py-3">{t('Tip', 'Type')}</th>
                <th className="table-header text-left px-4 py-3">{t('Opis', 'Description')}</th>
                <th className="table-header text-left px-4 py-3">{t('Vozilo', 'Vehicle')}</th>
                <th className="table-header text-left px-4 py-3">{t('Iznos', 'Amount')}</th>
                <th className="table-header text-left px-4 py-3">{t('Status', 'Status')}</th>
                <th className="table-header text-left px-4 py-3">{t('Dospije\u0107e', 'Due')}</th>
                <th className="table-header text-center px-4 py-3">{t('Akcije', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {invoices.map(invoice => {
                const isPaid = invoice.status === 'paid'
                const isPartial = invoice.status === 'partial'
                const isExpense = invoice.invoice_type === 'expense'
                return (
                  <tr key={invoice.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                    isPartial ? 'bg-yellow-50/30 dark:bg-yellow-900/10' : !isPaid ? 'bg-red-50/30 dark:bg-red-900/10' : ''
                  }`}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{invoice.invoice_number}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${getTypeColor(invoice.invoice_type)}`}>
                        {getTypeIcon(invoice.invoice_type)}
                        {getTypeLabel(invoice.invoice_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="max-w-[150px] truncate text-gray-900 dark:text-white" title={invoice.description}>{invoice.description}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {invoice.manufacturer ? <span className="text-sm"><span className="font-medium">{invoice.license_plate || invoice.vehicle_id}</span><br /><span className="text-gray-500">{invoice.manufacturer} {invoice.model}</span></span> : '-'}
                    </td>
                    <td className={`px-4 py-3 font-semibold ${isExpense ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                      {isExpense ? '-' : ''}{formatAmount(parseFloat(invoice.amount || 0))}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{formatDate(invoice.due_date)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button onClick={() => openViewModal(invoice)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title={t('Pregled', 'View')}><Eye size={16} /></button>
                        {canEdit && <button onClick={() => openEditModal(invoice)} className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title={t('Uredi', 'Edit')}><Edit size={16} /></button>}
                        {canShare && <button onClick={() => handleShare(invoice)} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg" title={t('Dijeli', 'Share')}><Share2 size={16} /></button>}
                        {!isPaid && canEdit && <button onClick={() => openPaymentModal(invoice)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title={t('Plati', 'Pay')}><Check size={16} /></button>}
                        {canDelete && <button onClick={() => handleDelete(invoice.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title={t('Obri\u0161i', 'Delete')}><Trash2 size={16} /></button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE CARDS */}
      <div className="md:hidden">
        {invoices.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('Nema ra\u010duna', 'No invoices')}</div>
        ) : (
          invoices.map(invoice => <MobileInvoiceCard key={invoice.id} invoice={invoice} />)
        )}
      </div>
      </>)}

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 my-8">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editingInvoice ? t('Uredi ra\u010dun', 'Edit Invoice') : t('Novi ra\u010dun', 'New Invoice')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingInvoice && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Tip ra\u010duna', 'Invoice Type')} *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${formData.invoice_type === 'income' ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="radio" name="invoice_type" value="income" checked={formData.invoice_type === 'income'} onChange={e => setFormData({...formData, invoice_type: e.target.value})} className="hidden" />
                      <TrendingUp size={20} className={formData.invoice_type === 'income' ? 'text-green-600' : 'text-gray-400'} />
                      <div><p className="font-medium dark:text-white">{t('Prihod', 'Income')}</p><p className="text-xs text-gray-500">{t('Pove\u0107ava profit', 'Increases profit')}</p></div>
                    </label>
                    <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${formData.invoice_type === 'expense' ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
                      <input type="radio" name="invoice_type" value="expense" checked={formData.invoice_type === 'expense'} onChange={e => setFormData({...formData, invoice_type: e.target.value})} className="hidden" />
                      <TrendingDown size={20} className={formData.invoice_type === 'expense' ? 'text-red-600' : 'text-gray-400'} />
                      <div><p className="font-medium dark:text-white">{t('Tro\u0161ak', 'Expense')}</p><p className="text-xs text-gray-500">{t('Pove\u0107ava tro\u0161kove', 'Increases expenses')}</p></div>
                    </label>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Broj ra\u010duna', 'Invoice Number')} *</label>
                <input type="text" required value={formData.invoice_number} onChange={e => setFormData({...formData, invoice_number: e.target.value})} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Opis', 'Description')}</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field w-full" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Iznos (\u20ac)', 'Amount (\u20ac)')} *</label>
                <input type="number" step="0.01" required value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Vozilo', 'Vehicle')}</label>
                <select value={formData.vehicle_id} onChange={e => setFormData({...formData, vehicle_id: e.target.value})} className="input-field w-full">
                  <option value="">{t('Odaberi vozilo...', 'Select vehicle...')}</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.license_plate || '---'} - {v.manufacturer} {v.model} ({v.year || '-'})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Dospije\u0107e', 'Due Date')}</label>
                <input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} className="input-field w-full" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Ponavljanje', 'Recurring')}</label>
                  <select value={formData.recurring_type} onChange={e => setFormData({...formData, recurring_type: e.target.value})} className="input-field w-full">
                    <option value="none">{t('Bez', 'None')}</option>
                    <option value="daily">{t('Dnevno', 'Daily')}</option>
                    <option value="weekly">{t('Tjedno', 'Weekly')}</option>
                    <option value="monthly">{t('Mjese\u010dno', 'Monthly')}</option>
                    <option value="yearly">{t('Godi\u0161nje', 'Yearly')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Interval', 'Interval')}</label>
                  <input type="number" min="1" value={formData.recurring_interval} onChange={e => setFormData({...formData, recurring_interval: e.target.value})} className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  {editingInvoice ? t('Nova datoteka (opcionalno)', 'New file (optional)') : t('Prilo\u017eeni dokument', 'Attached Document')}
                </label>
                <input type="file" onChange={e => { if (e.target.files?.[0]) setFormData({...formData, file: e.target.files[0]}) }} className="input-field w-full" />
                <p className="text-xs text-gray-500 mt-1">
                  {editingInvoice ? t('Ostavite prazno da zadr\u017eite postoje\u0107u datoteku', 'Leave empty to keep existing file') : t('Opcionalno. PDF, DOC, JPG, PNG (max 10MB)', 'Optional. PDF, DOC, JPG, PNG (max 10MB)')}
                </p>
              </div>
              {formData.file && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400"><FileText size={16} className="inline mr-2" />{formData.file.name} ({formatFileSize(formData.file.size || 0)})</p>
                </div>
              )}
              <div className="flex gap-3 pt-4 pb-2">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? t('Spremanje...', 'Saving...') : editingInvoice ? t('Spremi izmjene', 'Save Changes') : t('Spremi', 'Save')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1" disabled={loading}>
                  {t('Odustani', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {showPaymentModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {parseFloat(paymentData.amount) >= getRemainingAmount(selectedInvoice) ? t('Pla\u0107anje u cjelosti', 'Full Payment') : t('Djelomi\u010dno pla\u0107anje', 'Partial Payment')}
            </h2>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('Ra\u010dun', 'Invoice')}:</span>
                <span className="font-medium">{selectedInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('Tip', 'Type')}:</span>
                <span className={`font-medium ${selectedInvoice.invoice_type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>{getTypeLabel(selectedInvoice.invoice_type)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('Ukupno', 'Total')}:</span>
                <span className="font-bold">{formatAmount(selectedInvoice.amount)}</span>
              </div>
              {selectedInvoice.paid_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-green-600">{t('Ve\u0107 pla\u0107eno', 'Already paid')}:</span>
                  <span className="font-medium text-green-600">{formatAmount(selectedInvoice.paid_amount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">{t('Preostalo', 'Remaining')}:</span>
                <span className="font-bold text-red-500">{formatAmount(getRemainingAmount(selectedInvoice))}</span>
              </div>
            </div>
            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Iznos uplate (\u20ac)', 'Payment Amount (\u20ac)')} *</label>
                <input type="number" step="0.01" required max={getRemainingAmount(selectedInvoice)} value={paymentData.amount} onChange={e => setPaymentData({...paymentData, amount: e.target.value})} className="input-field w-full" />
                <p className="text-xs text-gray-500 mt-1">{t('Maksimalno', 'Maximum')}: {formatAmount(getRemainingAmount(selectedInvoice))}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Datum uplate', 'Payment Date')} *</label>
                <input type="date" required value={paymentData.payment_date} onChange={e => setPaymentData({...paymentData, payment_date: e.target.value})} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Na\u010din pla\u0107anja', 'Payment Method')}</label>
                <select value={paymentData.payment_method} onChange={e => setPaymentData({...paymentData, payment_method: e.target.value})} className="input-field w-full">
                  <option value="transfer">{t('Virman', 'Bank Transfer')}</option>
                  <option value="cash">{t('Gotovina', 'Cash')}</option>
                  <option value="card">{t('Kartica', 'Card')}</option>
                  <option value="check">{t('\u010cek', 'Check')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Napomena', 'Notes')}</label>
                <textarea value={paymentData.notes} onChange={e => setPaymentData({...paymentData, notes: e.target.value})} className="input-field w-full" rows={2} placeholder={t('Opcionalno', 'Optional')} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? t('Spremanje...', 'Saving...') : t('Zabilje\u017ei uplatu', 'Record Payment')}
                </button>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary flex-1" disabled={loading}>
                  {t('Odustani', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW MODAL */}
      {showViewModal && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 z-[60] overflow-y-auto print:p-0 print:bg-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="min-h-screen flex items-start md:items-center justify-center p-0 md:p-4 pt-20 md:pt-4 pb-8">
            <div className="bg-white dark:bg-gray-800 rounded-t-2xl md:rounded-xl shadow-2xl w-full max-w-2xl p-6 md:p-8 print:shadow-none print:max-w-full print:w-full print:p-4 mt-4 md:mt-0" id="invoice-print">
            <div className="flex items-center justify-between mb-6 print:hidden">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{t('Pregled ra\u010duna', 'Invoice Preview')}</h2>
              <div className="flex gap-2">
                <button onClick={handlePrint} className="btn-primary flex items-center gap-2 text-sm"><Printer size={18} /> {t('Printaj', 'Print')}</button>
                <button onClick={() => setShowViewModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"><X size={20} className="text-gray-500" /></button>
              </div>
            </div>
            <div className="hidden print:block mb-8">
              <h1 className="text-3xl font-bold text-center">JoleDrive d.o.o</h1>
              <p className="text-center text-gray-600">Evidencija vozila</p>
              <hr className="my-4" />
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('Broj ra\u010duna', 'Invoice Number')}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{selectedInvoice.invoice_number}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm text-gray-500">{t('Status', 'Status')}</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(selectedInvoice.status)}`}>
                    {getStatusLabel(selectedInvoice.status)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('Tip ra\u010duna', 'Invoice Type')}</p>
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium ${getTypeColor(selectedInvoice.invoice_type)}`}>
                    {getTypeIcon(selectedInvoice.invoice_type)}
                    {getTypeLabel(selectedInvoice.invoice_type)}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <div className="text-center">
                  <p className="text-sm text-gray-500">{t('Ukupno', 'Total')}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{formatAmount(selectedInvoice.amount)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-green-600">{t('Pla\u0107eno', 'Paid')}</p>
                  <p className="text-xl font-bold text-green-600">{formatAmount(selectedInvoice.paid_amount || 0)}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-red-500">{t('Preostalo', 'Remaining')}</p>
                  <p className="text-xl font-bold text-red-500">{formatAmount(getRemainingAmount(selectedInvoice))}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('Datum kreiranja', 'Created')}</p>
                  <p className="text-gray-900 dark:text-white">{formatDate(selectedInvoice.created_at)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('Dospije\u0107e', 'Due Date')}</p>
                  <p className="text-gray-900 dark:text-white">{formatDate(selectedInvoice.due_date)}</p>
                </div>
              </div>
              <hr className="dark:border-gray-700" />
              <div>
                <p className="text-sm text-gray-500 mb-1">{t('Opis', 'Description')}</p>
                <p className="text-gray-900 dark:text-white whitespace-pre-wrap">{selectedInvoice.description || '-'}</p>
              </div>
              <hr className="dark:border-gray-700" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">{t('Vozilo', 'Vehicle')}</p>
                  <p className="text-gray-900 dark:text-white">{selectedInvoice.manufacturer ? `${selectedInvoice.license_plate || selectedInvoice.vehicle_id} \u2014 ${selectedInvoice.manufacturer} ${selectedInvoice.model}` : '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">{t('Ponavljanje', 'Recurring')}</p>
                  <p className="text-gray-900 dark:text-white">{selectedInvoice.recurring_type !== 'none' ? `${selectedInvoice.recurring_type} (${selectedInvoice.recurring_interval})` : t('Bez', 'None')}</p>
                </div>
              </div>
              <hr className="dark:border-gray-700" />
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{t('UKUPNO ZA PLATITI', 'TOTAL TO PAY')}</p>
                <p className="text-2xl md:text-3xl font-bold text-red-500">{formatAmount(getRemainingAmount(selectedInvoice))}</p>
              </div>
              {selectedInvoice.file_path && (
                <div className="mt-4">
                  <p className="text-sm text-gray-500 mb-2">{t('Prilo\u017eeni dokument', 'Attached Document')}</p>
                  <a href={`https://joledrive.com${selectedInvoice.file_path}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
                    <FileText size={18} /> {t('Pregledaj dokument', 'View Document')}
                  </a>
                </div>
              )}
            </div>
            <div className="hidden print:block mt-8 pt-4 border-t">
              <p className="text-center text-sm text-gray-500">JoleDrive d.o.o - Evidencija vozila</p>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ===== RECURRING VIEW (v2 - grupirani) ===== */}
      {viewMode === 'recurring' && (
        <div className="space-y-4">
          {recurringList.length === 0 && (
            <div className="text-center py-12 text-gray-500 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <RefreshCw size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">{t('Nema ponavljajućih računa', 'No recurring invoices')}</p>
            </div>
          )}

          {recurringList.map(group => {
            const isExpanded = expandedGroups.has(group.id)
            const isActive = group.active === 1
            const pendingCount = group.pending_count || 0
            const generatedCount = group.generated_count || 0
            const totalCount = group.total_occurrences || 0
            const schedule = group.schedule || []
            const generatedInvoices = group.generated_invoices || []

            return (
              <div key={group.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* GROUP HEADER */}
                <div
                  className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                  onClick={() => toggleGroup(group.id)}
                >
                  <button className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                    {isExpanded ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-white">{group.invoice_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${group.invoice_type === 'expense' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                        {getTypeLabel(group.invoice_type)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {isActive ? t('Aktivno', 'Active') : t('Zaustavljeno', 'Stopped')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                      <span className="capitalize">{t(group.recurring_type, group.recurring_type)} {group.recurring_interval !== 1 && `(${group.recurring_interval}x)`}</span>
                      <span>·</span>
                      <span>{formatDate(group.next_date)}</span>
                      {group.manufacturer && (
                        <><span>·</span><span>{group.manufacturer} {group.model}</span></>
                      )}
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Layers size={13} />
                        {generatedCount}/{totalCount} {t('generirano', 'generated')}
                        {pendingCount > 0 && <span className="text-blue-500">({pendingCount} {t('preostalo', 'remaining')})</span>}
                      </span>
                    </div>
                  </div>

                  {/* Quick actions on header */}
                  <div className="hidden sm:flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    {isActive ? (
                      <button onClick={() => handleStopAll(group.id)} className="p-2 text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-lg" title={t('Zaustavi sve', 'Stop all')}>
                        <Pause size={16} />
                      </button>
                    ) : (
                      <button onClick={() => handleStartAll(group.id)} className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg" title={t('Pokreni sve', 'Start all')}>
                        <Play size={16} />
                      </button>
                    )}
                    {isActive && pendingCount > 0 && (
                      <button onClick={() => handleSkipNext(group.id)} className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title={t('Preskoči sljedeći', 'Skip next')}>
                        <SkipForward size={16} />
                      </button>
                    )}
                    <button onClick={() => handleDeleteGroup(group.id)} className="p-2 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title={t('Obriši grupu', 'Delete group')}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {/* EXPANDED DETAILS */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                    {/* Schedule table */}
                    <div className="p-4">
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Layers size={14} />
                        {t('Raspored generiranja', 'Generation schedule')}
                      </h4>

                      {schedule.length === 0 ? (
                        <p className="text-sm text-gray-500">{t('Nema zapisa u rasporedu', 'No schedule records')}</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 dark:text-gray-400">
                                <th className="pb-2 pr-4">#</th>
                                <th className="pb-2 pr-4">{t('Datum', 'Date')}</th>
                                <th className="pb-2 pr-4">{t('Status', 'Status')}</th>
                                <th className="pb-2">{t('Račun', 'Invoice')}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {schedule.map(s => (
                                <tr key={s.id} className={s.status === 'cancelled' ? 'opacity-40' : ''}>
                                  <td className="py-2 pr-4 text-gray-500">{s.sequence_number}</td>
                                  <td className="py-2 pr-4 text-gray-900 dark:text-white">{formatDate(s.due_date || s.next_date)}</td>
                                  <td className="py-2 pr-4">
                                    {s.status === 'pending' && <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700">{t('Na čekanju', 'Pending')}</span>}
                                    {s.status === 'generated' && <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">{t('Generirano', 'Generated')}</span>}
                                    {s.status === 'cancelled' && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{t('Preskočeno', 'Skipped')}</span>}
                                  </td>
                                  <td className="py-2">
                                    {s.generated_invoice_id ? (
                                      <button
                                        onClick={() => { openInvoiceView(s.generated_invoice_id) }}
                                        className="text-blue-600 hover:underline text-xs"
                                      >
                                        {t('Pogledaj račun', 'View invoice')} →
                                      </button>
                                    ) : (
                                      <span className="text-gray-400 text-xs">-</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Generated invoices list */}
                    {generatedInvoices.length > 0 && (
                      <div className="px-4 pb-4">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                          <Receipt size={14} />
                          {t('Generirani računi', 'Generated invoices')}
                          <span className="text-xs font-normal text-gray-500">({generatedInvoices.length})</span>
                        </h4>
                        <div className="space-y-2">
                          {generatedInvoices.map(gi => (
                            <div key={gi.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                              <div>
                                <span className="font-medium text-gray-900 dark:text-white text-sm">{gi.invoice_number}</span>
                                <span className="ml-2 text-gray-500 text-xs">{formatDate(gi.created_at)}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-gray-900 dark:text-white">{parseFloat(gi.amount).toFixed(2)} €</span>
                                <button
                                  onClick={() => { openInvoiceView(gi.id) }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"
                                  title={t('Otvori', 'Open')}
                                >
                                  <Eye size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mobile actions */}
                    <div className="sm:hidden p-4 pt-0 flex gap-2">
                      {isActive ? (
                        <button onClick={() => handleStopAll(group.id)} className="flex-1 py-2 text-sm text-yellow-600 bg-yellow-50 rounded-lg flex items-center justify-center gap-1.5">
                          <Pause size={14} /> {t('Zaustavi sve', 'Stop all')}
                        </button>
                      ) : (
                        <button onClick={() => handleStartAll(group.id)} className="flex-1 py-2 text-sm text-green-600 bg-green-50 rounded-lg flex items-center justify-center gap-1.5">
                          <Play size={14} /> {t('Pokreni sve', 'Start all')}
                        </button>
                      )}
                      {isActive && pendingCount > 0 && (
                        <button onClick={() => handleSkipNext(group.id)} className="flex-1 py-2 text-sm text-blue-600 bg-blue-50 rounded-lg flex items-center justify-center gap-1.5">
                          <SkipForward size={14} /> {t('Preskoči', 'Skip')}
                        </button>
                      )}
                      <button onClick={() => handleDeleteGroup(group.id)} className="flex-1 py-2 text-sm text-red-600 bg-red-50 rounded-lg flex items-center justify-center gap-1.5">
                        <Trash2 size={14} /> {t('Obriši', 'Delete')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* SHARE MODAL */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <Share2 size={20} className="text-purple-600" />
              {t('Dijeli ra\u010dun', 'Share Invoice')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {t('Kopirajte link i po\u0161aljite osobi kojoj \u017eelite dati pristup.', 'Copy the link and send it to the person you want to give access to.')}
            </p>
            <div className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={shareUrl} 
                readOnly 
                className="input-field flex-1 text-sm bg-gray-50 dark:bg-gray-700"
                onClick={(e) => e.target.select()}
              />
            </div>
            <div className="flex gap-3">
              <button onClick={copyShareUrl} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {t('Kopiraj link', 'Copy Link')}
              </button>
              <button onClick={() => setShowShareModal(false)} className="btn-secondary flex-1">
                {t('Zatvori', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
