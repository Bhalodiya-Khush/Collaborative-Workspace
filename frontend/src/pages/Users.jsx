import {
  Search,
  ShieldCheck,
  UserCheck,
  UserX,
  Mail,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/users')
      .then((response) => setUsers(response.data || []))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Users could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const updateRole = async (accountId, role) => {
    setError('');
    try {
      const response = await api.patch(`/users/${accountId}/role`, { role });
      setUsers((current) => current.map((account) => account._id === accountId ? response.data.user : account));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'User role could not be updated.');
    }
  };

  const visibleUsers = users.filter((account) => (
    `${account.fullName} ${account.email} ${account.role}`.toLowerCase().includes(search.toLowerCase())
    && (roleFilter === 'all' || account.role === roleFilter)
    && (statusFilter === 'all' || (statusFilter === 'active') === account.isActive)
  ));
  const activeCount = users.filter((account) => account.isActive).length;

  return (
    <div>

      {/* HEADER */}

      <div className="page-header">

        <div>
          <h1>Users</h1>
          <p>
            Manage workspace members, roles and access.
          </p>
        </div>

      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      {/* STATISTICS */}

      <div className="users-summary">

        <div className="user-summary-card">
          <div className="user-summary-icon">
            <UserCheck size={20} />
          </div>

          <div>
            <strong>{users.length}</strong>
            <span>Total Users</span>
          </div>
        </div>

        <div className="user-summary-card">
          <div className="user-summary-icon">
            <ShieldCheck size={20} />
          </div>

          <div>
            <strong>{users.filter((account) => account.role === 'admin').length}</strong>
            <span>Administrators</span>
          </div>
        </div>

        <div className="user-summary-card">
          <div className="user-summary-icon">
            <UserCheck size={20} />
          </div>

          <div>
            <strong>{activeCount}</strong>
            <span>Active Users</span>
          </div>
        </div>

        <div className="user-summary-card">
          <div className="user-summary-icon">
            <UserX size={20} />
          </div>

          <div>
            <strong>{users.length - activeCount}</strong>
            <span>Inactive Users</span>
          </div>
        </div>

      </div>

      {/* USER TABLE */}

      <div className="users-card">

        <div className="users-toolbar">

          <div className="users-search">
            <Search size={17} />

            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select className="users-filter" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="developer">Developer</option>
            <option value="project_manager">Project Manager</option>
          </select>

          <select className="users-filter" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

        </div>

        <div className="users-table">

          <div className="user-row user-table-header">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span>Projects</span>
            <span>Joined</span>
            <span>Action</span>
          </div>

          {loading ? <p>Loading users...</p> : visibleUsers.map((user) => (

            <div
              className="user-row"
              key={user.email}
            >

              {/* USER */}

              <div className="user-profile">

                <div className="user-avatar">
                  {user.fullName?.charAt(0).toUpperCase() || '?'}
                </div>

                <div>
                  <strong>{user.fullName}</strong>

                  <span>
                    <Mail size={11} />
                    {user.email}
                  </span>
                </div>

              </div>

              {/* ROLE */}

              <span>
                <span
                  className={`user-role ${user.role
                    .replace('_', '-')}`}
                >
                  {user.role?.replace('_', ' ')}
                </span>
              </span>

              {/* STATUS */}

              <span>

                <span
                  className={`user-status ${
                    user.isActive
                      ? 'active'
                      : 'inactive'
                  }`}
                >
                  <span className="status-dot"></span>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>

              </span>

              {/* PROJECTS */}

              <span className="user-project-count">
                {(user.projectIds || []).length}
              </span>

              {/* JOINED */}

              <span className="user-joined">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>

              {/* ACTION */}

              {currentUser?.role === 'admin' && currentUser._id !== user._id ? (
                <select className="users-filter" value={user.role} onChange={(event) => updateRole(user._id, event.target.value)} aria-label={`Role for ${user.fullName}`}>
                  <option value="admin">Admin</option>
                  <option value="project_manager">Project Manager</option>
                  <option value="developer">Developer</option>
                </select>
              ) : <span className="user-joined">{currentUser?._id === user._id ? 'You' : 'View only'}</span>}

            </div>

          ))}

        </div>

        {/* FOOTER */}

        <div className="users-footer">

          <span>Showing {visibleUsers.length} of {users.length} users</span>

        </div>

      </div>

    </div>
  );
}

export default Users;