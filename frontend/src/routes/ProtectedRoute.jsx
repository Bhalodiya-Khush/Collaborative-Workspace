import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useWorkspace } from '../context/useWorkspace';

function ProtectedRoute({ allowedRoles, allowedProjectRoles }) {
  const { isAuthenticated, loading } = useAuth();
  const {
    workspaceRole,
    projectRoles,
    loading: workspaceLoading,
    projectsLoading,
  } = useWorkspace();

  if (
    loading
    || ((allowedRoles || allowedProjectRoles) && workspaceLoading)
    || (allowedProjectRoles && projectsLoading)
  ) {
    return <p>Loading...</p>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const hasAllowedWorkspaceRole = allowedRoles?.includes(workspaceRole);
  const hasAllowedProjectRole = allowedProjectRoles
    && projectRoles.some((role) => allowedProjectRoles.includes(role));
  if ((allowedRoles || allowedProjectRoles) && !hasAllowedWorkspaceRole && !hasAllowedProjectRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default ProtectedRoute;