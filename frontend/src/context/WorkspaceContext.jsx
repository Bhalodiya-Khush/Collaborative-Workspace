import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from './useAuth';
import { WorkspaceContext } from './workspace-context';

export function WorkspaceProvider({ children }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [projectSnapshot, setProjectSnapshot] = useState({ userId: '', projects: [] });
  const [loading, setLoading] = useState(true);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(
    () => localStorage.getItem('selectedWorkspaceId') || ''
  );

  const refreshWorkspaces = useCallback(async () => {
    if (authLoading) return [];
    if (!isAuthenticated) {
      setWorkspaces([]);
      setSelectedWorkspaceId('');
      localStorage.removeItem('selectedWorkspaceId');
      setLoading(false);
      return [];
    }

    setLoading(true);
    try {
      const response = await api.get('/workspaces');
      const accessibleWorkspaces = response.data || [];
      setWorkspaces(accessibleWorkspaces);
      const storedWorkspaceId = localStorage.getItem('selectedWorkspaceId') || '';
      if (!accessibleWorkspaces.some((workspace) => workspace._id === storedWorkspaceId)) {
        setSelectedWorkspaceId('');
        localStorage.removeItem('selectedWorkspaceId');
      } else {
        setSelectedWorkspaceId(storedWorkspaceId);
      }
      return accessibleWorkspaces;
    } catch (error) {
      setWorkspaces([]);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    queueMicrotask(() => {
      refreshWorkspaces().catch((error) => {
        console.error('Workspace memberships could not be refreshed:', error);
      });
    });
  }, [refreshWorkspaces]);

  useEffect(() => {
    if (authLoading || !isAuthenticated) return undefined;

    let cancelled = false;
    api.get('/projects')
      .then((response) => {
        if (!cancelled) {
          setProjectSnapshot({ userId: String(user?._id), projects: response.data || [] });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setProjectSnapshot({ userId: String(user?._id), projects: [] });
          console.error('Project memberships could not be refreshed:', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, user?._id]);

  const selectWorkspace = (workspaceId) => {
    if (!workspaceId) {
      setSelectedWorkspaceId('');
      localStorage.removeItem('selectedWorkspaceId');
      return;
    }
    setSelectedWorkspaceId(workspaceId);
    localStorage.setItem('selectedWorkspaceId', workspaceId);
  };

  const selectedWorkspace = workspaces.find(
    (workspace) => workspace._id === selectedWorkspaceId
  ) || null;
  const selectedMembership = selectedWorkspace?.members?.find(
    (member) => String(member._id) === String(user?._id)
  );
  const workspaceRole = selectedWorkspace
    && String(selectedWorkspace.owner?._id || selectedWorkspace.owner) === String(user?._id)
    ? 'admin'
    : selectedMembership?.role || null;
  const projects = projectSnapshot.userId === String(user?._id)
    ? projectSnapshot.projects
    : [];
  const projectsLoading = isAuthenticated
    && projectSnapshot.userId !== String(user?._id);
  const projectRoles = projects
    .filter((project) => String(project.workspace?._id || project.workspace) === String(selectedWorkspace?._id))
    .map((project) => project.currentUserRole);

  const value = useMemo(() => ({
    workspaces,
    projectRoles,
    projectsLoading,
    loading,
    selectedWorkspace,
    selectedWorkspaceId: selectedWorkspace?._id || '',
    workspaceRole,
    selectWorkspace,
    refreshWorkspaces,
  }), [
    workspaces,
    projectRoles,
    projectsLoading,
    loading,
    selectedWorkspace,
    workspaceRole,
    refreshWorkspaces,
  ]);

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}
