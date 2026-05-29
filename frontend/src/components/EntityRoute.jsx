import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function EntityRoute({ children, entity }) {
  const { user, loading, hasEntityAccess, getVisibleEntities } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!hasEntityAccess(entity)) {
    const visible = getVisibleEntities()
    if (visible.length > 0 && visible[0] !== entity) {
      return <Navigate to={`/${visible[0] === 'dashboard' ? '' : visible[0]}`} replace />
    }
    return <Navigate to="/login" replace />
  }

  return children
}