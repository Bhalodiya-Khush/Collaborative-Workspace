import {
  Plus,
  Users,
  FolderKanban,
  Activity,
  Shield,
  Crown,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useWorkspace } from '../context/useWorkspace';
import api from '../services/api';

function Workspaces() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const { selectedWorkspaceId, workspaceRole, selectWorkspace, refreshWorkspaces } = useWorkspace();
  const [workspaces, setWorkspaces] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await api.get('/workspaces');
      setWorkspaces(response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Workspaces could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(loadWorkspaces);
  }, [loadWorkspaces]);

  useEffect(() => {
    if (selectedWorkspaceId && workspaceRole === 'admin') {
      api.get('/users', { params: { workspaceId: selectedWorkspaceId, available: 'true' } })
        .then((response) => setAllUsers(response.data || []))
        .catch((requestError) => {
          setError(requestError.response?.data?.message || 'Available members could not be loaded.');
        });
    }
  }, [selectedWorkspaceId, workspaceRole]);

  const createWorkspace = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/workspaces', {
        name: formData.get('name'),
        description: formData.get('description'),
      });
      if (response.data?.user) {
        updateUser(response.data.user);
      }
      setSuccess(`Workspace "${response.data.workspace.name}" created! You are now the Workspace Admin.`);
      event.currentTarget.reset();
      setShowForm(false);
      const accessibleWorkspaces = await refreshWorkspaces();
      selectWorkspace(response.data.workspace._id);
      await loadWorkspaces();
      const currentWorkspaceId = response.data.workspace._id;
      if (accessibleWorkspaces.some((workspace) => workspace._id === currentWorkspaceId)) {
        api.get('/users', { params: { workspaceId: currentWorkspaceId, available: 'true' } })
          .then((res) => setAllUsers(res.data || []))
          .catch((requestError) => setError(requestError.response?.data?.message || 'Available members could not be loaded.'));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Workspace could not be created.');
    }
  };

  const addMember = async (event, workspaceId) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const form = event.currentTarget;
    const userId = new FormData(form).get('userId');
    try {
      await api.post(`/workspaces/${workspaceId}/members`, { userId });
      setSuccess('Member added to workspace successfully.');
      form.reset();
      await loadWorkspaces();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Member could not be added.');
    }
  };

  const changeMemberRole = async (workspaceId, memberId, newRole) => {
    setError('');
    setSuccess('');
    try {
      await api.patch(`/workspaces/${workspaceId}/role`, {
        userId: memberId,
        role: newRole,
      });
      setSuccess('Member role updated successfully in this workspace.');
      await loadWorkspaces();
      await refreshWorkspaces();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Role change failed.');
    }
  };

  const totalMembers = new Set(
    workspaces.flatMap((workspace) => (workspace.members || []).map((member) => member._id))
  ).size;
  const totalProjects = workspaces.reduce(
    (count, workspace) => count + (workspace.projects || []).length,
    0
  );

  return (
    <div className="workspaces-page">
      <div className="page-header">
        <div>
          <h1>Workspaces</h1>
          <p>
            Create and manage collaborative team workspaces. Any workspace creator is its Workspace Admin.
          </p>
        </div>

        <button
          className="primary-button"
          onClick={() => setShowForm((visible) => !visible)}
        >
          <Plus size={17} /> Create Workspace
        </button>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="auth-success" role="status" style={{ background: '#e2f3eb', color: '#183d35', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #c2e2d5', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={18} color="#183d35" />{success}</p>}

      {showForm && (
        <form className="entity-form" onSubmit={createWorkspace}>
          <h3>Create New Workspace</h3>
          <p style={{ fontSize: '13px', color: '#5f6e67', marginBottom: '16px' }}>
            As creator, you will become the <strong>Workspace Admin</strong> with full authority to add projects, assign project managers, and manage members.
          </p>
          <label>
            Workspace Name
            <input name="name" placeholder="e.g. Engineering Alpha, Mobile Division" required maxLength={100} />
          </label>
          <label>
            Description
            <textarea name="description" placeholder="Briefly describe what this workspace is dedicated to..." rows="3" />
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="primary-button" type="submit">Create Workspace & Become Admin</button>
            <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
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
            <span>Active Members</span>
          </div>
        </div>

        <div className="overview-card">
          <div className="overview-icon">
            <Activity size={20} />
          </div>
          <div>
            <strong>{totalProjects}</strong>
            <span>Active Projects</span>
          </div>
        </div>
      </div>

      {loading ? (
        <p>Loading workspaces...</p>
      ) : workspaces.length === 0 ? (
        <div className="empty-state">
          <FolderKanban size={28} />
          <p>No workspaces are available for your account. Click "Create Workspace" above to start one!</p>
        </div>
      ) : (
        <div className="workspace-grid">
          {workspaces.map((workspace) => {
            const isOwner =
              (workspace.owner?._id || workspace.owner)?.toString() === user?._id?.toString();
            const currentMembership = (workspace.members || []).find(
              (member) => String(member._id) === String(user?._id)
            );
            const role = isOwner ? 'admin' : currentMembership?.role;
            const canManageWorkspace = role === 'admin';

            return (
              <div className="workspace-card" key={workspace._id}>
                <div className="workspace-card-top">
                  <div className="workspace-icon">
                    {workspace.name.charAt(0).toUpperCase()}
                  </div>

                  {role === 'admin' ? (
                    <span className="workspace-owner-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: '#faede6', color: '#d9764e', border: '1px solid #f6b27e', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>
                      <Crown size={14} /> Workspace Admin
                    </span>
                  ) : (
                    <span className="workspace-member-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: '#edf1eb', color: '#183d35', border: '1px solid #d7dfd6', borderRadius: '20px', fontSize: '12px', fontWeight: '600' }}>
                      <UserCheck size={14} /> {role?.replace('_', ' ') || 'Member'}
                    </span>
                  )}
                </div>

                <h3>{workspace.name}</h3>

                <p className="workspace-description">
                  {workspace.description || 'Collaborative team workspace.'}
                </p>

                <div style={{ fontSize: '12px', color: '#5f6e67', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} color="#183d35" />
                  <span>Admin: <strong>{workspace.owner?.fullName || 'Workspace Administrator'}</strong></span>
                </div>

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

                <button
                  className="open-workspace-button"
                  type="button"
                  onClick={() => {
                    selectWorkspace(workspace._id);
                    navigate('/projects');
                  }}
                  style={{ marginTop: '14px' }}
                >
                  <FolderKanban size={15} /> Open Workspace
                </button>

                {/* MEMBERS MANAGEMENT */}
                <div className="workspace-members-section" style={{ borderTop: '1px solid #d7dfd6', paddingTop: '14px', marginTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <strong style={{ fontSize: '13px', color: '#183d35' }}>Workspace Members & Roles</strong>
                    <span style={{ fontSize: '12px', color: '#5f6e67' }}>{(workspace.members || []).length} total</span>
                  </div>

                  <div className="workspace-members-chips" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', paddingRight: '4px' }}>
                    {(workspace.members || []).map((member) => {
                      const isMemberOwner =
                        member._id?.toString() === (workspace.owner?._id || workspace.owner)?.toString();

                      return (
                        <div
                          key={member._id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            background: '#fbfaf6',
                            border: '1px solid #e5ece4',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        >
                          <div>
                            <strong>{member.fullName}</strong>
                            <span style={{ color: '#5f6e67', marginLeft: '6px', fontSize: '11px' }}>
                              ({member.role?.replace('_', ' ')})
                            </span>
                          </div>

                          {canManageWorkspace && !isMemberOwner ? (
                            <select
                              value={member.role || 'developer'}
                              onChange={(e) => changeMemberRole(workspace._id, member._id, e.target.value)}
                              style={{
                                fontSize: '11px',
                                padding: '3px 8px',
                                border: '1px solid #d7dfd6',
                                borderRadius: '4px',
                                background: '#ffffff',
                                color: '#183d35',
                                cursor: 'pointer',
                              }}
                              aria-label={`Change role for ${member.fullName}`}
                            >
                              <option value="developer">Developer</option>
                              <option value="project_manager">Project Manager</option>
                              <option value="admin">Workspace Admin</option>
                            </select>
                          ) : isMemberOwner ? (
                            <span style={{ color: '#d9764e', fontWeight: '700', fontSize: '11px' }}>Owner</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ADD MEMBER FORM (FOR WORKSPACE ADMIN ONLY) */}
                {canManageWorkspace && workspace._id === selectedWorkspaceId && (
                  <form
                    className="workspace-add-member"
                    onSubmit={(event) => addMember(event, workspace._id)}
                    style={{ marginTop: '14px' }}
                  >
                    <select
                      name="userId"
                      required
                      defaultValue=""
                      aria-label={`Add a member to ${workspace.name}`}
                    >
                      <option value="" disabled>Select user to add as member</option>
                      {allUsers
                        .filter(
                          (account) =>
                            !(workspace.members || []).some(
                              (member) => (member._id || member) === account._id
                            )
                        )
                        .map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.fullName} ({account.email})
                          </option>
                        ))}
                    </select>
                    <button className="open-workspace-button" type="submit">
                      <Plus size={15} /> Add Member
                    </button>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Workspaces;