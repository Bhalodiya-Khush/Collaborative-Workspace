import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  Plus,
  Users,
  X,
  Shield,
  Search,
} from 'lucide-react';
import { useWorkspace } from '../context/useWorkspace';
import api from '../services/api';

function Projects() {
  const { selectedWorkspaceId, workspaceRole } = useWorkspace();
  const [projects, setProjects] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadProjects = useCallback(async () => {
    try {
      const [projectsResponse, workspacesResponse] = await Promise.all([
        api.get('/projects'),
        api.get('/workspaces'),
      ]);
      const accessibleProjects = projectsResponse.data || [];
      setProjects(selectedWorkspaceId
        ? accessibleProjects.filter((project) => String(project.workspace?._id || project.workspace) === selectedWorkspaceId)
        : accessibleProjects);
      setWorkspaces(workspacesResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Projects could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    queueMicrotask(loadProjects);
  }, [loadProjects]);

  const openForm = async () => {
    setError('');
    setSuccess('');
    try {
      if (!selectedWorkspaceId) {
        setError('Select a workspace before creating a project.');
        return;
      }
      const response = await api.get(`/workspaces/${selectedWorkspaceId}/members`);
      setUsers(response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Team members could not be loaded.');
      return;
    }
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    const formData = new FormData(event.currentTarget);

    try {
      await api.post('/projects', {
        name: formData.get('name'),
        description: formData.get('description'),
        workspace: formData.get('workspace'),
        projectManager: formData.get('projectManager'),
        developers: formData.getAll('developers'),
        status: 'planning',
      });
      event.currentTarget.reset();
      setShowForm(false);
      setSuccess('Project created and assigned successfully.');
      await loadProjects();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Project could not be created.');
    } finally {
      setSaving(false);
    }
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.workspace?.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="projects-page">
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p>
            {workspaceRole === 'developer'
              ? 'Projects where you are assigned as developer. Track progress and deliverables.'
              : 'Create, organize and oversee projects within your workspaces.'}
          </p>
        </div>

        {workspaceRole === 'admin' && (
          <button className="primary-button" onClick={openForm}>
            <Plus size={17} /> Create Project
          </button>
        )}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="auth-success" role="status" style={{ background: '#e2f3eb', color: '#183d35', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #c2e2d5', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={18} color="#183d35" />{success}</p>}

      {/* SEARCH / FILTER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '22px' }}>
        <div style={{ position: 'relative', width: 'min(360px, 100%)' }}>
          <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#5f6e67' }} />
          <input
            type="text"
            placeholder="Search projects by name or workspace..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: '6px', border: '1px solid #d7dfd6', background: '#ffffff', fontSize: '13px', color: '#202a26' }}
          />
        </div>
      </div>

      {/* CREATE PROJECT FORM */}
      {showForm && (
        <form className="dashboard-card project-create-form" onSubmit={handleSubmit} style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <div>
              <h3>New Project</h3>
              <p>Assign project to a workspace, designate a Project Manager and add Developers.</p>
            </div>
            <button
              type="button"
              className="more-button"
              aria-label="Close form"
              onClick={() => setShowForm(false)}
            >
              <X size={18} />
            </button>
          </div>

          <label>Project Name
            <input name="name" placeholder="e.g. Core API Redesign, Mobile Application v2" required maxLength={120} />
          </label>

          <label>Description & Scope
            <textarea name="description" placeholder="Project deliverables, goals and overview..." rows="3" />
          </label>

          <label>Workspace
            <select name="workspace" required defaultValue={selectedWorkspaceId}>
              <option value="" disabled>Select workspace</option>
              {workspaces.filter((workspace) => workspace._id === selectedWorkspaceId).map((workspace) => (
                <option key={workspace._id} value={workspace._id}>{workspace.name}</option>
              ))}
            </select>
          </label>

          <label>Project Manager
            <select name="projectManager" required defaultValue="">
              <option value="" disabled>Select Project Manager</option>
              {users
                .filter((account) => account.role === 'project_manager')
                .map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.fullName} ({account.email})
                  </option>
                ))}
            </select>
          </label>

          <label>Developers (Hold Ctrl/Cmd to select multiple)
            <select name="developers" multiple size="4">
              {users
                .filter((account) => account.role === 'developer')
                .map((account) => (
                  <option key={account._id} value={account._id}>
                    {account.fullName} ({account.email})
                  </option>
                ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
            <button
              className="primary-button"
              type="submit"
              disabled={saving || workspaces.length === 0}
            >
              {saving ? 'Creating...' : 'Create & Assign Project'}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p>Loading projects...</p>
      ) : filteredProjects.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={28} />
          <p>No projects match your criteria.</p>
        </div>
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => (
            <article className="project-card" key={project._id}>
              <div className="project-card-top">
                <div className="project-icon">{project.name.charAt(0).toUpperCase()}</div>
                <span className="project-status">
                  <span>{project.status?.replace('_', ' ') || 'Planning'}</span>
                </span>
              </div>

              <h3>{project.name}</h3>
              <p className="project-description">
                Your project role: <strong>{project.currentUserRole?.replace('_', ' ') || 'Member'}</strong>
              </p>

              <p className="project-description">
                {project.description || 'No description provided.'}
              </p>

              {/* PROJECT MANAGER BADGE */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#183d35', background: '#faede6', padding: '6px 10px', borderRadius: '6px', marginBottom: '14px', border: '1px solid #f6b27e' }}>
                <Shield size={14} color="#d9764e" />
                <span>PM: <strong>{project.projectManager?.fullName || 'Unassigned'}</strong></span>
              </div>

              {/* PROGRESS BAR & PERCENTAGE */}
              <div className="project-progress-header">
                <span>Completion Progress</span>
                <strong style={{ color: '#d9764e', fontSize: '15px' }}>{project.progress || 0}%</strong>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-value"
                  style={{ width: `${project.progress || 0}%`, background: 'linear-gradient(90deg, #183d35, #d9764e)' }}
                />
              </div>

              {/* METADATA */}
              <div className="project-meta">
                <div>
                  <Users size={15} />
                  <span>
                    {(project.developers || []).length + (project.projectManager ? 1 : 0)} team members
                  </span>
                </div>
                <div>
                  <CheckCircle2 size={15} />
                  <span>{project.workspace?.name || 'Workspace'}</span>
                </div>
                {project.endDate && (
                  <div>
                    <CalendarDays size={15} />
                    <span>{new Date(project.endDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {/* DEVELOPERS CHIPS */}
              {(project.developers || []).length > 0 && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #e5ece4', fontSize: '11px', color: '#5f6e67' }}>
                  <span>Developers: </span>
                  <strong>{project.developers.map((d) => d.fullName).filter(Boolean).join(', ') || `${project.developers.length} developers`}</strong>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Projects;