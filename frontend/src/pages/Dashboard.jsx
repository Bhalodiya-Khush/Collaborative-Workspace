import {
  FolderKanban,
  Clock3,
  Users,
  Briefcase,
  FileCheck2,
  Video,
  ArrowUpRight,
  Plus,
  ListTodo,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/useAuth';
import api from '../services/api';

const roleLabels = {
  admin: 'Administrator',
  project_manager: 'Project Manager',
  developer: 'Developer',
};

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [dashboardResponse, projectsResponse] = await Promise.all([
          api.get('/dashboard'),
          api.get('/projects'),
        ]);

        setDashboard(dashboardResponse.data);
        setProjects(projectsResponse.data || []);
      } catch (error) {
        console.error('Dashboard loading failed:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const role = user?.role;
  const statCards = useMemo(() => {
    const stats = dashboard?.stats || {};
    if (role === 'admin') {
      return [
        { title: 'Total Users', value: stats.totalUsers ?? 0, icon: Users, link: '/users' },
        { title: 'Workspaces', value: stats.totalWorkspaces ?? 0, icon: Briefcase, link: '/workspaces' },
        { title: 'Projects', value: stats.totalProjects ?? 0, icon: FolderKanban, link: '/projects' },
        { title: 'Pending Reviews', value: stats.pendingSubmissions ?? 0, icon: FileCheck2, link: '/submissions' },
      ];
    }

    if (role === 'project_manager') {
      return [
        { title: 'My Projects', value: stats.totalProjects ?? 0, icon: FolderKanban, link: '/projects' },
        { title: 'Team Tasks', value: stats.totalTasks ?? 0, icon: ListTodo, link: '/tasks' },
        { title: 'Pending Tasks', value: stats.pendingTasks ?? 0, icon: Clock3, link: '/tasks' },
        { title: 'Pending Reviews', value: stats.pendingSubmissions ?? 0, icon: FileCheck2, link: '/submissions' },
      ];
    }

    return [
      { title: 'My Projects', value: stats.totalProjects ?? 0, icon: FolderKanban, link: '/projects' },
      { title: 'My Tasks', value: stats.totalTasks ?? 0, icon: ListTodo, link: '/tasks' },
      { title: 'Pending Tasks', value: stats.pendingTasks ?? 0, icon: Clock3, link: '/tasks' },
      { title: 'My Submissions', value: stats.mySubmissions ?? 0, icon: FileCheck2, link: '/submissions' },
    ];
  }, [role, dashboard?.stats]);

  const title = role === 'admin'
    ? 'Admin Control Center'
    : role === 'project_manager'
      ? 'Project Manager Dashboard'
      : 'Developer Workspace';

  const description = role === 'admin'
    ? 'Monitor the organization, users, workspaces and project activity.'
    : role === 'project_manager'
      ? 'Plan projects, manage your team and review development progress.'
      : 'Focus on your assigned projects, tasks, submissions and meetings.';

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="dashboard-hero">
        <div>
          <span className="eyebrow">{roleLabels[role] || 'Workspace Member'}</span>
          <h1>{title}</h1>
          <p>
            Welcome, <strong>{user?.fullName || 'User'}</strong>. {description}
          </p>
        </div>

        <div className="dashboard-actions">
          {(role === 'admin' || role === 'project_manager') && (
            <button className="secondary-button" onClick={() => navigate('/projects')}>
              <FolderKanban size={17} />
              View Projects
            </button>
          )}

          {role === 'admin' && (
            <button className="primary-button" onClick={() => navigate('/users')}>
              <Users size={17} />
              Manage Users
            </button>
          )}

          {role === 'project_manager' && (
            <button className="primary-button" onClick={() => navigate('/tasks')}>
              <Plus size={17} />
              Create Task
            </button>
          )}

          {role === 'developer' && (
            <button className="primary-button" onClick={() => navigate('/submissions')}>
              <FileCheck2 size={17} />
              My Submissions
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        {statCards.map((stat) => {
          const Icon = stat.icon;

          return (
            <button
              className="stat-card stat-card-button"
              key={stat.title}
              onClick={() => navigate(stat.link)}
            >
              <div className="stat-top">
                <div className="stat-icon">
                  <Icon size={21} />
                </div>
                <ArrowUpRight size={18} />
              </div>

              <h2>{stat.value}</h2>
              <p>{stat.title}</p>
            </button>
          );
        })}
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="card-header">
            <div>
              <h3>{role === 'developer' ? 'My Projects' : 'Active Projects'}</h3>
              <p>
                {role === 'developer'
                  ? 'Projects where you are a developer'
                  : 'Projects currently available to your role'}
              </p>
            </div>

            <button className="text-button" onClick={() => navigate('/projects')}>
              View all
            </button>
          </div>

          <div className="project-list">
            {projects.slice(0, 5).map((project) => (
              <button
                className="project-item project-item-button"
                key={project._id}
                onClick={() => navigate('/projects')}
              >
                <div className="project-info">
                  <div>
                    <strong>{project.name}</strong>
                    <span>
                      {project.projectManager?.fullName || 'Project team'}
                    </span>
                  </div>
                  <strong>{project.progress || 0}%</strong>
                </div>

                <div className="progress-bar">
                  <div
                    className="progress-value"
                    style={{ width: `${project.progress || 0}%` }}
                  />
                </div>
              </button>
            ))}

            {projects.length === 0 && (
              <div className="empty-state">
                <FolderKanban size={28} />
                <p>No projects are available for your account yet.</p>
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-card role-panel">
          <div className="card-header">
            <div>
              <h3>Quick Actions</h3>
              <p>Actions available to your role</p>
            </div>
          </div>

          <div className="quick-action-grid">
            {role === 'admin' && (
              <>
                <button onClick={() => navigate('/users')}><Users size={18} /> Manage users</button>
                <button onClick={() => navigate('/workspaces')}><Briefcase size={18} /> Workspaces</button>
                <button onClick={() => navigate('/monitoring')}><ArrowUpRight size={18} /> Monitoring</button>
                <button onClick={() => navigate('/reports')}><FileCheck2 size={18} /> Reports</button>
              </>
            )}

            {role === 'project_manager' && (
              <>
                <button onClick={() => navigate('/projects')}><FolderKanban size={18} /> Manage projects</button>
                <button onClick={() => navigate('/tasks')}><ListTodo size={18} /> Manage tasks</button>
                <button onClick={() => navigate('/submissions')}><FileCheck2 size={18} /> Review submissions</button>
                <button onClick={() => navigate('/meetings')}><Video size={18} /> Schedule meeting</button>
              </>
            )}

            {role === 'developer' && (
              <>
                <button onClick={() => navigate('/tasks')}><ListTodo size={18} /> My tasks</button>
                <button onClick={() => navigate('/submissions')}><FileCheck2 size={18} /> Submit work</button>
                <button onClick={() => navigate('/meetings')}><Video size={18} /> My meetings</button>
                <button onClick={() => navigate('/messages')}><Users size={18} /> Team chat</button>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;
