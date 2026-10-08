import {
  LayoutDashboard,
  Briefcase,
  FolderKanban,
  CheckSquare,
  FileText,
  Video,
  MessageSquare,
  Bell,
  BarChart3,
  Users,
  Settings,
} from 'lucide-react';

import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/useAuth';

function Sidebar() {
  const { user } = useAuth();
  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Workspaces', path: '/workspaces', icon: Briefcase },
    { name: 'Projects', path: '/projects', icon: FolderKanban },
    { name: 'Tasks', path: '/tasks', icon: CheckSquare },
    { name: 'Submissions', path: '/submissions', icon: FileText },
    { name: 'Meetings', path: '/meetings', icon: Video },
    { name: 'Messages', path: '/messages', icon: MessageSquare },
    { name: 'Notifications', path: '/notifications', icon: Bell },
    { name: 'Monitoring', path: '/monitoring', icon: BarChart3, roles: ['admin', 'project_manager'] },
    { name: 'Reports', path: '/reports', icon: BarChart3, roles: ['admin', 'project_manager'] },
    { name: 'Users', path: '/users', icon: Users, roles: ['admin', 'project_manager'] },
  ];

  return (
    <aside className="sidebar">

      <div className="sidebar-logo">
        <div className="logo-box">CW</div>

        <div>
          <h2>Collaborative</h2>
          <span>Workspace</span>
        </div>
      </div>

      <div className="sidebar-section">

        <p className="section-title">
          MAIN MENU
        </p>

        {menuItems
          .filter((item) => !item.roles || item.roles.includes(user?.role))
          .map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                isActive
                  ? 'sidebar-link active'
                  : 'sidebar-link'
              }
            >
              <Icon size={19} />
              <span>{item.name}</span>
            </NavLink>
          );
          })}

      </div>

      <div className="sidebar-bottom">

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            isActive
              ? 'sidebar-link active'
              : 'sidebar-link'
          }
        >
          <Settings size={19} />
          <span>Settings</span>
        </NavLink>

      </div>

    </aside>
  );
}

export default Sidebar;