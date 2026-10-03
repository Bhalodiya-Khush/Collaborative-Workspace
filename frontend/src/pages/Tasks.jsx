import {
  Plus,
  MoreHorizontal,
  CalendarDays,
  Flag,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Tasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const statuses = [
    { title: 'To Do', status: 'todo' },
    { title: 'In Progress', status: 'in_progress' },
    { title: 'Review', status: 'in_review' },
    { title: 'Completed', status: 'completed' },
    { title: 'Blocked', status: 'blocked' },
  ];

  const loadTasks = async () => {
    try {
      const [tasksResponse, projectsResponse] = await Promise.all([api.get('/tasks'), api.get('/projects')]);
      setTasks(tasksResponse.data || []);
      setProjects(projectsResponse.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Tasks could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    Promise.all([api.get('/tasks'), api.get('/projects')])
      .then(([tasksResponse, projectsResponse]) => {
        setTasks(tasksResponse.data || []);
        setProjects(projectsResponse.data || []);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Tasks could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const updateStatus = async (taskId, status) => {
    try {
      await api.patch(`/tasks/${taskId}/status`, { status });
      setTasks((current) => current.map((task) => task._id === taskId ? { ...task, status } : task));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Task status could not be updated.');
    }
  };

  const createTask = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const project = projects.find((item) => item._id === formData.get('project'));
    if (!project) return;
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
      setSelectedProject('');
      await loadTasks();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Task could not be created.');
    }
  };

  const today = new Date().toDateString();
  const dueToday = tasks.filter((task) => task.dueDate && new Date(task.dueDate).toDateString() === today && task.status !== 'completed').length;
  const developers = projects.find((project) => project._id === selectedProject)?.developers || [];

  return (
    <div className="tasks-page">

      {/* HEADER */}

      <div className="page-header">
        <div>
          <h1>Tasks</h1>
          <p>
            Organize, assign and track your team's work.
          </p>
        </div>

        {['admin', 'project_manager'].includes(user?.role) && <button className="primary-button" onClick={() => setShowForm((visible) => !visible)}>
          <Plus size={17} />
          Create Task
        </button>}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {showForm && <form className="entity-form" onSubmit={createTask}>
        <h3>New task</h3>
        <label>Project<select name="project" required value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="">Select project</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select></label>
        <label>Title<input name="title" required maxLength={160} /></label>
        <label>Description<textarea name="description" rows="2" /></label>
        <label>Assignee<select name="assignee" defaultValue=""><option value="">Unassigned</option>{developers.map((developer) => <option key={developer._id} value={developer._id}>{developer.fullName}</option>)}</select></label>
        <label>Priority<select name="priority" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label>Due date<input name="dueDate" type="date" /></label>
        <button className="primary-button" type="submit" disabled={!projects.length}>Create task</button>
      </form>}

      {/* TASK SUMMARY */}

      <div className="task-summary">

        <div className="task-summary-card">
          <span>Total Tasks</span>
          <strong>{tasks.length}</strong>
        </div>

        <div className="task-summary-card">
          <span>In Progress</span>
          <strong>{tasks.filter((task) => task.status === 'in_progress').length}</strong>
        </div>

        <div className="task-summary-card">
          <span>Due Today</span>
          <strong>{dueToday}</strong>
        </div>

        <div className="task-summary-card">
          <span>Completed</span>
          <strong>{tasks.filter((task) => task.status === 'completed').length}</strong>
        </div>

      </div>

      {/* KANBAN BOARD */}

      {loading ? <p>Loading tasks...</p> : <div className="kanban-board">

        {statuses.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.status);
          return (

          <div className="kanban-column" key={column.title}>

            <div className="kanban-column-header">

              <div className="column-title">
                <span className={`column-dot ${column.title
                  .toLowerCase()
                  .replace(' ', '-')}`}
                />

                <strong>{column.title}</strong>

                <span className="task-count">
                  {columnTasks.length}
                </span>
              </div>

              <button className="more-button">
                <MoreHorizontal size={18} />
              </button>

            </div>

            <div className="kanban-tasks">

              {columnTasks.map((task) => (

                <div className="task-card" key={task._id}>

                  <div className="task-card-top">

                    <span className={`priority ${(task.priority || 'medium').toLowerCase()}`}>
                      <Flag size={11} />
                      {task.priority || 'medium'}
                    </span>

                    <button className="more-button">
                      <MoreHorizontal size={17} />
                    </button>

                  </div>

                  <h3>{task.title}</h3>

                  <p className="task-project">
                    {task.project?.name || 'Project'}
                  </p>

                  <div className="task-card-footer">

                    <div className="task-member">
                      {task.assignee?.fullName?.charAt(0) || 'U'}
                    </div>

                    <div className="task-deadline">
                      <CalendarDays size={13} />
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
                    </div>

                  </div>

                  {user?.role !== 'developer' || task.assignee?._id === user?._id ? (
                    <select className="task-status-select" value={task.status} onChange={(event) => updateStatus(task._id, event.target.value)} aria-label={`Status for ${task.title}`}>
                      {statuses.map((status) => <option key={status.status} value={status.status}>{status.title}</option>)}
                    </select>
                  ) : null}

                </div>

              ))}

            </div>

            {columnTasks.length === 0 && <p className="empty-column">No tasks</p>}

          </div>

          );
        })}

      </div>}

    </div>
  );
}

export default Tasks;