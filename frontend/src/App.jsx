import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import EntityRoute from './components/EntityRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Vehicles from './pages/Vehicles'
import VehicleDetail from './pages/VehicleDetail'
import Documents from './pages/Documents'
import Services from './pages/Services'
import Invoices from './pages/Invoices'
import Users from './pages/Users'
import Warehouse from './pages/Warehouse'
import Settings from './pages/Settings'
import VehicleProfitPage from './pages/VehicleProfit'
import ServiceBook from './pages/ServiceBook'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={
        user ? <Navigate to="/dashboard" replace /> : <Login />
      } />
      <Route path="/" element={
        <ProtectedRoute>
          <EntityRoute entity="dashboard">
            <Layout><Dashboard /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <EntityRoute entity="dashboard">
            <Layout><Dashboard /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/vehicles" element={
        <ProtectedRoute>
          <EntityRoute entity="vehicles">
            <Layout><Vehicles /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/vehicles/:id" element={
        <ProtectedRoute>
          <EntityRoute entity="vehicles">
            <Layout><VehicleDetail /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/vehicles/:vehicleId/service-book" element={
        <ProtectedRoute>
          <EntityRoute entity="vehicles">
            <ServiceBook />
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/documents" element={
        <ProtectedRoute>
          <EntityRoute entity="documents">
            <Layout><Documents /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/services" element={
        <ProtectedRoute>
          <EntityRoute entity="services">
            <Layout><Services /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/invoices" element={
        <ProtectedRoute>
          <EntityRoute entity="invoices">
            <Layout><Invoices /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute>
          <EntityRoute entity="users">
            <Layout><Users /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/warehouse" element={
        <ProtectedRoute>
          <EntityRoute entity="warehouse">
            <Layout><Warehouse /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/profit" element={
        <ProtectedRoute>
          <EntityRoute entity="dashboard">
            <Layout><VehicleProfitPage /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <EntityRoute entity="settings">
            <Layout><Settings /></Layout>
          </EntityRoute>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App