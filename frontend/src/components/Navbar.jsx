import {
  Search,
  Bell,
  UserCircle,
  LogOut,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useWorkspace } from '../context/useWorkspace';
import api from '../services/api';


function Navbar() {
  const { user, logout } = useAuth();
  const { workspaceRole, selectedWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.get('/notifications')
      .then((response) => setUnreadCount((response.data || []).filter((notification) => !notification.isRead).length))
      .catch(() => setUnreadCount(0));
  }, []);

  return (
    <header className="navbar">

      <div className="search-box">
        <Search size={18} />
        <input
          type="text"
          placeholder="Search anything..."
        />
      </div>

      <div className="navbar-right">

        <button className="icon-button" title="Notifications" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`} onClick={() => navigate('/notifications')}>
          <Bell size={20} />
          {unreadCount > 0 && <span className="notification-dot"></span>}
        </button>

        <div
          className="user-info"
          onClick={() => navigate('/profile')}
          title="View profile & settings"
          style={{ cursor: 'pointer' }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') navigate('/profile'); }}
        >
          <UserCircle size={34} />

          <div>
            <strong>
              {user?.fullName || user?.name || 'User'}
            </strong>

            <span>
              {selectedWorkspace
                ? `${selectedWorkspace.name} · ${workspaceRole?.replace('_', ' ') || 'Member'}`
                : 'Select a workspace'}
            </span>
          </div>
        </div>

        <button
          className="logout-button"
          onClick={logout}
          title="Logout"
        >
          <LogOut size={19} />
        </button>

      </div>
    </header>
  );
}

export default Navbar;