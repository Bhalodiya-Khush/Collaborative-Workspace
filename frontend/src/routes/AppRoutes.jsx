import { Routes, Route, Navigate } from 'react-router-dom';

import MainLayout from '../layouts/MainLayout';
import Users from '../pages/Users';
import Dashboard from '../pages/Dashboard';
import Projects from '../pages/Projects';
import Tasks from '../pages/Tasks';
import Workspaces from '../pages/Workspaces';
import Submissions from '../pages/Submissions';
import Meetings from '../pages/Meetings';
import Messages from '../pages/Messages';
import Notifications from '../pages/Notifications';
import Monitoring from '../pages/Monitoring';
import Reports from '../pages/Reports';
import Profile from '../pages/Profile';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ProtectedRoute from './ProtectedRoute';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>

          <Route
            path="/"
            element={<Navigate to="/dashboard" replace />}
          />

          <Route
            path="/dashboard"
            element={<Dashboard />}
          />

          <Route
            path="/workspaces"
            element={<Workspaces />}
          />

          <Route
            path="/projects"
            element={<Projects />}
          />

          <Route
            path="/tasks"
            element={<Tasks />}
          />

          <Route
            path="/submissions"
            element={<Submissions />}
          />

          <Route
            path="/meetings"
            element={<Meetings />}
          />

          <Route
            path="/messages"
            element={<Messages />}
          />

          <Route
            path="/notifications"
            element={<Notifications />}
          />

          <Route
            path="/profile"
            element={<Profile />}
          />

          <Route
            path="/settings"
            element={<Profile />}
          />

          <Route element={<ProtectedRoute allowedRoles={['admin', 'project_manager']} />}>
            <Route
              path="/users"
              element={<Users />}
            />
          </Route>

          <Route element={(
            <ProtectedRoute
              allowedRoles={['admin', 'project_manager']}
              allowedProjectRoles={['admin', 'project_manager']}
            />
          )}>
            <Route
              path="/monitoring"
              element={<Monitoring />}
            />
            <Route
              path="/reports"
              element={<Reports />}
            />
          </Route>

        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default AppRoutes;