import { useState, useEffect } from 'react'
import axios from 'axios'
import { DollarSign, TrendingUp, TrendingDown, FileText, ChevronLeft } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import toast from 'react-hot-toast'

export default function VehicleProfitPage() {
  const [vehicles, setVehicles] = useState([])
  const [selected, setSelected] = useState(null)
  const [report, setReport] = useState(null)
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  useEffect(() => { fetchVehicles() }, [])

  const fetchVehicles = async () => {
    try {
      const res = await axios.get('/api/vehicles')
      setVehicles(res.data)
    } catch (err) {
      toast.error(t('Greška', 'Error'))
    }
  }

  const fetchReport = async (id) => {
    try {
      const res = await axios.get(`/api/vehicles/${id}/financial-report`)
      setReport(res.data)
      setSelected(res.data.vehicle)
    } catch (err) {
      toast.error(t('Greška', 'Error'))
    }
  }

  if (report) {
    return (
      <div className="space-y-4 md:space-y-6 px-2 md:px-0">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setReport(null)} 
            className="p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700 rounded-lg"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('Financijski izvještaj', 'Financial Report')}</h1>
        </div>

        <div className="card p-4 md:p-6">
          <h2 className="text-xl font-bold mb-4 dark:text-white">
            {selected.manufacturer} {selected.model} - {selected.license_plate}
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
            <div className="p-3 md:p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
              <TrendingUp size={18} className="text-green-600 mb-1" />
              <p className="text-xs text-green-700 dark:text-green-300">{t('Prihodi', 'Income')}</p>
              <p className="text-xl md:text-2xl font-bold text-green-600">€{report.summary.total_income}</p>
            </div>
            <div className="p-3 md:p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <TrendingDown size={18} className="text-red-600 mb-1" />
              <p className="text-xs text-red-700 dark:text-red-300">{t('Troškovi', 'Expenses')}</p>
              <p className="text-xl md:text-2xl font-bold text-red-600">€{report.summary.total_expenses}</p>
            </div>
            <div className="p-3 md:p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <DollarSign size={18} className="text-blue-600 mb-1" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{t('Profit', 'Profit')}</p>
              <p className={`text-xl md:text-2xl font-bold ${report.summary.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                €{report.summary.profit}
              </p>
            </div>
            <div className="p-3 md:p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <FileText size={18} className="text-purple-600 mb-1" />
              <p className="text-xs text-purple-700 dark:text-purple-300">{t('Marža', 'Margin')}</p>
              <p className="text-xl md:text-2xl font-bold text-purple-600">{report.summary.profit_margin}</p>
            </div>
          </div>

          <h3 className="font-bold mb-2 dark:text-white">{t('Računi', 'Invoices')}</h3>
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full border rounded-lg">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Broj', 'Number')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Datum', 'Date')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Iznos', 'Amount')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Status', 'Status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {report.invoices.map(inv => (
                  <tr key={inv.id}>
                    <td className="px-3 py-2 dark:text-gray-300 text-sm">{inv.invoice_number}</td>
                    <td className="px-3 py-2 dark:text-gray-300 text-sm">{new Date(inv.issue_date).toLocaleDateString('hr-HR')}</td>
                    <td className="px-3 py-2 text-green-600 font-medium text-sm">€{inv.amount}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-1 rounded-full text-xs ${inv.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {inv.status === 'paid' ? t('Plaćen', 'Paid') : t('Neplaćen', 'Unpaid')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-bold mb-2 dark:text-white">{t('Servisi', 'Services')}</h3>
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full border rounded-lg">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Opis', 'Description')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Rad', 'Labor')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Ukupno', 'Total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {report.services.map(s => (
                  <tr key={s.id}>
                    <td className="px-3 py-2 dark:text-gray-300 text-sm">{s.work_description || s.description}</td>
                    <td className="px-3 py-2 dark:text-gray-300 text-sm">€{s.labor_cost}</td>
                    <td className="px-3 py-2 text-red-600 font-medium text-sm">€{s.total_cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="font-bold mb-2 dark:text-white">{t('Ostali troškovi', 'Other Expenses')}</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full border rounded-lg">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Tip', 'Type')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Opis', 'Desc')}</th>
                  <th className="px-3 py-2 text-left text-xs dark:text-gray-300">{t('Iznos', 'Amount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {report.expenses.map(e => (
                  <tr key={e.id}>
                    <td className="px-3 py-2 dark:text-gray-300 text-sm">{e.expense_type}</td>
                    <td className="px-3 py-2 dark:text-gray-300 text-sm">{e.description || '-'}</td>
                    <td className="px-3 py-2 text-red-600 font-medium text-sm">€{e.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">{t('Profitabilnost', 'Profitability')}</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {vehicles.map(v => (
          <div 
            key={v.id} 
            onClick={() => fetchReport(v.id)}
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow"
          >
            <h3 className="font-bold dark:text-white">{v.manufacturer} {v.model}</h3>
            <p className="text-sm text-gray-500">{v.license_plate}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-500">{t('Prihod', 'Income')}</p>
                <p className="text-green-600 font-bold">€{v.total_income || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('Trošak', 'Cost')}</p>
                <p className="text-red-600 font-bold">€{v.total_expenses || 0}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{t('Profit', 'Profit')}</p>
                <p className={`font-bold ${(v.total_profit || 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  €{v.total_profit || 0}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}