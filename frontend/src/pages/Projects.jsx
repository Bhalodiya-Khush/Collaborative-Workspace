import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  FolderKanban,
  Plus,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [users, setUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadProjects = async () => {
    try {
      const [projectsResponse, workspacesResponse] = await Promise.all([
        api.get('/projects'),
        api.get('/workspaces'),
      ]);
      setProjects(projectsResponse.data || []);
      setWorkspaces(workspacesResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Projects could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([api.get('/projects'), api.get('/workspaces')])
      .then(([projectsResponse, workspacesResponse]) => {
        setProjects(projectsResponse.data || []);
        setWorkspaces(workspacesResponse.data || []);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Projects could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const openForm = async () => {
    setError('');
    try {
      const response = await api.get('/users');
      setUsers(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Project team members could not be loaded.');
      return;
    }
    setShowForm(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
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
      await loadProjects();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Project could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p>{user?.role === 'developer' ? 'Projects assigned to your account.' : 'Manage and track your team projects.'}</p>
        </div>
        {['admin', 'project_manager'].includes(user?.role) && (
          <button className="primary-button" onClick={openForm}>
            <Plus size={17} /> Create Project
          </button>
        )}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      {showForm && (
        <form className="dashboard-card project-create-form" onSubmit={handleSubmit}>
          <div className="card-header">
            <div><h3>New project</h3><p>Choose a workspace and project team.</p></div>
            <button type="button" className="more-button" aria-label="Close form" onClick={() => setShowForm(false)}><X size={18} /></button>
          </div>
          <label>Project name<input name="name" required maxLength={120} /></label>
          <label>Description<textarea name="description" rows="3" /></label>
          <label>Workspace
            <select name="workspace" required defaultValue="">
              <option value="" disabled>Select workspace</option>
              {workspaces.map((workspace) => <option key={workspace._id} value={workspace._id}>{workspace.name}</option>)}
            </select>
          </label>
          {user?.role === 'admin' && (
            <label>Project manager
              <select name="projectManager" required defaultValue="">
                <option value="" disabled>Select manager</option>
                {users.filter((account) => account.role === 'project_manager').map((account) => <option key={account._id} value={account._id}>{account.fullName}</option>)}
              </select>
            </label>
          )}
          <label>Developers
            <select name="developers" multiple size="4">
              {users.filter((account) => account.role === 'developer').map((account) => <option key={account._id} value={account._id}>{account.fullName}</option>)}
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={saving || workspaces.length === 0}>
            {saving ? 'Creating...' : 'Create project'}
          </button>
        </form>
      )}

      {loading ? <p>Loading projects...</p> : projects.length === 0 ? (
        <div className="empty-state"><FolderKanban size={28} /><p>No projects are available for your account.</p></div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <article className="project-card" key={project._id}>
              <div className="project-card-top"><div className="project-icon">{project.name.charAt(0)}</div><span className="project-status"><span>{project.status?.replace('_', ' ') || 'Planning'}</span></span></div>
              <h3>{project.name}</h3>
              <p className="project-description">{project.description || 'No description provided.'}</p>
              <div className="project-progress-header"><span>Progress</span><strong>{project.progress || 0}%</strong></div>
              <div className="progress-bar"><div className="progress-value" style={{ width: `${project.progress || 0}%` }} /></div>
              <div className="project-meta">
                <div><Users size={15} /><span>{(project.developers || []).length + (project.projectManager ? 1 : 0)} members</span></div>
                <div><CheckCircle2 size={15} /><span>{project.workspace?.name || 'Workspace'}</span></div>
                {project.endDate && <div><CalendarDays size={15} /><span>{new Date(project.endDate).toLocaleDateString()}</span></div>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default Projects;