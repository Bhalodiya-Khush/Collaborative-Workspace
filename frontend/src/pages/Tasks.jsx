import {
  Plus,
  CalendarDays,
  Flag,
  CheckCircle2,
  FolderKanban,
  FileCode,
  Clock,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useWorkspace } from '../context/useWorkspace';
import api from '../services/api';

function Tasks() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedWorkspaceId } = useWorkspace();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const statuses = [
    { title: 'To Do', status: 'todo' },
    { title: 'In Progress', status: 'in_progress' },
    { title: 'In Review', status: 'in_review' },
    { title: 'Completed', status: 'completed' },
    { title: 'Blocked', status: 'blocked' },
  ];

  const loadTasks = useCallback(async () => {
    try {
      const [tasksResponse, projectsResponse] = await Promise.all([
        api.get('/tasks'),
        api.get('/projects'),
      ]);
      setTasks(selectedWorkspaceId
        ? (tasksResponse.data || []).filter((task) => String(task.workspace?._id || task.workspace) === selectedWorkspaceId)
        : tasksResponse.data || []);
      setProjects(selectedWorkspaceId
        ? (projectsResponse.data || []).filter((project) => String(project.workspace?._id || project.workspace) === selectedWorkspaceId)
        : projectsResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Tasks could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    queueMicrotask(loadTasks);
  }, [loadTasks]);

  const updateStatus = async (taskId, newStatus) => {
    setError('');
    setSuccess('');
    try {
      await api.patch(`/tasks/${taskId}/status`, { status: newStatus });
      setTasks((current) =>
        current.map((task) => (task._id === taskId ? { ...task, status: newStatus } : task))
      );
      setSuccess('Task status updated successfully.');
      // Reload projects to refresh project completion percentage
      const projectsResponse = await api.get('/projects');
      setProjects(projectsResponse.data || []);
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
        'Task status could not be updated. Completion requires Project Manager review approval.'
      );
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const project = projects.find((item) => item._id === formData.get('project'));
    if (!project) return;
    setError('');
    setSuccess('');
    try {
      await api.post('/tasks', {
        title: formData.get('title'),
        description: formData.get('description'),
        project: project._id,
        workspace: project.workspace?._id || project.workspace,
        assignee: formData.get('assignee') || undefined,
        priority: formData.get('priority'),
        dueDate: formData.get('dueDate') || undefined,
      });
      setShowForm(false);
      setSuccess('Task created successfully.');
      await loadTasks();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Task could not be created.');
    }
  };

  // Filter tasks by selected project if one is selected
  const displayedTasks = selectedProjectId
    ? tasks.filter((t) => (t.project?._id || t.project) === selectedProjectId)
    : tasks;

  // Active project details for progress display
  const activeProject = projects.find((p) => p._id === selectedProjectId) || (projects.length === 1 ? projects[0] : null);
  const activeProjectRole = activeProject?.currentUserRole;
  const canManageAnyProject = projects.some((project) => (
    ['admin', 'project_manager'].includes(project.currentUserRole)
  ));

  const projectDevelopers = projects.find((p) => p._id === (selectedProjectId || projects[0]?._id))?.developers || [];

  return (
    <div className="tasks-page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1>Project Tasks & Deliverables</h1>
          <p>
            {activeProjectRole === 'developer'
              ? 'View tasks within your assigned projects. Submit work for Project Manager approval.'
              : 'Organize, assign and track development work across your projects.'}
          </p>
        </div>

        {canManageAnyProject && (
          <button className="primary-button" onClick={() => setShowForm((visible) => !visible)}>
            <Plus size={17} /> Create Task
          </button>
        )}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="auth-success" role="status" style={{ background: '#e2f3eb', color: '#183d35', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #c2e2d5', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={18} color="#183d35" />{success}</p>}

      {/* PROJECT FILTER & PROGRESS OVERVIEW (VISIBLE TO DEVELOPERS AS REQUESTED) */}
      <div style={{ background: '#ffffff', border: '1px solid #d7dfd6', borderRadius: '8px', padding: '18px 22px', marginBottom: '22px', boxShadow: '0 2px 8px rgba(24, 61, 53, 0.04)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FolderKanban size={20} color="#183d35" />
            <span style={{ fontWeight: '700', fontSize: '15px', color: '#183d35' }}>Filter Tasks by Project:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d7dfd6', background: '#fbfaf6', color: '#202a26', fontSize: '13px', minWidth: '220px' }}
            >
              <option value="">All My Projects ({projects.length})</option>
              {projects.filter((project) => ['admin', 'project_manager'].includes(project.currentUserRole)).map((proj) => (
                <option key={proj._id} value={proj._id}>{proj.name}</option>
              ))}
            </select>
          </div>

          {activeProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: '#5f6e67' }}>Project Completion Progress:</span>
              <span style={{ fontSize: '16px', fontWeight: '800', color: '#d9764e' }}>{activeProject.progress || 0}%</span>
            </div>
          )}
        </div>

        {activeProject ? (
          <div>
            <div style={{ width: '100%', height: '10px', background: '#edf1eb', borderRadius: '6px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${activeProject.progress || 0}%`,
                  background: 'linear-gradient(90deg, #183d35 0%, #d9764e 100%)',
                  borderRadius: '6px',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#5f6e67' }}>
              <span>Project: <strong>{activeProject.name}</strong></span>
              <span>Manager: <strong>{activeProject.projectManager?.fullName || 'Project Manager'}</strong></span>
              <span>Status: <strong style={{ textTransform: 'capitalize' }}>{activeProject.status?.replace('_', ' ')}</strong></span>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: '12px', color: '#5f6e67' }}>
            Select a project above to inspect its completion percentage and dedicated team deliverables.
          </p>
        )}
      </div>

      {/* CREATE TASK FORM */}
      {showForm && (
        <form className="entity-form" onSubmit={createTask}>
          <h3>New Task Assignment</h3>
          <label>Project
            <select name="project" required defaultValue={selectedProjectId || ''}>
              <option value="" disabled>Select project</option>
              {projects.map((project) => (
                <option key={project._id} value={project._id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>Task Title
            <input name="title" placeholder="e.g. Implement user authentication endpoints" required maxLength={160} />
          </label>
          <label>Description & Requirements
            <textarea name="description" placeholder="Specify deliverables and technical requirements..." rows="3" />
          </label>
          <label>Assign to Developer
            <select name="assignee" defaultValue="">
              <option value="">Unassigned</option>
              {projectDevelopers.map((dev) => (
                <option key={dev._id} value={dev._id}>{dev.fullName} ({dev.email})</option>
              ))}
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label>Priority
              <select name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label>Due Date
              <input name="dueDate" type="date" min={new Date().toISOString().slice(0, 10)} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button className="primary-button" type="submit" disabled={!projects.length}>Create Task</button>
            <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* TASK SUMMARY METRICS */}
      <div className="task-summary">
        <div className="task-summary-card">
          <span>Total Tasks</span>
          <strong>{displayedTasks.length}</strong>
        </div>

        <div className="task-summary-card">
          <span>In Progress</span>
          <strong>{displayedTasks.filter((task) => task.status === 'in_progress').length}</strong>
        </div>

        <div className="task-summary-card">
          <span>Awaiting Review</span>
          <strong>{displayedTasks.filter((task) => task.status === 'in_review').length}</strong>
        </div>

        <div className="task-summary-card">
          <span>Completed & Approved</span>
          <strong>{displayedTasks.filter((task) => task.status === 'completed').length}</strong>
        </div>
      </div>

      {/* KANBAN BOARD */}
      {loading ? (
        <p>Loading tasks...</p>
      ) : (
        <div className="kanban-board">
          {statuses.map((column) => {
            const columnTasks = displayedTasks.filter((task) => task.status === column.status);

            return (
              <div className="kanban-column" key={column.title}>
                <div className="kanban-column-header">
                  <div className="column-title">
                    <span
                      className={`column-dot ${column.title.toLowerCase().replace(' ', '-')}`}
                    />
                    <strong>{column.title}</strong>
                    <span className="task-count">{columnTasks.length}</span>
                  </div>
                </div>

                <div className="kanban-tasks">
                  {columnTasks.map((task) => {
                    const isAssignee = task.assignee?._id === user?._id || task.assignee === user?._id;
                    const projectRole = projects.find(
                      (project) => project._id === (task.project?._id || task.project)
                    )?.currentUserRole;
                    const isProjectManager = ['admin', 'project_manager'].includes(projectRole);
                    const canEditStatus =
                      isProjectManager || isAssignee;

                    return (
                      <div className="task-card" key={task._id}>
                        <div className="task-card-top">
                          <span className={`priority ${(task.priority || 'medium').toLowerCase()}`}>
                            <Flag size={11} />
                            {task.priority || 'medium'}
                          </span>

                          <span style={{ fontSize: '11px', color: '#5f6e67' }}>
                            {task.project?.name || 'Project'}
                          </span>
                        </div>

                        <h3>{task.title}</h3>

                        {task.description && (
                          <p style={{ fontSize: '12px', color: '#5f6e67', margin: '4px 0 10px', lineHeight: 1.4 }}>
                            {task.description}
                          </p>
                        )}

                        <div className="task-card-footer">
                          <div className="task-member" title={task.assignee?.fullName || 'Unassigned'}>
                            {task.assignee?.fullName?.charAt(0) || 'U'}
                          </div>

                          <div className="task-deadline">
                            <CalendarDays size={13} />
                            {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No deadline'}
                          </div>
                        </div>

                        {/* STATUS SELECTION OR STATUS BADGE */}
                        {task.status === 'completed' ? (
                          <div
                            style={{
                              marginTop: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 10px',
                              background: '#e2f3eb',
                              border: '1px solid #a8d5c2',
                              borderRadius: '6px',
                              color: '#183d35',
                              fontSize: '11px',
                              fontWeight: '700',
                            }}
                          >
                            <CheckCircle2 size={13} color="#183d35" /> Approved by PM & Completed
                          </div>
                        ) : task.status === 'in_review' ? (
                          <div
                            style={{
                              marginTop: '10px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '5px 10px',
                              background: '#faede6',
                              border: '1px solid #f6b27e',
                              borderRadius: '6px',
                              color: '#d9764e',
                              fontSize: '11px',
                              fontWeight: '700',
                            }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Clock size={13} /> Awaiting PM Review
                            </span>
                            {isProjectManager && (
                              <button
                                onClick={() => navigate('/submissions')}
                                style={{ background: '#d9764e', color: 'white', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}
                              >
                                Review Now
                              </button>
                            )}
                          </div>
                        ) : canEditStatus ? (
                          <div style={{ marginTop: '10px' }}>
                            <label style={{ fontSize: '11px', color: '#5f6e67', marginBottom: '2px', display: 'block' }}>Update Status:</label>
                            <select
                              className="task-status-select"
                              value={task.status}
                              onChange={(event) => updateStatus(task._id, event.target.value)}
                              aria-label={`Status for ${task.title}`}
                            >
                              <option value="todo">To Do</option>
                              <option value="in_progress">In Progress</option>
                              <option value="in_review">In Review (Submit Code)</option>
                              {projectRole !== 'developer' && <option value="completed">Completed (Approved)</option>}
                              <option value="blocked">Blocked</option>
                            </select>
                          </div>
                        ) : null}

                        {/* SUBMIT CODE SHORTCUT FOR DEVELOPERS */}
                        {projectRole === 'developer' && isAssignee && task.status !== 'completed' && (
                          <button
                            onClick={() => navigate('/submissions')}
                            style={{
                              marginTop: '8px',
                              width: '100%',
                              padding: '5px 10px',
                              background: '#fbfaf6',
                              border: '1px dashed #d9764e',
                              borderRadius: '6px',
                              color: '#d9764e',
                              fontSize: '11px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                            }}
                          >
                            <FileCode size={13} /> Submit Code / ZIP for Approval
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {columnTasks.length === 0 && <p className="empty-column">No tasks</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Tasks;