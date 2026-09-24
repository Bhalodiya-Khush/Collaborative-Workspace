const renderLayout = (title, content, script = '') => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body>
      ${content}
      ${script ? `<script>${script}</script>` : ''}
    </body>
  </html>
`;

const pageNavigation = () => `
  <nav>
    <a href="/dashboard">Dashboard</a> |
    <a href="/users">Users</a> |
    <a href="/workspaces">Workspaces</a> |
    <a href="/projects">Projects</a> |
    <a href="/monitoring">Monitoring</a> |
    <a href="/reports">Reports</a> |
    <a href="/tasks">Tasks</a> |
    <a href="/submissions">Submissions</a> |
    <a href="/meetings">Meetings</a> |
    <a href="/messages">Messages</a> |
    <a href="/notifications">Notifications</a> |
    <a href="/login">Login</a>
  </nav>
`;

const field = (name, placeholder, type = 'text', required = false) =>
  `<p><label>${placeholder}<br><input type="${type}" name="${name}" ${required ? 'required' : ''}></label></p>`;

const form = (id, fields, button) => `
  <form id="${id}">
    ${fields}
    <button type="submit">${button}</button>
  </form>
`;

const interactivePage = (title, endpoint, description, forms, script) => renderLayout(
  `Collaborative Workspace - ${title}`,
  `
    <main>
      <h1>${title}</h1>
      ${pageNavigation()}
      <p>${description}</p>
      ${forms}
      <p id="message"></p>
      <pre id="data"></pre>
    </main>
  `,
  `
    const tokenKey = 'collaborativeWorkspaceToken';
    const api = async (url, options = {}) => {
      const token = localStorage.getItem(tokenKey);
      if (!token) { window.location.href = '/login'; return null; }
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          ...(options.headers || {})
        }
      });
      const data = await response.json();
      if (response.status === 401) {
        localStorage.removeItem(tokenKey);
        window.location.href = '/login';
        return null;
      }
      if (!response.ok) throw new Error(data.message || 'Request failed.');
      return data;
    };
    const show = (data) => {
      document.getElementById('message').textContent = 'Operation completed.';
      document.getElementById('data').textContent = JSON.stringify(data, null, 2);
    };
    const fail = (error) => {
      document.getElementById('message').textContent = error.message;
    };
    ${script}
  `
);

const resourcePage = (path) => interactivePage(
  path.title,
  path.endpoint,
  path.description,
  path.forms,
  `
    const load = async () => {
      try { show(await api(${JSON.stringify(path.endpoint)})); } catch (error) { fail(error); }
    };
    ${path.handlers || ''}
    load();
  `
);

const loginPage = () => renderLayout(
  'Collaborative Workspace - Login',
  `
    <main>
      <h1>Collaborative Workspace</h1>
      <h2>Login</h2>
      <p id="message"></p>
      <form id="loginForm">
        <p><label>Email<br><input type="email" name="email" required></label></p>
        <p><label>Password<br><input type="password" name="password" required></label></p>
        <button type="submit">Login</button>
      </form>
      <p>New user? <a href="/register">Create an account</a></p>
    </main>
  `,
  `
    const form = document.getElementById('loginForm');
    const message = document.getElementById('message');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = 'Logging in...';
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(new FormData(form).entries()),
          email: document.querySelector('[name="email"]').value.trim().toLowerCase()
        })
      });
      const data = await response.json();
      if (!response.ok) {
        message.textContent = data.message || 'Login failed.';
        return;
      }
      localStorage.setItem('collaborativeWorkspaceToken', data.token);
      window.location.href = '/dashboard';
    });
  `
);

const registerPage = () => renderLayout(
  'Collaborative Workspace - Registration',
  `
    <main>
      <h1>Collaborative Workspace</h1>
      <h2>Create account</h2>
      <p>New accounts are created as developers.</p>
      <p id="message"></p>
      <form id="registerForm">
        <p><label>Full name<br><input type="text" name="fullName" required></label></p>
        <p><label>Email<br><input type="email" name="email" required></label></p>
        <p><label>Password<br><input type="password" name="password" required></label></p>
        <button type="submit">Register</button>
      </form>
      <p>Already registered? <a href="/login">Back to login</a></p>
    </main>
  `,
  `
    const form = document.getElementById('registerForm');
    const message = document.getElementById('message');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = 'Creating account...';
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      const data = await response.json();
      if (!response.ok) {
        message.textContent = data.message || 'Registration failed.';
        return;
      }
      message.textContent = 'Registration successful. Redirecting to login...';
      window.setTimeout(() => { window.location.href = '/login'; }, 700);
    });
  `
);

const dashboardPage = () => renderLayout(
  'Collaborative Workspace - Dashboard',
  `
    <main>
      <h1>Collaborative Workspace Dashboard</h1>
      ${pageNavigation()}
      <p id="userDetails">Loading user...</p>
      <button id="logoutButton" type="button">Logout</button>
      <hr>
      <h2>System overview</h2>
      <p id="stats">Loading dashboard data...</p>
      <h2>My projects</h2>
      <ul id="projects"><li>Loading projects...</li></ul>
      <h2>My tasks</h2>
      <ul id="tasks"><li>Loading tasks...</li></ul>
      <h2>My notifications</h2>
      <ul id="notifications"><li>Loading notifications...</li></ul>
      <p><a href="/dashboard">Refresh dashboard</a></p>
    </main>
  `,
  `
    const tokenKey = 'collaborativeWorkspaceToken';
    const token = localStorage.getItem(tokenKey);
    const headers = token ? { Authorization: 'Bearer ' + token } : {};

    const request = async (url) => {
      const response = await fetch(url, { headers });
      if (response.status === 401) {
        localStorage.removeItem(tokenKey);
        window.location.href = '/login';
        return null;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Request failed.');
      return data;
    };

    document.getElementById('logoutButton').addEventListener('click', () => {
      localStorage.removeItem(tokenKey);
      window.location.href = '/login';
    });

    if (!token) {
      window.location.href = '/login';
    } else {
      Promise.all([
        request('/api/users/me'),
        request('/api/dashboard'),
        request('/api/projects'),
        request('/api/tasks'),
        request('/api/notifications')
      ]).then(([userData, stats, projects, tasks, notifications]) => {
        if (!userData) return;
        document.getElementById('userDetails').textContent =
          userData.user.fullName + ' | ' + userData.user.email + ' | Role: ' + userData.user.role;
        document.getElementById('stats').textContent =
          'Users: ' + stats.totalUsers +
          ' | Workspaces: ' + stats.totalWorkspaces +
          ' | Projects: ' + stats.totalProjects +
          ' | Tasks: ' + stats.totalTasks;
        document.getElementById('projects').innerHTML = projects.length
          ? projects.map((project) => '<li>' + project.name + ' - ' + project.status + '</li>').join('')
          : '<li>No projects available.</li>';
        document.getElementById('tasks').innerHTML = tasks.length
          ? tasks.map((task) => '<li>' + task.title + ' - ' + task.status + ' - ' + task.completionPercentage + '%</li>').join('')
          : '<li>No tasks available.</li>';
        document.getElementById('notifications').innerHTML = notifications.length
          ? notifications.map((notification) => '<li>' + notification.title + ': ' + notification.message + '</li>').join('')
          : '<li>No notifications.</li>';
      }).catch((error) => {
        document.getElementById('userDetails').textContent = error.message;
      });
    }
  `
);

const pageFlow = (req, res, next) => {
  if (req.method !== 'GET') return next();

  if (req.path === '/' || req.path === '/login') {
    return res.status(200).send(loginPage());
  }

  if (req.path === '/register') {
    return res.status(200).send(registerPage());
  }

  if (req.path === '/dashboard') {
    return res.status(200).send(dashboardPage());
  }

  const pages = {
    '/users': {
      title: 'Users',
      endpoint: '/api/users',
      description: 'View users and assign roles as an administrator.',
      forms: form('roleForm', field('userId', 'User ID', 'text', true) + field('role', 'Role (admin, project_manager, developer, viewer)', 'text', true), 'Update role'),
      handlers: `
        document.getElementById('roleForm').addEventListener('submit', async (event) => {
          event.preventDefault();
          const value = Object.fromEntries(new FormData(event.target).entries());
          try { show(await api('/api/users/' + value.userId + '/role', { method: 'PATCH', body: JSON.stringify({ role: value.role }) })); } catch (error) { fail(error); }
        });
      `,
    },
    '/workspaces': {
      title: 'Workspaces',
      endpoint: '/api/workspaces',
      description: 'Create and view company workspaces.',
      forms: form('workspaceForm', field('name', 'Workspace name', 'text', true) + field('description', 'Description') + field('owner', 'Owner user ID', 'text', true) + field('members', 'Member IDs separated by commas'), 'Create workspace')
        + '<h2>Workspace members</h2>' + form('memberForm', field('workspaceId', 'Workspace ID', 'text', true) + field('userId', 'User ID', 'text', true), 'Add member')
        + '<h2>Assign workspace role</h2>' + form('roleForm', field('roleWorkspaceId', 'Workspace ID', 'text', true) + field('roleUserId', 'User ID', 'text', true) + field('role', 'Role', 'text', true), 'Assign role')
        + '<h2>Workspace activity</h2>' + form('activityForm', field('activityWorkspaceId', 'Workspace ID', 'text', true), 'Load activity'),
      handlers: `
        document.getElementById('workspaceForm').addEventListener('submit', async (event) => {
          event.preventDefault();
          const value = Object.fromEntries(new FormData(event.target).entries());
          value.members = value.members ? value.members.split(',').map((item) => item.trim()).filter(Boolean) : [];
          try { show(await api('/api/workspaces', { method: 'POST', body: JSON.stringify(value) })); } catch (error) { fail(error); }
        });
        document.getElementById('memberForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries()); const id = value.workspaceId; delete value.workspaceId;
          try { show(await api('/api/workspaces/' + id + '/members', { method: 'POST', body: JSON.stringify(value) })); } catch (error) { fail(error); }
        });
        document.getElementById('roleForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries()); const id = value.roleWorkspaceId;
          try { show(await api('/api/workspaces/' + id + '/role', { method: 'PATCH', body: JSON.stringify({ userId: value.roleUserId, role: value.role }) })); } catch (error) { fail(error); }
        });
        document.getElementById('activityForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries());
          try { show(await api('/api/workspaces/' + value.activityWorkspaceId + '/activity')); } catch (error) { fail(error); }
        });
      `,
    },
    '/projects': {
      title: 'Projects',
      endpoint: '/api/projects',
      description: 'Create projects, update project progress, and change project status.',
      forms: form('projectForm', field('name', 'Project name', 'text', true) + field('description', 'Description') + field('workspace', 'Workspace ID', 'text', true) + field('projectManager', 'Project manager ID', 'text', true) + field('developers', 'Developer IDs separated by commas'), 'Create project')
        + '<h2>Update project</h2>' + form('projectUpdateForm', field('projectId', 'Project ID', 'text', true) + field('name', 'New name') + field('status', 'Status') + field('progress', 'Progress 0-100', 'number'), 'Update project'),
      handlers: `
        document.getElementById('projectForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries());
          value.developers = value.developers ? value.developers.split(',').map((item) => item.trim()).filter(Boolean) : [];
          try { show(await api('/api/projects', { method: 'POST', body: JSON.stringify(value) })); } catch (error) { fail(error); }
        });
        document.getElementById('projectUpdateForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries()); const id = value.projectId; delete value.projectId;
          if (value.progress === '') delete value.progress;
          try { show(await api('/api/projects/' + id, { method: 'PATCH', body: JSON.stringify(value) })); } catch (error) { fail(error); }
        });
      `,
    },
    '/monitoring': {
      title: 'Project Monitoring',
      endpoint: '/api/projects',
      description: 'View task, submission, and activity summaries for a project.',
      forms: form('monitoringForm', field('projectId', 'Project ID', 'text', true), 'Load monitoring'),
      handlers: `
        document.getElementById('monitoringForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries());
          try { show(await api('/api/projects/' + value.projectId + '/monitoring')); } catch (error) { fail(error); }
        });
      `,
    },
    '/reports': {
      title: 'Project Performance Reports',
      endpoint: '/api/projects',
      description: 'Generate project performance totals and task progress reports.',
      forms: form('reportForm', field('projectId', 'Project ID', 'text', true), 'Generate report'),
      handlers: `
        document.getElementById('reportForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries());
          try { show(await api('/api/projects/' + value.projectId + '/report')); } catch (error) { fail(error); }
        });
      `,
    },
    '/tasks': {
      title: 'Tasks',
      endpoint: '/api/tasks',
      description: 'Create, assign, filter, and update project tasks.',
      forms: form('taskForm', field('title', 'Task title', 'text', true) + field('description', 'Description') + field('project', 'Project ID', 'text', true) + field('workspace', 'Workspace ID', 'text', true) + field('assignee', 'Developer ID') + field('dueDate', 'Due date', 'date'), 'Create task')
        + '<h2>Update task</h2>' + form('taskUpdateForm', field('taskId', 'Task ID', 'text', true) + field('status', 'Status') + field('completionPercentage', 'Progress 0-100', 'number'), 'Update task')
        + '<h2>Assign task</h2>' + form('taskAssignForm', field('assignTaskId', 'Task ID', 'text', true) + field('assignee', 'Developer ID', 'text', true), 'Assign task'),
      handlers: `
        document.getElementById('taskForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries());
          try { show(await api('/api/tasks', { method: 'POST', body: JSON.stringify(value) })); } catch (error) { fail(error); }
        });
        document.getElementById('taskUpdateForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries()); const id = value.taskId; delete value.taskId;
          try { if (value.status) await api('/api/tasks/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status: value.status }) }); show(await api('/api/tasks/' + id + '/progress', { method: 'PATCH', body: JSON.stringify({ completionPercentage: Number(value.completionPercentage) }) })); } catch (error) { fail(error); }
        });
        document.getElementById('taskAssignForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const value = Object.fromEntries(new FormData(event.target).entries());
          try { show(await api('/api/tasks/' + value.assignTaskId + '/assign', { method: 'PATCH', body: JSON.stringify({ assignee: value.assignee }) })); } catch (error) { fail(error); }
        });
      `,
    },
    '/submissions': {
      title: 'Code Submissions',
      endpoint: '/api/submissions',
      description: 'Upload source files or ZIP files and review submissions.',
      forms: form('submissionForm', field('project', 'Project ID', 'text', true) + field('task', 'Task ID', 'text', true) + field('title', 'Submission title', 'text', true) + field('branchName', 'Branch name') + '<p><label>Files<br><input type="file" name="files" multiple></label></p>', 'Upload submission'),
      handlers: `
        document.getElementById('submissionForm').addEventListener('submit', async (event) => {
          event.preventDefault(); const token = localStorage.getItem(tokenKey); const response = await fetch('/api/submissions', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: new FormData(event.target) }); const data = await response.json();
          if (!response.ok) { fail(new Error(data.message || 'Upload failed.')); return; } show(data);
        });
      `,
    },
    '/meetings': {
      title: 'Meetings',
      endpoint: '/api/meetings',
      description: 'Schedule project meetings.',
      forms: form('meetingForm', field('title', 'Meeting title', 'text', true) + field('project', 'Project ID') + field('workspace', 'Workspace ID', 'text', true) + field('scheduledAt', 'Scheduled time', 'datetime-local', true) + field('agenda', 'Agenda'), 'Schedule meeting'),
      handlers: `
        document.getElementById('meetingForm').addEventListener('submit', async (event) => {
          event.preventDefault(); try { show(await api('/api/meetings', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) })); } catch (error) { fail(error); }
        });
      `,
    },
    '/messages': {
      title: 'Messages',
      endpoint: '/api/messages',
      description: 'Send messages to a workspace or project.',
      forms: form('messageForm', field('workspace', 'Workspace ID', 'text', true) + field('project', 'Project ID') + field('receiver', 'Receiver user ID') + field('content', 'Message', 'text', true), 'Send message'),
      handlers: `
        document.getElementById('messageForm').addEventListener('submit', async (event) => {
          event.preventDefault(); try { show(await api('/api/messages', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) })); } catch (error) { fail(error); }
        });
      `,
    },
    '/notifications': {
      title: 'Notifications',
      endpoint: '/api/notifications',
      description: 'View your notifications or create a notification as an administrator/project manager.',
      forms: form('notificationForm', field('user', 'User ID', 'text', true) + field('title', 'Title', 'text', true) + field('message', 'Message', 'text', true), 'Create notification'),
      handlers: `
        document.getElementById('notificationForm').addEventListener('submit', async (event) => {
          event.preventDefault(); try { show(await api('/api/notifications', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())) })); } catch (error) { fail(error); }
        });
      `,
    },
  };

  if (pages[req.path]) {
    return res.status(200).send(resourcePage(pages[req.path]));
  }

  next();
};

module.exports = pageFlow;
