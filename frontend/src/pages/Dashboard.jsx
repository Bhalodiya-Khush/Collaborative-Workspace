import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  FolderKanban,
  ListTodo,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [workspacesResponse, projectsResponse] = await Promise.all([
          api.get('/workspaces'),
          api.get('/projects'),
        ]);

        setWorkspaces(workspacesResponse.data || []);
        setProjects(projectsResponse.data || []);
      } catch (requestError) {
        console.error('Dashboard loading failed:', requestError);
        setError(
          requestError.response?.data?.message ||
          'Your workspaces and projects could not be loaded.'
        );
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const statCards = [
    { title: 'Workspaces', value: workspaces.length, icon: Briefcase, link: '/workspaces' },
    { title: 'Projects', value: projects.length, icon: FolderKanban, link: '/projects' },
    {
      title: 'In Progress',
      value: projects.filter((project) => project.status === 'in_progress').length,
      icon: Clock3,
      link: '/projects',
    },
    {
      title: 'Completed',
      value: projects.filter((project) => project.status === 'completed').length,
      icon: CheckCircle2,
      link: '/projects',
    },
  ];

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
          <span className="eyebrow">COLLABORATIVE WORKSPACE</span>
          <h1>Your Dashboard</h1>
          <p>
            Welcome, <strong>{user?.fullName || 'User'}</strong>. See the workspaces
            and projects available to you.
          </p>
        </div>

        <div className="dashboard-actions">
          <button className="secondary-button" onClick={() => navigate('/workspaces')}>
            <Briefcase size={17} />
            View Workspaces
          </button>
          <button className="primary-button" onClick={() => navigate('/projects')}>
            <FolderKanban size={17} />
            View Projects
          </button>
        </div>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

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
              <h3>Projects</h3>
              <p>Projects you can access</p>
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
                    <span>{project.workspace?.name || project.projectManager?.fullName || 'Project team'}</span>
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

            {projects.length === 0 && !error && (
              <div className="empty-state">
                <FolderKanban size={28} />
                <p>No projects are available for your account yet.</p>
              </div>
            )}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="card-header">
            <div>
              <h3>Workspaces</h3>
              <p>Workspaces you can access</p>
            </div>

            <button className="text-button" onClick={() => navigate('/workspaces')}>
              View all
            </button>
          </div>

          <div className="project-list">
            {workspaces.slice(0, 5).map((workspace) => (
              <button
                className="project-item project-item-button"
                key={workspace._id}
                onClick={() => navigate('/workspaces')}
              >
                <div className="project-info">
                  <div>
                    <strong>{workspace.name}</strong>
                    <span>{workspace.description || 'Collaborative workspace'}</span>
                  </div>
                  <strong>{(workspace.projects || []).length} projects</strong>
                </div>
              </button>
            ))}

            {workspaces.length === 0 && !error && (
              <div className="empty-state">
                <Briefcase size={28} />
                <p>No workspaces are available for your account yet.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="quick-action-grid" style={{ marginTop: '20px' }}>
        <button onClick={() => navigate('/tasks')}><ListTodo size={18} /> Tasks</button>
        <button onClick={() => navigate('/meetings')}><Video size={18} /> Meetings</button>
        <button onClick={() => navigate('/projects')}><FolderKanban size={18} /> Projects</button>
        <button onClick={() => navigate('/workspaces')}><Briefcase size={18} /> Workspaces</button>
      </div>
    </div>
  );
}

export default Dashboard;
