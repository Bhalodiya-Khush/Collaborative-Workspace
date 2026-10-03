(() => {
  const tokenKey = 'collaborativeWorkspaceToken';
  const page = document.body.dataset.page;
  const messageElement = document.getElementById('message');
  const dataElement = document.getElementById('data');

  const show = (data) => {
    if (messageElement) messageElement.textContent = 'Operation completed.';
    if (dataElement) dataElement.textContent = JSON.stringify(data, null, 2);
  };

  const fail = (error) => {
    if (messageElement) messageElement.textContent = error.message;
  };

  const api = async (url, options = {}) => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      window.location.href = '/login';
      return null;
    }

    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (response.status === 401) {
      localStorage.removeItem(tokenKey);
      window.location.href = '/login';
      return null;
    }
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
  };

  const bindSubmit = (formId, handler) => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (messageElement) messageElement.textContent = '';
      try {
        await handler(new FormData(form), form);
      } catch (error) {
        fail(error);
      }
    });
  };

  const formValues = (formData) => Object.fromEntries(formData.entries());
  const jsonRequest = (method, body) => ({ method, body: JSON.stringify(body) });
  const load = async (endpoint) => {
    try {
      show(await api(endpoint));
    } catch (error) {
      fail(error);
    }
  };

  if (page === 'login') {
    bindSubmit('loginForm', async (formData) => {
      if (messageElement) messageElement.textContent = 'Logging in...';
      const values = formValues(formData);
      values.email = values.email.trim().toLowerCase();
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed.');
      localStorage.setItem(tokenKey, data.token);
      window.location.href = '/dashboard';
    });
    return;
  }

  if (page === 'register') {
    bindSubmit('registerForm', async (formData) => {
      if (messageElement) messageElement.textContent = 'Creating account...';
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues(formData)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed.');
      if (messageElement) messageElement.textContent = 'Registration successful. Redirecting to login...';
      window.setTimeout(() => { window.location.href = '/login'; }, 700);
    });
    return;
  }

  if (page === 'dashboard') {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      window.location.href = '/login';
      return;
    }

    document.getElementById('logoutButton').addEventListener('click', () => {
      localStorage.removeItem(tokenKey);
      window.location.href = '/login';
    });

    Promise.all([
      api('/api/users/me'),
      api('/api/dashboard'),
      api('/api/projects'),
      api('/api/tasks'),
      api('/api/notifications'),
    ]).then(([userData, stats, projects, tasks, notifications]) => {
      if (!userData) return;
      document.getElementById('userDetails').textContent =
        `${userData.user.fullName} | ${userData.user.email} | Role: ${userData.user.role}`;
      document.getElementById('stats').textContent =
        `Users: ${stats.totalUsers} | Workspaces: ${stats.totalWorkspaces} | Projects: ${stats.totalProjects} | Tasks: ${stats.totalTasks}`;

      const renderList = (id, items, format, emptyMessage) => {
        const list = document.getElementById(id);
        list.replaceChildren();
        if (!items.length) {
          const item = document.createElement('li');
          item.textContent = emptyMessage;
          list.append(item);
          return;
        }
        items.forEach((value) => {
          const item = document.createElement('li');
          item.textContent = format(value);
          list.append(item);
        });
      };
      renderList('projects', projects, (project) => `${project.name} - ${project.status}`, 'No projects available.');
      renderList('tasks', tasks, (task) => `${task.title} - ${task.status} - ${task.completionPercentage}%`, 'No tasks available.');
      renderList('notifications', notifications, (notification) => `${notification.title}: ${notification.message}`, 'No notifications.');
    }).catch((error) => {
      document.getElementById('userDetails').textContent = error.message;
    });
    return;
  }

  const endpoints = {
    users: '/api/users',
    workspaces: '/api/workspaces',
    projects: '/api/projects',
    monitoring: '/api/projects',
    reports: '/api/projects',
    tasks: '/api/tasks',
    submissions: '/api/submissions',
    meetings: '/api/meetings',
    messages: '/api/messages',
    notifications: '/api/notifications',
  };
  if (endpoints[page]) load(endpoints[page]);

  if (page === 'users') {
    bindSubmit('roleForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/users/${encodeURIComponent(values.userId)}/role`, jsonRequest('PATCH', { role: values.role })));
    });
  }

  if (page === 'workspaces') {
    bindSubmit('workspaceForm', async (formData) => {
      const values = formValues(formData);
      values.members = values.members ? values.members.split(',').map((item) => item.trim()).filter(Boolean) : [];
      show(await api('/api/workspaces', jsonRequest('POST', values)));
    });
    bindSubmit('memberForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/members`, jsonRequest('POST', { userId: values.userId })));
    });
    bindSubmit('roleForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/role`, jsonRequest('PATCH', {
        userId: values.userId,
        role: values.role,
      })));
    });
    bindSubmit('activityForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/activity`));
    });
  }

  if (page === 'projects') {
    bindSubmit('projectForm', async (formData) => {
      const values = formValues(formData);
      values.developers = values.developers ? values.developers.split(',').map((item) => item.trim()).filter(Boolean) : [];
      show(await api('/api/projects', jsonRequest('POST', values)));
    });
    bindSubmit('projectUpdateForm', async (formData) => {
      const values = formValues(formData);
      const projectId = values.projectId;
      delete values.projectId;
      if (values.progress === '') delete values.progress;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}`, jsonRequest('PATCH', values)));
    });
  }

  if (page === 'monitoring' || page === 'reports') {
    const formId = page === 'monitoring' ? 'monitoringForm' : 'reportForm';
    const suffix = page === 'monitoring' ? '/monitoring' : '/report';
    bindSubmit(formId, async (formData) => {
      const { projectId } = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(projectId)}${suffix}`));
    });
  }

  if (page === 'tasks') {
    bindSubmit('taskForm', async (formData) => {
      const values = formValues(formData);
      if (!values.assignee) delete values.assignee;
      if (!values.dueDate) delete values.dueDate;
      show(await api('/api/tasks', jsonRequest('POST', values)));
    });
    bindSubmit('taskUpdateForm', async (formData) => {
      const values = formValues(formData);
      const taskId = values.taskId;
      if (values.status) await api(`/api/tasks/${encodeURIComponent(taskId)}/status`, jsonRequest('PATCH', { status: values.status }));
      if (values.completionPercentage !== '') {
        show(await api(`/api/tasks/${encodeURIComponent(taskId)}/progress`, jsonRequest('PATCH', {
          completionPercentage: Number(values.completionPercentage),
        })));
      } else if (values.status) {
        show({ message: 'Task status updated successfully.' });
      } else {
        throw new Error('Choose a status or enter progress to update.');
      }
    });
    bindSubmit('taskAssignForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/tasks/${encodeURIComponent(values.taskId)}/assign`, jsonRequest('PATCH', { assignee: values.assignee })));
    });
  }

  if (page === 'submissions') {
    bindSubmit('submissionForm', async (formData) => {
      const token = localStorage.getItem(tokenKey);
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed.');
      show(data);
    });
    bindSubmit('submissionReviewForm', async (formData) => {
      const values = formValues(formData);
      const submissionId = values.submissionId;
      delete values.submissionId;
      show(await api(`/api/submissions/${encodeURIComponent(submissionId)}/review`, jsonRequest('PATCH', values)));
    });
  }

  if (page === 'meetings') {
    bindSubmit('meetingForm', async (formData) => {
      show(await api('/api/meetings', jsonRequest('POST', formValues(formData))));
    });
  }

  if (page === 'messages') {
    bindSubmit('messageForm', async (formData) => {
      const values = formValues(formData);
      if (!values.project) delete values.project;
      if (!values.receiver) delete values.receiver;
      show(await api('/api/messages', jsonRequest('POST', values)));
    });
  }

  if (page === 'notifications') {
    bindSubmit('notificationForm', async (formData) => {
      show(await api('/api/notifications', jsonRequest('POST', formValues(formData))));
    });
  }
})();
