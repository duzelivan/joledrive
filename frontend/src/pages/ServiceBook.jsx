import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Printer, ArrowLeft, Wrench, Calendar, Hash, Gauge, Fuel, Palette, User, FileText } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function ServiceBook() {
  const { vehicleId } = useParams()
  const navigate = useNavigate()
  const { language } = useTheme()
  const t = (hr, en) => language === 'hr' ? hr : en

  const [vehicle, setVehicle] = useState(null)
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [vehicleId])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [vRes, sRes] = await Promise.all([
        axios.get(`/api/vehicles/${vehicleId}`),
        axios.get(`/api/services?vehicle_id=${vehicleId}&status=completed`)
      ])
      setVehicle(vRes.data)

      // Dohvati dijelove za svaki servis
      const servicesWithParts = await Promise.all(
        sRes.data.map(async (svc) => {
          const [partsRes] = await Promise.all([
            axios.get(`/api/services/${svc.id}`).then(r => r.data.parts || []).catch(() => [])
          ])
          return { ...svc, parts: partsRes }
        })
      )
      setServices(servicesWithParts)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handlePrint = () => window.print()

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString(language === 'hr' ? 'hr-HR' : 'en-GB')
  }

  if (loading) return <div className="p-8 text-center text-gray-500">{t('Učitavanje...', 'Loading...')}</div>
  if (!vehicle) return <div className="p-8 text-center text-gray-500">{t('Nema podataka', 'No data')}</div>

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar - hidden when printing */}
      <div className="print:hidden bg-gray-900 text-white p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-semibold">{t('Servisna knjiga', 'Service Book')}</h1>
        </div>
        <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors">
          <Printer size={18} />
          {t('Printaj', 'Print')}
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-8 print:p-0">
        {/* Title */}
        <div className="border-b-2 border-gray-900 pb-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-1">{t('SERVISNA KNJIGA', 'SERVICE BOOK')}</h1>
          <p className="text-gray-500">{t('JoleDrive d.o.o - Evidencija vozila', 'JoleDrive d.o.o - Vehicle Records')}</p>
          <p className="text-sm text-gray-400 mt-1">{t('Ispisano', 'Printed')}: {formatDate(new Date())}</p>
        </div>

        {/* Vehicle Info */}
        <div className="bg-gray-50 rounded-xl p-6 mb-8 print:bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Gauge size={18} /> {t('Podaci o vozilu', 'Vehicle Information')}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-5">
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Proizvođač', 'Manufacturer')}</p>
              <p className="font-semibold text-gray-900 break-words">{vehicle.manufacturer}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Model', 'Model')}</p>
              <p className="font-semibold text-gray-900 break-words">{vehicle.model}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Tablice', 'License Plate')}</p>
              <p className="font-semibold text-gray-900 break-words">{vehicle.license_plate || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Godina', 'Year')}</p>
              <p className="font-semibold text-gray-900 break-words">{vehicle.year || '-'}</p>
            </div>
            <div className="min-w-0 col-span-2 md:col-span-1">
              <p className="text-xs text-gray-500 uppercase">{t('Broj šasije', 'Chassis No.')}</p>
              <p className="font-semibold text-gray-900 break-all text-sm leading-tight">{vehicle.chassis_number || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Kilometraža', 'Mileage')}</p>
              <p className="font-semibold text-gray-900 break-words">{vehicle.mileage ? vehicle.mileage.toLocaleString() + ' km' : '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Gorivo', 'Fuel')}</p>
              <p className="font-semibold text-gray-900 capitalize break-words">{vehicle.fuel_type || '-'}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 uppercase">{t('Boja', 'Color')}</p>
              <p className="font-semibold text-gray-900 break-words">{vehicle.color || '-'}</p>
            </div>
          </div>
        </div>

        {/* Services */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 pb-2 border-b flex items-center gap-2">
            <Wrench size={18} /> {t('Povijest servisa', 'Service History')}
            {services.length > 0 && <span className="text-sm font-normal text-gray-400">({services.length})</span>}
          </h2>

          {services.length === 0 ? (
            <p className="text-gray-500 text-center py-8">{t('Nema zapisa o servisima', 'No service records')}</p>
          ) : (
            <div className="space-y-4">
              {services.map((svc, idx) => (
                <div key={svc.id} className="border rounded-lg p-4 break-inside-avoid">
                  {/* Service header */}
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-3">
                    <div>
                      <span className="text-xs text-gray-400">#{services.length - idx}</span>
                      <h3 className="font-semibold text-gray-900">{svc.service_type}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900 flex items-center gap-1">
                        <Calendar size={13} /> {formatDate(svc.service_date)}
                      </p>
                      {svc.previous_mileage && (
                        <p className="text-xs text-gray-500">{svc.previous_mileage.toLocaleString()} km</p>
                      )}
                    </div>
                  </div>

                  {/* Mechanic */}
                  {svc.mechanic_name && (
                    <p className="text-sm text-gray-600 mb-2 flex items-center gap-1">
                      <User size={13} /> {svc.mechanic_name}
                    </p>
                  )}

                  {/* Work description */}
                  {svc.work_description && (
                    <div className="text-sm text-gray-700 mb-3 bg-gray-50 p-3 rounded print:bg-gray-50">
                      <p className="text-xs text-gray-500 uppercase mb-1 flex items-center gap-1"><FileText size={11} /> {t('Opis radova', 'Work Description')}</p>
                      <p>{svc.work_description}</p>
                    </div>
                  )}

                  {/* Parts */}
                  {svc.parts && svc.parts.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-500 uppercase mb-2 font-medium">{t('Korišteni dijelovi', 'Parts Used')}</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b">
                            <th className="pb-1 pr-4">{t('Naziv', 'Name')}</th>
                            <th className="pb-1 pr-4 text-right">{t('Kol.', 'Qty')}</th>
                            <th className="pb-1 text-right">{t('Cijena', 'Price')}</th>
                            <th className="pb-1 text-right">{t('Ukupno', 'Total')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {svc.parts.map(part => (
                            <tr key={part.id} className="border-t">
                              <td className="py-1 pr-4">{part.part_name || part.name}</td>
                              <td className="py-1 pr-4 text-right">{part.quantity}</td>
                              <td className="py-1 pr-4 text-right">{parseFloat(part.unit_price).toFixed(2)} €</td>
                              <td className="py-1 text-right font-medium">{(part.quantity * parseFloat(part.unit_price || 0)).toFixed(2)} €</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Labor cost */}
                  {svc.labor_cost > 0 && (
                    <div className="flex justify-between text-sm pt-2 border-t mt-2">
                      <span className="text-gray-500">{t('Cijena rada', 'Labor Cost')}</span>
                      <span className="font-medium">{parseFloat(svc.labor_cost).toFixed(2)} €</span>
                    </div>
                  )}

                  {/* Total */}
                  {svc.total_cost > 0 && (
                    <div className="flex justify-between pt-2 border-t mt-2">
                      <span className="font-bold text-gray-900">{t('UKUPNO', 'TOTAL')}</span>
                      <span className="font-bold text-gray-900">{parseFloat(svc.total_cost).toFixed(2)} €</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t-2 border-gray-900 text-center text-sm text-gray-500">
          <p>JoleDrive d.o.o - {t('Evidencija vozila', 'Vehicle Records')}</p>
          <p className="mt-1">{t('Ovaj dokument je automatski generiran iz sustava JoleDrive.', 'This document was automatically generated.')}</p>
        </div>
      </div>
    </div>
  )
}
