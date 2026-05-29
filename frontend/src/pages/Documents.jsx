import { useState, useEffect } from 'react'
import axios from 'axios'
import { Plus, Search, Trash2, FileText, Eye, Download, ChevronDown, ChevronUp, Edit, Share2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

const UPLOAD_URL = 'https://www.joledrive.com/upload.php'

export default function Documents() {
  const [documents, setDocuments] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [sortBy, setSortBy] = useState('date')
  const [showModal, setShowModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [editingDocument, setEditingDocument] = useState(null)
  const [shareUrl, setShareUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [expandedDoc, setExpandedDoc] = useState(null)
  const { user } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [formData, setFormData] = useState({ 
    title: '', description: '', document_type: 'other', 
    vehicle_id: '', user_id: '', file: null 
  })

  useEffect(() => { fetchDocuments() }, [search, filterType, sortBy])
  useEffect(() => { fetchVehicles(); fetchUsers() }, [])

  const fetchDocuments = async () => {
    try { 
      const res = await axios.get('/api/documents', { params: { search, type: filterType, sort_by: sortBy } })
      setDocuments(res.data)
    } catch (err) { 
      toast.error(t('\u274c Gre\u0161ka pri u\u010ditavanju dokumenata', '\u274c Error loading documents')) 
    }
  }

  const fetchVehicles = async () => {
    try { setVehicles((await axios.get('/api/vehicles')).data) } 
    catch (err) { console.error(err) }
  }

  const fetchUsers = async () => {
    try { setUsers((await axios.get('/api/users')).data) } 
    catch (err) { console.error(err) }
  }

  const resetForm = () => {
    setFormData({ title: '', description: '', document_type: 'other', vehicle_id: '', user_id: '', file: null })
    setEditingDocument(null)
  }

  const openCreateModal = () => { resetForm(); setShowModal(true) }

  const openEditModal = (doc) => {
    setEditingDocument(doc)
    setFormData({
      title: doc.title || '',
      description: doc.description || '',
      document_type: doc.document_type || 'other',
      vehicle_id: doc.vehicle_id || '',
      user_id: doc.user_id || '',
      file: null
    })
    setShowModal(true)
  }

  // ===== SHARE =====
  const handleShare = async (doc) => {
    try {
      const res = await axios.post('/api/share/create', { type: 'document', id: doc.id })
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
    const isEditing = !!editingDocument
    if (!isEditing && !formData.file) {
      toast.error(t('\u26a0\ufe0f Odaberite datoteku', '\u26a0\ufe0f Select a file'))
      return
    }
    setLoading(true)
    const uploadToast = toast.loading(
      isEditing
        ? t('\u23f3 A\u017euriranje dokumenta...', '\u23f3 Updating document...')
        : t('\u23f3 U\u010ditavanje datoteke...', '\u23f3 Uploading file...')
    )
    try {
      let filePath = editingDocument?.file_path || null
      let fileSize = editingDocument?.file_size || null
      let fileType = editingDocument?.file_type || null

      if (formData.file) {
        const uploadData = new FormData()
        uploadData.append('file', formData.file)
        const selectedVehicle = vehicles.find(v => v.id == formData.vehicle_id)
        const selectedUser = users.find(u => u.id == formData.user_id)
        if (selectedVehicle?.license_plate) uploadData.append('license_plate', selectedVehicle.license_plate)
        if (selectedUser?.name) uploadData.append('user_name', selectedUser.name)
        if (formData.document_type) uploadData.append('document_type', formData.document_type)
        if (formData.title) uploadData.append('document_title', formData.title)

        const uploadRes = await fetch(UPLOAD_URL, { method: 'POST', body: uploadData })
        const uploadResData = await uploadRes.json()
        if (!uploadResData.success) throw new Error(uploadResData.error || 'Upload failed')
        filePath = uploadResData.file_path
        fileSize = uploadResData.file_size
        fileType = uploadResData.file_type
      }

      const payload = {
        title: formData.title,
        description: formData.description,
        document_type: formData.document_type,
        vehicle_id: formData.vehicle_id || null,
        user_id: formData.user_id || null,
        file_path: filePath,
        file_size: fileSize,
        file_type: fileType
      }

      if (isEditing) {
        await axios.put(`/api/documents/${editingDocument.id}`, payload)
        toast.success(t('\u2705 Dokument a\u017euriran', '\u2705 Document updated'), { id: uploadToast })
      } else {
        await axios.post('/api/documents', payload)
        toast.success(t('\u2705 Dokument uspje\u0161no spremljen!', '\u2705 Document saved successfully!'), { id: uploadToast })
      }

      setShowModal(false)
      resetForm()
      fetchDocuments()
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || t('\u274c Gre\u0161ka', '\u274c Error'), { id: uploadToast })
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
      // Pronađi dokument da dobiješ file_path
      const doc = documents.find(d => d.id === id)
      if (doc?.file_path) await deleteFileFromServer(doc.file_path)
      // Obriši iz baze
      await axios.delete(`/api/documents/${id}`)
      toast.success(t('\u2705 Dokument obrisan', '\u2705 Deleted'), { id: deleteToast })
      fetchDocuments()
    } catch (err) {
      toast.error(t('\u274c Gre\u0161ka', '\u274c Error'), { id: deleteToast })
    }
  }

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

  const getDocTypeColor = (type) => {
    switch (type) {
      case 'insurance': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      case 'registration': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      case 'contract': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
      case 'invoice': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const canCreate = user?.role === 'admin' || user?.permissions?.['documents.create']
  const canEdit = user?.role === 'admin' || user?.permissions?.['documents.edit']
  const canDelete = user?.role === 'admin' || user?.permissions?.['documents.delete']
  const canShare = user?.role === 'admin' || user?.permissions?.['documents.share']

  const toggleExpand = (id) => { setExpandedDoc(expandedDoc === id ? null : id) }

  const MobileDocCard = ({ doc }) => {
    const isExpanded = expandedDoc === doc.id
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-3 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleExpand(doc.id)}>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <FileText size={20} className="text-blue-500 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white truncate">{doc.title}</p>
              <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium ${getDocTypeColor(doc.document_type)}`}>
                {translateDocType(doc.document_type)}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-2">
            {doc.file_path && (
              <a href={`https://joledrive.com${doc.file_path}`} target="_blank" rel="noopener noreferrer"
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full" onClick={(e) => e.stopPropagation()}>
                <Eye size={18} />
              </a>
            )}
            {isExpanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {doc.description && <p className="text-sm text-gray-600 dark:text-gray-300">{doc.description}</p>}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">{t('Vozilo', 'Vehicle')}:</span>
                <p className="text-gray-900 dark:text-white">{doc.manufacturer ? `${doc.manufacturer} ${doc.model}` : '-'}{doc.license_plate && <span className="text-gray-500 text-xs block">{doc.license_plate}</span>}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">{t('Korisnik', 'User')}:</span>
                <p className="text-gray-900 dark:text-white">{doc.user_name || '-'}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">{t('Veli\u010dina', 'Size')}:</span>
                <p className="text-gray-900 dark:text-white">{formatFileSize(doc.file_size)}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">{t('Datum', 'Date')}:</span>
                <p className="text-gray-900 dark:text-white">{formatDate(doc.created_at)}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-2 flex-wrap">
              {doc.file_path && (
                <>
                  <a href={`https://joledrive.com${doc.file_path}`} target="_blank" rel="noopener noreferrer" 
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-lg text-sm font-medium min-w-[80px]">
                    <Eye size={16} /> {t('Pregled', 'View')}
                  </a>
                  <a href={`https://joledrive.com${doc.file_path}`} download 
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-green-50 dark:bg-green-900/20 text-green-600 rounded-lg text-sm font-medium min-w-[80px]">
                    <Download size={16} /> {t('Preuzmi', 'Download')}
                  </a>
                </>
              )}
              {canEdit && (
                <button onClick={() => openEditModal(doc)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 rounded-lg text-sm font-medium min-w-[80px]">
                  <Edit size={16} /> {t('Uredi', 'Edit')}
                </button>
              )}
              {canShare && (
                <button onClick={() => handleShare(doc)}
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-purple-50 dark:bg-purple-900/20 text-purple-600 rounded-lg text-sm font-medium min-w-[80px]">
                  <Share2 size={16} /> {t('Dijeli', 'Share')}
                </button>
              )}
              {canDelete && (
                <button onClick={() => handleDelete(doc.id)} 
                  className="flex-1 flex items-center justify-center gap-1 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-lg text-sm font-medium min-w-[80px]">
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
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('Dokumenti', 'Documents')}</h1>
        {canCreate && (
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2 px-4 py-2">
            <Plus size={20} /> 
            <span className="hidden sm:inline">{t('U\u010ditaj dokument', 'Upload')}</span>
            <span className="sm:hidden">{t('U\u010ditaj', 'Upload')}</span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder={t('Pretra\u017ei...', 'Search...')} value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10 w-full" />
        </div>
        <div className="flex gap-3">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="input-field w-full sm:w-auto">
            <option value="">{t('Svi tipovi', 'All types')}</option>
            <option value="registration">{t('Registracija', 'Registration')}</option>
            <option value="insurance">{t('Osiguranje', 'Insurance')}</option>
            <option value="invoice">{t('Ra\u010dun', 'Invoice')}</option>
            <option value="contract">{t('Ugovor', 'Contract')}</option>
            <option value="other">{t('Ostalo', 'Other')}</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="input-field w-full sm:w-auto">
            <option value="date">{t('Najnoviji', 'Newest')}</option>
            <option value="title">{t('Naziv', 'Title')}</option>
          </select>
        </div>
      </div>

      {/* DESKTOP TABLE */}
      <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="table-header text-left px-4 py-3">{t('Naziv', 'Title')}</th>
                <th className="table-header text-left px-4 py-3">{t('Tip', 'Type')}</th>
                <th className="table-header text-left px-4 py-3">{t('Vozilo', 'Vehicle')}</th>
                <th className="table-header text-left px-4 py-3">{t('Korisnik', 'User')}</th>
                <th className="table-header text-left px-4 py-3">{t('Veli\u010dina', 'Size')}</th>
                <th className="table-header text-left px-4 py-3">{t('Datum', 'Date')}</th>
                <th className="table-header text-center px-4 py-3">{t('Akcije', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {documents.map(doc => (
                <tr key={doc.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-gray-900 dark:text-white block truncate">{doc.title}</span>
                        {doc.description && <span className="text-xs text-gray-500 dark:text-gray-400 truncate block">{doc.description}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getDocTypeColor(doc.document_type)}`}>
                      {translateDocType(doc.document_type)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {doc.manufacturer ? (
                      <span>
                        <span className="font-medium">{doc.manufacturer} {doc.model}</span>
                        {doc.license_plate && <span className="text-gray-500 text-sm ml-1">({doc.license_plate})</span>}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">{doc.user_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{formatFileSize(doc.file_size)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center gap-2">
                      {doc.file_path && (
                        <>
                          <a href={`https://joledrive.com${doc.file_path}`} target="_blank" rel="noopener noreferrer" 
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title={t('Pregled', 'View')}>
                            <Eye size={16} />
                          </a>
                          <a href={`https://joledrive.com${doc.file_path}`} download 
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title={t('Preuzmi', 'Download')}>
                            <Download size={16} />
                          </a>
                        </>
                      )}
                      {canEdit && (
                        <button onClick={() => openEditModal(doc)}
                          className="p-1.5 text-yellow-600 hover:bg-yellow-50 rounded-lg" title={t('Uredi', 'Edit')}>
                          <Edit size={16} />
                        </button>
                      )}
                      {canShare && (
                        <button onClick={() => handleShare(doc)}
                          className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg" title={t('Dijeli', 'Share')}>
                          <Share2 size={16} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(doc.id)} 
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg" title={t('Obri\u0161i', 'Delete')}>
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MOBILE */}
      <div className="md:hidden">
        {documents.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">{t('Nema dokumenata', 'No documents')}</div>
        ) : (
          documents.map(doc => <MobileDocCard key={doc.id} doc={doc} />)
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editingDocument ? t('Uredi dokument', 'Edit Document') : t('U\u010ditaj dokument', 'Upload Document')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Naziv', 'Title')} *</label>
                <input type="text" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Opis', 'Description')}</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="input-field w-full" rows={2} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Tip dokumenta', 'Document Type')}</label>
                <select value={formData.document_type} onChange={e => setFormData({...formData, document_type: e.target.value})} className="input-field w-full">
                  <option value="registration">{t('Registracija', 'Registration')}</option>
                  <option value="insurance">{t('Osiguranje', 'Insurance')}</option>
                  <option value="invoice">{t('Ra\u010dun', 'Invoice')}</option>
                  <option value="contract">{t('Ugovor', 'Contract')}</option>
                  <option value="other">{t('Ostalo', 'Other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Vozilo', 'Vehicle')}</label>
                <select value={formData.vehicle_id} onChange={e => setFormData({...formData, vehicle_id: e.target.value})} className="input-field w-full">
                  <option value="">{t('-- Bez vozila --', '-- No vehicle --')}</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.manufacturer} {v.model} {v.license_plate ? `(${v.license_plate})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('Korisnik', 'User')}</label>
                <select value={formData.user_id} onChange={e => setFormData({...formData, user_id: e.target.value})} className="input-field w-full">
                  <option value="">{t('-- Bez korisnika --', '-- No user --')}</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} {u.email ? `(${u.email})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  {editingDocument ? t('Nova datoteka (opcionalno)', 'New file (optional)') : t('Datoteka', 'File') + ' *'}
                </label>
                <input type="file" required={!editingDocument}
                  onChange={e => setFormData({...formData, file: e.target.files[0]})} className="input-field w-full" />
                <p className="text-xs text-gray-500 mt-1">
                  {editingDocument
                    ? t('Ostavite prazno da zadr\u017eite postoje\u0107u datoteku', 'Leave empty to keep existing file')
                    : t('Max 10MB. Dopu\u0161teno: PDF, DOC, DOCX, JPG, PNG, XLS, XLSX, ZIP', 'Max 10MB. Allowed: PDF, DOC, DOCX, JPG, PNG, XLS, XLSX, ZIP')
                  }
                </p>
              </div>
              {formData.file && (
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{t('Odabrana datoteka:', 'Selected file:')}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{formData.file.name} ({formatFileSize(formData.file.size)})</p>
                </div>
              )}
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary flex-1" disabled={loading}>
                  {loading ? t('Spremanje...', 'Saving...') : editingDocument ? t('Spremi izmjene', 'Save Changes') : t('U\u010ditaj', 'Upload')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1" disabled={loading}>
                  {t('Odustani', 'Cancel')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHARE MODAL */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
              <Share2 size={20} className="text-purple-600" />
              {t('Dijeli dokument', 'Share Document')}
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
