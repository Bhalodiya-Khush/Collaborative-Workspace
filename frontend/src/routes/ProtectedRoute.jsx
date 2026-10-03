import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

function ProtectedRoute({ allowedRoles }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <p>Loading...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;