import {
  Activity,
  Users,
  Clock3,
  CheckCircle2,
  TrendingUp,
  MoreHorizontal,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../services/api';

function Monitoring() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/tasks')
      .then((response) => setTasks(response.data || []))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Monitoring data could not be loaded.'));
  }, []);

  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const completionRate = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const statusCounts = {
    todo: tasks.filter((task) => task.status === 'todo').length,
    in_progress: tasks.filter((task) => task.status === 'in_progress').length,
    in_review: tasks.filter((task) => task.status === 'in_review').length,
    completed: completedCount,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
  };
  const members = [...tasks.reduce((grouped, task) => {
    const assignee = task.assignee;
    if (!assignee?._id) return grouped;
    const member = grouped.get(assignee._id) || { ...assignee, tasks: 0, completed: 0 };
    member.tasks += 1;
    if (task.status === 'completed') member.completed += 1;
    grouped.set(assignee._id, member);
    return grouped;
  }, new Map()).values()];

  const exportReport = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), tasks }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'team-monitoring.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>

      <div className="page-header">

        <div>
          <h1>Monitoring</h1>
          <p>Monitor team productivity and project activity.</p>
        </div>

        <button className="primary-button" onClick={exportReport} disabled={!tasks.length}>
          Export Report
        </button>

      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}

      <div className="monitoring-stats">

        <div className="monitor-stat">
          <div className="monitor-icon">
            <Activity size={20} />
          </div>

          <span>Team Activity</span>
          <strong>{completionRate}%</strong>

          <small>
            <TrendingUp size={12} />
            Task completion rate
          </small>
        </div>

        <div className="monitor-stat">
          <div className="monitor-icon">
            <CheckCircle2 size={20} />
          </div>

          <span>Tasks Completed</span>
          <strong>{completedCount}</strong>

          <small>
            <TrendingUp size={12} />
            Of {tasks.length} visible tasks
          </small>
        </div>

        <div className="monitor-stat">
          <div className="monitor-icon">
            <Clock3 size={20} />
          </div>

          <span>In Progress</span>
          <strong>{statusCounts.in_progress}</strong>

          <small>
            Current task status
          </small>
        </div>

        <div className="monitor-stat">
          <div className="monitor-icon">
            <Users size={20} />
          </div>

          <span>Active Members</span>
          <strong>{members.length}</strong>

          <small>
            With assigned tasks
          </small>
        </div>

      </div>

      <div className="monitoring-grid">

        <div className="monitor-card">

          <div className="monitor-card-header">
            <div>
              <h3>Team Productivity</h3>
              <p>Weekly activity overview</p>
            </div>

            <button>
              <MoreHorizontal size={19} />
            </button>
          </div>

          <div className="productivity-chart">

            <div className="chart-bars">
              {Object.entries(statusCounts).map(([status, count]) => (
                <div key={status} style={{ height: `${Math.max(12, tasks.length ? count / tasks.length * 100 : 12)}%` }}>
                  <span>{status.replace('_', ' ')}</span>
                </div>
              ))}
            </div>

          </div>

        </div>

        <div className="monitor-card">

          <div className="monitor-card-header">
            <div>
              <h3>Task Distribution</h3>
              <p>Current task status</p>
            </div>
          </div>

          <div className="distribution">

            <div className="distribution-item">
              <span className="distribution-dot todo"></span>
              <span>To Do</span>
              <strong>{statusCounts.todo}</strong>
            </div>

            <div className="distribution-item">
              <span className="distribution-dot progress"></span>
              <span>In Progress</span>
              <strong>{statusCounts.in_progress}</strong>
            </div>

            <div className="distribution-item">
              <span className="distribution-dot review"></span>
              <span>Review</span>
              <strong>{statusCounts.in_review}</strong>
            </div>

            <div className="distribution-item">
              <span className="distribution-dot done"></span>
              <span>Completed</span>
              <strong>{statusCounts.completed}</strong>
            </div>

          </div>

        </div>

      </div>

      <div className="monitor-card team-performance">

        <div className="monitor-card-header">
          <div>
            <h3>Team Performance</h3>
            <p>Individual member productivity</p>
          </div>
        </div>

        <div className="performance-table">

          <div className="performance-row performance-header">
            <span>Member</span>
            <span>Tasks</span>
            <span>Completed</span>
            <span>Completion</span>
            <span>Activity</span>
          </div>

          {members.map((member) => (

            <div className="performance-row" key={member.name}>

              <div className="member-info">
                <div>{member.fullName?.charAt(0) || '?'}</div>

                <span>
                    <strong>{member.fullName}</strong>
                    <small>{member.role?.replace('_', ' ')}</small>
                </span>
              </div>

              <span>{member.tasks}</span>

              <span>{member.completed}</span>

              <span>{member.tasks ? Math.round(member.completed / member.tasks * 100) : 0}%</span>

              <span className={`activity-${member.completed ? 'high' : 'medium'}`}>
                {member.completed ? 'Active' : 'Assigned'}
              </span>

            </div>

          ))}

        </div>

      </div>

    </div>
  );
}

export default Monitoring;