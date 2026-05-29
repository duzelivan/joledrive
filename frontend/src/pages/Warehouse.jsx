import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'
import { Plus, Search, Edit, Trash2, AlertTriangle, Package, TrendingDown, DollarSign, Filter } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

export default function Warehouse() {
  const [parts, setParts] = useState([])
  const [search, setSearch] = useState('')
  const [showLowStock, setShowLowStock] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editingPart, setEditingPart] = useState(null)
  const [activeCategory, setActiveCategory] = useState('all')
  const { user } = useAuth()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [formData, setFormData] = useState({ name: '', part_number: '', category: '', quantity: 0, min_quantity: 5, unit_price: '', supplier: '', notes: '' })

  useEffect(() => { fetchParts() }, [search, showLowStock])

  const fetchParts = async () => {
    try {
      const res = await axios.get('/api/warehouse', { params: { search, low_stock: showLowStock } })
      setParts(res.data)
    }
    catch (err) {
      toast.error(t('Greška pri učitavanju', 'Error loading'))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const saveToast = toast.loading(editingPart ? t('Ažuriranje...', 'Updating...') : t('Dodavanje...', 'Adding...'))
    try {
      if (editingPart) {
        await axios.put(`/api/warehouse/${editingPart.id}`, formData)
        toast.success(t('Dio ažuriran', 'Part updated'), { id: saveToast })
      }
      else {
        await axios.post('/api/warehouse', formData)
        toast.success(t('Dio dodan na skladište', 'Part added'), { id: saveToast })
      }
      setShowModal(false)
      setEditingPart(null)
      setFormData({ name: '', part_number: '', category: '', quantity: 0, min_quantity: 5, unit_price: '', supplier: '', notes: '' })
      fetchParts()
    } catch (err) {
      toast.error(t('Greška', 'Error'), { id: saveToast })
    }
  }

  const handleDelete = async (id) => {
    if (!confirm(t('Jeste li sigurni?', 'Are you sure?'))) return
    const deleteToast = toast.loading(t('Brisanje...', 'Deleting...'))
    try {
      await axios.delete(`/api/warehouse/${id}`)
      toast.success(t('Dio obrisan', 'Deleted'), { id: deleteToast })
      fetchParts()
    } catch (err) {
      toast.error(t('Greška', 'Error'), { id: deleteToast })
    }
  }

  const openEdit = (part) => {
    setEditingPart(part)
    setFormData({ name: part.name, part_number: part.part_number || '', category: part.category || '', quantity: part.quantity, min_quantity: part.min_quantity, unit_price: part.unit_price || '', supplier: part.supplier || '', notes: part.notes || '' })
    setShowModal(true)
  }

  const canCreate = user?.role === 'admin' || user?.permissions?.['warehouse.create']
  const canEdit = user?.role === 'admin' || user?.permissions?.['warehouse.edit']
  const canDelete = user?.role === 'admin' || user?.permissions?.['warehouse.delete']

  // Stats
  const totalParts = parts.length
  const lowStockCount = parts.filter(p => p.quantity <= p.min_quantity).length
  const totalValue = parts.reduce((s, p) => s + (parseFloat(p.unit_price || 0) * p.quantity), 0)

  // Unique categories
  const categories = useMemo(() => {
    const cats = new Set(parts.map(p => p.category).filter(Boolean))
    return ['all', ...Array.from(cats).sort()]
  }, [parts])

  // Filtered parts
  const filteredParts = useMemo(() => {
    if (activeCategory === 'all') return parts
    return parts.filter(p => p.category === activeCategory)
  }, [parts, activeCategory])

  // Stock status
  const getStockStatus = (part) => {
    const ratio = part.min_quantity > 0 ? part.quantity / part.min_quantity : 1
    if (part.quantity === 0) return { label: t('Nema', 'Out'), color: 'bg-red-500', textColor: 'text-red-600', bgColor: 'bg-red-50', pct: 0 }
    if (ratio <= 1) return { label: t('Nisko', 'Low'), color: 'bg-red-500', textColor: 'text-red-600', bgColor: 'bg-red-50', pct: Math.min(ratio * 100, 100) }
    if (ratio <= 2) return { label: t('Srednje', 'Med'), color: 'bg-yellow-500', textColor: 'text-yellow-600', bgColor: 'bg-yellow-50', pct: Math.min(ratio * 50, 100) }
    return { label: t('OK', 'OK'), color: 'bg-emerald-500', textColor: 'text-emerald-600', bgColor: 'bg-emerald-50', pct: 100 }
  }

  const catColors = ['bg-gray-100 text-gray-700', 'bg-cyan-100 text-cyan-700', 'bg-purple-100 text-purple-700', 'bg-pink-100 text-pink-700', 'bg-indigo-100 text-indigo-700', 'bg-orange-100 text-orange-700']

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('Skladište', 'Warehouse')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('Pregled svih dijelova na skladištu', 'Overview of all parts in stock')}</p>
        </div>
        {canCreate && (
          <button onClick={() => { setEditingPart(null); setShowModal(true); }} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm hover:shadow-md">
            <Plus size={18} /> {t('Novi dio', 'New Part')}
          </button>
        )}
      </div>

      {/* ===== STAT CARDS ===== */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyan-100 text-cyan-600">
              <Package size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalParts}</p>
              <p className="text-xs text-gray-500 uppercase">{t('Ukupno dijelova', 'Total Parts')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-red-100 text-red-600">
              <TrendingDown size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">{lowStockCount}</p>
              <p className="text-xs text-gray-500 uppercase">{t('Niska zaliha', 'Low Stock')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-100 text-emerald-600">
              <DollarSign size={22} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalValue.toLocaleString('hr-HR', { minimumFractionDigits: 2 })} €</p>
              <p className="text-xs text-gray-500 uppercase">{t('Vrijednost', 'Value')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ===== SEARCH + FILTER ===== */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input type="text" placeholder={t('Pretraži...', 'Search...')} value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-10 w-full" />
        </div>
        <button onClick={() => setShowLowStock(!showLowStock)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${showLowStock ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700'}`}>
          <AlertTriangle size={16} /> {t('Niska zaliha', 'Low Stock')}
          {lowStockCount > 0 && <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full">{lowStockCount}</span>}
        </button>
      </div>

      {/* ===== CATEGORY PILLS ===== */}
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat, i) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeCategory === cat
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : `${catColors[i % catColors.length]} hover:opacity-80`
              }`}
            >
              {cat === 'all' ? t('Sve', 'All') : cat}
              {cat !== 'all' && <span className="ml-1.5 text-xs opacity-60">{parts.filter(p => p.category === cat).length}</span>}
            </button>
          ))}
        </div>
      )}

      {/* ===== GRID CARDS ===== */}
      {filteredParts.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">{t('Nema rezultata', 'No results')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredParts.map(part => {
            const status = getStockStatus(part)
            return (
              <div key={part.id} className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 hover:shadow-lg transition-all hover:-translate-y-0.5 ${part.quantity <= part.min_quantity ? 'ring-1 ring-red-200' : ''}`}>
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{part.name}</h3>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{part.part_number || '—'}</p>
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    {canEdit && (
                      <button onClick={() => openEdit(part)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                        <Edit size={14} />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(part.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category badge */}
                {part.category && (
                  <span className="inline-block px-2.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-lg mb-3">
                    {part.category}
                  </span>
                )}

                {/* Stock progress */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`text-xs font-bold ${status.textColor}`}>{status.label}</span>
                    <span className="text-xs text-gray-500">{part.quantity} / {part.min_quantity} {t('min', 'min')}</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${status.color} transition-all`} style={{ width: `${status.pct}%` }} />
                  </div>
                </div>

                {/* Footer: price + supplier */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {part.unit_price ? `${parseFloat(part.unit_price).toFixed(2)} €` : '-'}
                  </span>
                  {part.supplier && (
                    <span className="text-xs text-gray-500 truncate max-w-[100px]">{part.supplier}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">{editingPart ? t('Uredi dio', 'Edit Part') : t('Novi dio', 'New Part')}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Naziv', 'Name')} *</label>
                  <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Šifra', 'Part No.')}</label>
                  <input type="text" value={formData.part_number} onChange={e => setFormData({...formData, part_number: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Kategorija', 'Category')}</label>
                  <input type="text" value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Količina', 'Qty')} *</label>
                  <input type="number" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Min. količina', 'Min Qty')}</label>
                  <input type="number" value={formData.min_quantity} onChange={e => setFormData({...formData, min_quantity: e.target.value})} className="input-field w-full" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Cijena (€)', 'Price (€)')}</label>
                  <input type="number" step="0.01" value={formData.unit_price} onChange={e => setFormData({...formData, unit_price: e.target.value})} className="input-field w-full" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Dobavljač', 'Supplier')}</label>
                  <input type="text" value={formData.supplier} onChange={e => setFormData({...formData, supplier: e.target.value})} className="input-field w-full" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-300">{t('Napomene', 'Notes')}</label>
                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="input-field w-full" rows={2} />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="submit" className="btn-primary">{t('Spremi', 'Save')}</button>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">{t('Odustani', 'Cancel')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
