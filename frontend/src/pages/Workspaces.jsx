import {
  Plus,
  MoreHorizontal,
  Users,
  FolderKanban,
  Activity,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Workspaces() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkspaces = async () => {
    try {
      const response = await api.get('/workspaces');
      setWorkspaces(response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Workspaces could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/workspaces')
      .then((response) => setWorkspaces(response.data || []))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Workspaces could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    api.get('/users')
      .then((response) => setAllUsers(response.data || []))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Workspace members could not be loaded.'));
  }, [user?.role]);

  const createWorkspace = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError('');
    try {
      await api.post('/workspaces', {
        name: formData.get('name'),
        description: formData.get('description'),
        owner: user._id,
        members: [user._id],
      });
      event.currentTarget.reset();
      setShowForm(false);
      await loadWorkspaces();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Workspace could not be created.');
    }
  };

  const addMember = async (event, workspaceId) => {
    event.preventDefault();
    const userId = new FormData(event.currentTarget).get('userId');
    try {
      await api.post(`/workspaces/${workspaceId}/members`, { userId });
      await loadWorkspaces();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Member could not be added.');
    }
  };

  const totalMembers = new Set(workspaces.flatMap((workspace) => (workspace.members || []).map((member) => member._id))).size;
  const totalProjects = workspaces.reduce((count, workspace) => count + (workspace.projects || []).length, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Workspaces</h1>
          <p>Create and manage collaborative team workspaces.</p>
        </div>

        {user?.role === 'admin' && <button className="primary-button" onClick={() => setShowForm((visible) => !visible)}><Plus size={17} />Create Workspace</button>}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {showForm && (
        <form className="entity-form" onSubmit={createWorkspace}>
          <h3>New workspace</h3>
          <label>Workspace name<input name="name" required maxLength={100} /></label>
          <label>Description<textarea name="description" rows="3" /></label>
          <button className="primary-button" type="submit">Create workspace</button>
        </form>
      )}

      <div className="workspace-overview">
        <div className="overview-card">
          <div className="overview-icon">
            <FolderKanban size={20} />
          </div>
          <div>
            <strong>{workspaces.length}</strong>
            <span>Total Workspaces</span>
          </div>
        </div>

        <div className="overview-card">
          <div className="overview-icon">
            <Users size={20} />
          </div>
          <div>
            <strong>{totalMembers}</strong>
            <span>Total Members</span>
          </div>
        </div>

        <div className="overview-card">
          <div className="overview-icon">
            <Activity size={20} />
          </div>
          <div>
            <strong>{totalProjects}</strong>
            <span>Projects</span>
          </div>
        </div>
      </div>

      {loading ? <p>Loading workspaces...</p> : workspaces.length === 0 ? <div className="empty-state"><FolderKanban size={28} /><p>No workspaces are available for your account.</p></div> : <div className="workspace-grid">
        {workspaces.map((workspace) => (
          <div className="workspace-card" key={workspace._id}>

            <div className="workspace-card-top">
              <div className="workspace-icon">
                {workspace.name.charAt(0)}
              </div>

              <button className="more-button">
                <MoreHorizontal size={20} />
              </button>
            </div>

            <h3>{workspace.name}</h3>

            <p className="workspace-description">
              {workspace.description}
            </p>

            <div className="workspace-stats">

              <div>
                <Users size={16} />
                <span>{(workspace.members || []).length} Members</span>
              </div>

              <div>
                <FolderKanban size={16} />
                <span>{(workspace.projects || []).length} Projects</span>
              </div>

              <div>
                <Activity size={16} />
                <span>{workspace.status || 'active'}</span>
              </div>

            </div>

            <div className="workspace-members-list">
              <strong>Members</strong>
              <span>{(workspace.members || []).map((member) => member.fullName).filter(Boolean).join(', ') || 'No members'}</span>
            </div>
            {user?.role === 'admin' && <form className="workspace-add-member" onSubmit={(event) => addMember(event, workspace._id)}>
              <select name="userId" required defaultValue="" aria-label={`Add a member to ${workspace.name}`}>
                <option value="" disabled>Add workspace member</option>
                {allUsers.filter((account) => !(workspace.members || []).some((member) => member._id === account._id)).map((account) => <option key={account._id} value={account._id}>{account.fullName} · {account.role.replace('_', ' ')}</option>)}
              </select>
              <button className="open-workspace-button" type="submit"><Plus size={15} /> Add</button>
            </form>}

          </div>
        ))}
      </div>}
    </div>
  );
}

export default Workspaces;