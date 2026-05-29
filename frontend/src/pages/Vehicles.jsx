import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { Plus, Search, Edit, Trash2, Car, User, CheckCircle2, X, Upload, ImageIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const { user } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en
  const fileInputRef = useRef(null)

  // --- Form state ---
  const [formData, setFormData] = useState({
    manufacturer: '', model: '', license_plate: '', chassis_number: '', year: '', mileage: '',
    fuel_type: 'dizel', color: '', registration_date: '', yellow_card_date: '',
    pp_apparatus_date: '', image_url: '', notes: '', assigned_to: ''
  })

  // --- Image upload state ---
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageUploading, setImageUploading] = useState(false)

  useEffect(() => { fetchVehicles(); fetchUsers() }, [])

  const fetchVehicles = async () => {
    try {
      const res = await axios.get('/api/vehicles')
      setVehicles(res.data)
    }
    catch (err) {
      toast.error(t('\u274c Gre\u0161ka pri u\u010ditavanju', '\u274c Error loading'))
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/users')
      setUsers(res.data)
    }
    catch (err) { console.error(err) }
  }

  // ============================================
  // UPLOAD SLIKE
  // ============================================
  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return

    // Validacija
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      toast.error(t('\u274c Samo JPG, PNG, GIF, WebP', '\u274c Only JPG, PNG, GIF, WebP'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('\u274c Maksimalno 5MB', '\u274c Max 5MB'))
      return
    }

    setImageFile(file)

    // Preview
    const reader = new FileReader()
    reader.onloadend = () => setImagePreview(reader.result)
    reader.readAsDataURL(file)
  }

  const uploadImage = async () => {
    if (!imageFile) return formData.image_url || null

    setImageUploading(true)
    const uploadToast = toast.loading(t('\u23f3 Upload slike...', '\u23f3 Uploading image...'))

    try {
      const data = new FormData()
      data.append('image', imageFile)
      data.append('manufacturer', formData.manufacturer || 'vehicle')
      data.append('model', formData.model || '')

      const res = await axios.post('https://joledrive.com/upload_vehicle_image.php', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      toast.success(t('\u2705 Slika uploadana', '\u2705 Image uploaded'), { id: uploadToast })
      return res.data.image_url
    } catch (err) {
      toast.error(err.response?.data?.error || t('\u274c Gre\u0161ka uploada', '\u274c Upload error'), { id: uploadToast })
      return formData.image_url || null
    } finally {
      setImageUploading(false)
    }
  }

  const handleRemoveImage = async () => {
    // Ako ima postojeća slika u bazi, obriši je sa servera
    if (formData.image_url && editingVehicle) {
      const deleteToast = toast.loading(t('\u23f3 Brisanje slike...', '\u23f3 Deleting image...'))
      try {
        await axios.post('https://joledrive.com/delete_vehicle_image.php', { image_path: formData.image_url })
        toast.success(t('\u2705 Slika obrisana', '\u2705 Image deleted'), { id: deleteToast })
      } catch (err) {
        console.error('Delete image error:', err)
      }
    }

    setImageFile(null)
    setImagePreview(null)
    setFormData(prev => ({ ...prev, image_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ============================================
  // SUBMIT - Spremi vozilo (prvo upload slike, onda forma)
  // ============================================
  const handleSubmit = async (e) => {
    e.preventDefault()

    const saveToast = toast.loading(
      editingVehicle ? t('\u23f3 A\u017euriranje...', '\u23f3 Updating...') : t('\u23f3 Dodavanje...', '\u23f3 Adding...')
    )

    try {
      // Prvo upload slike ako ima nova
      let uploadedImageUrl = formData.image_url
      if (imageFile) {
        uploadedImageUrl = await uploadImage()
      }

      const payload = {
        ...formData,
        image_url: uploadedImageUrl || ''
      }

      if (editingVehicle) {
        await axios.put(`/api/vehicles/${editingVehicle.id}`, payload)
        toast.success(t('\u2705 Vozilo a\u017eurirano', '\u2705 Vehicle updated'), { id: saveToast })
      } else {
        await axios.post('/api/vehicles', payload)
        toast.success(t('\u2705 Vozilo dodano', '\u2705 Vehicle added'), { id: saveToast })
      }

      setShowModal(false)
      setEditingVehicle(null)
      setImageFile(null)
      setImagePreview(null)
      setFormData({
        manufacturer: '', model: '', license_plate: '', chassis_number: '', year: '', mileage: '',
        fuel_type: 'dizel', color: '', registration_date: '', yellow_card_date: '',
        pp_apparatus_date: '', image_url: '', notes: '', assigned_to: ''
      })
      fetchVehicles()
    } catch (err) {
      if (err.response?.data?.error?.includes('already exists')) {
        toast.error(t('\u274c Registracija ili \u0161asija ve\u0107 postoji', '\u274c License plate or chassis already exists'), { id: saveToast })
      } else {
        toast.error(t('\u274c Gre\u0161ka', '\u274c Error'), { id: saveToast })
      }
    }
  }

  const handleDelete = async (id) => {
    if (!confirm(t('Jeste li sigurni?', 'Are you sure?'))) return

    const deleteToast = toast.loading(t('\u23f3 Brisanje...', '\u23f3 Deleting...'))

    try {
      await axios.delete(`/api/vehicles/${id}`)
      toast.success(t('\u2705 Vozilo obrisano', '\u2705 Deleted'), { id: deleteToast })
      fetchVehicles()
    } catch (err) {
      toast.error(t('\u274c Gre\u0161ka', '\u274c Error'), { id: deleteToast })
    }
  }

  const openEdit = (vehicle) => {
    setEditingVehicle(vehicle)
    setFormData({
      manufacturer: vehicle.manufacturer,
      model: vehicle.model,
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
    setImageFile(null)
    setImagePreview(vehicle.image_url ? vehicle.image_url : null)
    setShowModal(true)
  }

  const openCreate = () => {
    setEditingVehicle(null)
    setFormData({
      manufacturer: '', model: '', license_plate: '', chassis_number: '', year: '', mileage: '',
      fuel_type: 'dizel', color: '', registration_date: '', yellow_card_date: '',
      pp_apparatus_date: '', image_url: '', notes: '', assigned_to: ''
    })
    setImageFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setShowModal(true)
  }

  // Grupiranje i filtriranje vozila
  const searchFiltered = vehicles.filter(v =>
    v.manufacturer?.toLowerCase().includes(search.toLowerCase()) ||
    v.model?.toLowerCase().includes(search.toLowerCase()) ||
    v.license_plate?.toLowerCase().includes(search.toLowerCase())
  )

  const availableVehicles = searchFiltered.filter(v => !v.assigned_to)
  const occupiedVehicles = searchFiltered.filter(v => v.assigned_to)

  let filteredVehicles = searchFiltered
  if (groupFilter === 'available') filteredVehicles = availableVehicles
  if (groupFilter === 'occupied') filteredVehicles = occupiedVehicles

  const canCreate = user?.role === 'admin' || user?.permissions?.['vehicles.create']
  const canEdit = user?.role === 'admin' || user?.permissions?.['vehicles.edit']
  const canDelete = user?.role === 'admin' || user?.permissions?.['vehicles.delete']

  // Base URL za slike (va\u017eno za produkciju gdje backend i frontend nisu na istom originu)
  const getImageUrl = (url) => {
    if (!url) return null
    if (url.startsWith('http')) return url
    return url
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('Vozila', 'Vehicles')}</h1>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> {t('Dodaj vozilo', 'Add Vehicle')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input type="text" placeholder={t('Pretra\u017ei...', 'Search...')} value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10" />
      </div>

      {/* Tabs za grupiranje */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setGroupFilter('all')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === 'all'
              ? 'bg-primary-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          {t('Sva vozila', 'All Vehicles')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300'
          }`}>
            {searchFiltered.length}
          </span>
        </button>
        <button
          onClick={() => setGroupFilter('available')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === 'available'
              ? 'bg-green-600 text-white'
              : 'bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30'
          }`}
        >
          <CheckCircle2 size={16} />
          {t('Dostupna', 'Available')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === 'available' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200'
          }`}>
            {availableVehicles.length}
          </span>
        </button>
        <button
          onClick={() => setGroupFilter('occupied')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
            groupFilter === 'occupied'
              ? 'bg-blue-600 text-white'
              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30'
          }`}
        >
          <User size={16} />
          {t('Zauzeta', 'Occupied')}
          <span className={`px-2 py-0.5 rounded-full text-xs ${
            groupFilter === 'occupied' ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200'
          }`}>
            {occupiedVehicles.length}
          </span>
        </button>
      </div>

      {/* Grid vozila */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVehicles.map(vehicle => (
          <div key={vehicle.id} className="card hover:shadow-lg transition-shadow">
            <div className="relative w-full h-48 bg-primary-100 dark:bg-primary-900/30 rounded-xl mb-4 overflow-hidden">
              {vehicle.image_url ? (
                <img src={getImageUrl(vehicle.image_url)} alt={`${vehicle.manufacturer} ${vehicle.model}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Car className="text-primary-600" size={64} />
                </div>
              )}
              {/* Status badge */}
              <div className={`absolute top-2 right-2 px-2.5 py-1 rounded-full text-xs font-medium ${
                vehicle.assigned_to
                  ? 'bg-blue-600 text-white'
                  : 'bg-green-600 text-white'
              }`}>
                {vehicle.assigned_to
                  ? t('Zauzeto', 'Occupied')
                  : t('Dostupno', 'Available')
                }
              </div>
            </div>

            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-lg truncate">{vehicle.manufacturer} {vehicle.model}</h3>
                <p className="text-sm text-gray-500">{vehicle.year} \u2022 {vehicle.fuel_type}</p>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                {canEdit && <button onClick={() => openEdit(vehicle)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={16} /></button>}
                {canDelete && <button onClick={() => handleDelete(vehicle.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 size={16} /></button>}
              </div>
            </div>

            {vehicle.assigned_name && (
              <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-2">
                <User size={14} className="text-blue-600 shrink-0" />
                <span className="text-sm text-blue-700 dark:text-blue-300 truncate">
                  {t('Zadu\u017eio', 'Assigned')}: {vehicle.assigned_name}
                </span>
              </div>
            )}

            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
              <p className="truncate">{t('Tablice', 'Plate')}: {vehicle.license_plate || '-'}</p>
              <p className="truncate">{t('\u0160asija', 'Chassis')}: {vehicle.chassis_number || '-'}</p>
              <p>{t('Kilometra\u017ea', 'Mileage')}: {vehicle.mileage?.toLocaleString() || '-'} km</p>
              <p>{t('Boja', 'Color')}: {vehicle.color || '-'}</p>
              <p>{t('Registracija', 'Reg')}: {vehicle.registration_date ? new Date(vehicle.registration_date).toLocaleDateString() : '-'}</p>
            </div>

            <div className="mt-4 pt-4 border-t dark:border-gray-700 flex items-center justify-between">
              <span className="text-xs text-gray-500">{vehicle.service_history?.length || 0} {t('servisa', 'services')}</span>
              <Link to={`/vehicles/${vehicle.id}`} className="text-sm text-primary-600 hover:text-primary-700 font-medium">
                {t('Detalji \u2192', 'Details \u2192')}
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h2 className="text-xl font-bold mb-4">{editingVehicle ? t('Uredi vozilo', 'Edit Vehicle') : t('Novo vozilo', 'New Vehicle')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Proizvo\u0111a\u010d', 'Manufacturer')} *</label>
                  <input type="text" required value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Model', 'Model')} *</label>
                  <input type="text" required value={formData.model} onChange={e => setFormData({...formData, model: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Registarska oznaka', 'License Plate')} *</label>
                  <input type="text" required value={formData.license_plate} onChange={e => setFormData({...formData, license_plate: e.target.value})} className="input-field" placeholder="ZG-1234-AB" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Broj \u0161asije', 'Chassis')}</label>
                  <input type="text" value={formData.chassis_number} onChange={e => setFormData({...formData, chassis_number: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Godina', 'Year')}</label>
                  <input type="number" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Kilometra\u017ea', 'Mileage')}</label>
                  <input type="number" value={formData.mileage} onChange={e => setFormData({...formData, mileage: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Gorivo', 'Fuel')}</label>
                  <select value={formData.fuel_type} onChange={e => setFormData({...formData, fuel_type: e.target.value})} className="input-field">
                    <option value="benzin">Benzin</option>
                    <option value="dizel">Dizel</option>
                    <option value="plin">Plin</option>
                    <option value="hibrid">Hibrid</option>
                    <option value="elektri\u010dni">Elektri\u010dni</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Boja', 'Color')}</label>
                  <input type="text" value={formData.color} onChange={e => setFormData({...formData, color: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Zadu\u017eio', 'Assigned To')}</label>
                  <select value={formData.assigned_to} onChange={e => setFormData({...formData, assigned_to: e.target.value})} className="input-field">
                    <option value="">{t('Nitko', 'Nobody')}</option>
                    {users.map(u => (
  <option key={u.id} value={u.id}>
    {u.name} {u.type === 'client' ? `(${t('Zakupac', 'Client')})` : ''}
  </option>
))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Registracija do', 'Reg until')}</label>
                  <input type="date" value={formData.registration_date} onChange={e => setFormData({...formData, registration_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('\u017duti karton do', 'Yellow card')}</label>
                  <input type="date" value={formData.yellow_card_date} onChange={e => setFormData({...formData, yellow_card_date: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('PP aparat do', 'PP apparatus')}</label>
                  <input type="date" value={formData.pp_apparatus_date} onChange={e => setFormData({...formData, pp_apparatus_date: e.target.value})} className="input-field" />
                </div>
              </div>

              {/* ===== IMAGE UPLOAD SEKCIJA ===== */}
              <div>
                <label className="block text-sm font-medium mb-2">{t('Slika vozila', 'Vehicle Image')}</label>

                {/* Preview */}
                {imagePreview && (
                  <div className="relative w-full h-48 mb-3 rounded-xl overflow-hidden border dark:border-gray-600">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 shadow-lg"
                      title={t('Ukloni sliku', 'Remove image')}
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                {/* File input */}
                {!imagePreview && (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload size={24} className="text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('Klikni za upload slike', 'Click to upload image')}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        JPG, PNG, GIF, WebP (max 5MB)
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                )}

                {/* Zamijeni sliku */}
                {imagePreview && (
                  <label className="flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700 cursor-pointer">
                    <Upload size={16} />
                    {t('Zamijeni sliku', 'Replace image')}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.webp"
                      onChange={handleImageSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
              {/* ===== KRAJ IMAGE UPLOAD ===== */}

              <div>
                <label className="block text-sm font-medium mb-1">{t('Napomene', 'Notes')}</label>
                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="input-field" rows={3} />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="btn-primary flex items-center gap-2"
                  disabled={imageUploading}
                >
                  {imageUploading && (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  )}
                  {t('Spremi', 'Save')}
                </button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
