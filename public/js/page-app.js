(() => {
  const tokenKey = 'collaborativeWorkspaceToken';
  const page = document.body.dataset.page;
  const messageElement = document.getElementById('message');
  const dataElement = document.getElementById('data');

  const show = (data) => {
    if (messageElement) messageElement.textContent = 'Operation completed.';
    if (dataElement) dataElement.textContent = JSON.stringify(data, null, 2);
  };

  const renderList = (id, items, emptyMessage, renderItem) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = emptyMessage;
      list.append(emptyItem);
      return;
    }
    items.forEach((item) => {
      const listItem = document.createElement('li');
      renderItem(listItem, item);
      list.append(listItem);
    });
  };

  const textWithId = (item, value, id) => {
    item.textContent = `${value} (ID: ${id})`;
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
      if (data.user?.role) localStorage.setItem('collaborativeWorkspaceRole', data.user.role);
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

    bindLogout();

    Promise.all([
      api('/api/users/me'),
      api('/api/dashboard'),
      api('/api/projects'),
      api('/api/tasks'),
      api('/api/notifications'),
    ]).then(([userData, stats, projects, tasks, notifications]) => {
      if (!userData) return;
      localStorage.setItem('collaborativeWorkspaceRole', userData.user.role);
      const statsElement = document.getElementById('stats');
      if (statsElement) {
        const values = userData.user.role === 'admin'
          ? [`Users: ${stats.totalUsers}`, `Workspaces: ${stats.totalWorkspaces}`, `Projects: ${stats.totalProjects}`, `Tasks: ${stats.totalTasks}`]
          : [`Projects: ${stats.totalProjects}`, `Tasks: ${stats.totalTasks}`, `Completed tasks: ${stats.totalCompletedTasks}`, `Submissions: ${stats.totalSubmissions}`];
        statsElement.textContent = values.join(' | ');
      }
      renderList('projects', projects, 'No accessible projects.', (item, project) => {
        textWithId(item, `${project.name} — ${project.status}`, project._id);
      });
      renderList('tasks', tasks, 'No tasks are assigned or available to you.', (item, task) => {
        textWithId(item, `${task.title} — ${task.status} — ${task.completionPercentage}%`, task._id);
      });
      renderList('notifications', notifications, 'No notifications.', (item, notification) => {
        item.textContent = `${notification.title}: ${notification.message}`;
      });
    }).catch((error) => {
      fail(error);
    });
    return;
  }

  function bindLogout() {
    const logoutButton = document.getElementById('logoutButton');
    if (!logoutButton) return;
    logoutButton.addEventListener('click', async () => {
      try {
        await fetch('/api/users/logout', { method: 'POST' });
      } finally {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem('collaborativeWorkspaceRole');
        window.location.href = '/login';
      }
    });
  }

  bindLogout();

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
  const listTargets = {
    users: ['users', 'No users are visible to this account.', (item, user) => {
      textWithId(item, `${user.fullName} — ${user.email} — ${user.role}`, user._id);
    }],
    workspaces: ['workspaces', 'No workspaces are available to this account.', (item, workspace) => {
      const members = Array.isArray(workspace.members) ? workspace.members.length : 0;
      textWithId(item, `${workspace.name} — ${members} members`, workspace._id);
    }],
    projects: ['projects', 'No projects are available to this account.', (item, project) => {
      textWithId(item, `${project.name} — ${project.status} — ${project.progress}%`, project._id);
    }],
    tasks: ['tasks', 'No tasks are assigned or available to you.', (item, task) => {
      textWithId(item, `${task.title} — ${task.status} — ${task.completionPercentage}%`, task._id);
    }],
    submissions: ['submissions', 'No submissions are available to this account.', (item, submission) => {
      textWithId(item, `${submission.title} — ${submission.reviewStatus} — ${submission.branchName || 'no branch'}`, submission._id);
      (submission.files || []).forEach((file) => {
        const link = document.createElement('a');
        const storedPath = new URL(file.downloadUrl, window.location.origin).pathname;
        const fileName = storedPath.split('/').pop();
        link.href = `/api/files/${encodeURIComponent(decodeURIComponent(fileName))}`;
        link.textContent = `Download ${file.fileName}`;
        link.setAttribute('download', file.fileName);
        item.append(document.createElement('br'), link);
      });
    }],
    meetings: ['meetings', 'No meetings are available to this account.', (item, meeting) => {
      textWithId(item, `${meeting.title} — ${new Date(meeting.scheduledAt).toLocaleString()} — ${meeting.status}`, meeting._id);
    }],
    messages: ['messages', 'No messages are available to this account.', (item, message) => {
      textWithId(item, `${message.sender?.fullName || 'Member'}: ${message.content}`, message._id);
    }],
    notifications: ['notifications', 'No notifications.', (item, notification) => {
      textWithId(item, `${notification.title}: ${notification.message}`, notification._id);
    }],
  };
  const load = async (endpoint, target = listTargets[page]) => {
    try {
      const result = await api(endpoint);
      if (target && Array.isArray(result)) {
        renderList(target[0], result, target[1], target[2]);
      } else {
        show(result);
      }
    } catch (error) {
      fail(error);
    }
  };
  if (endpoints[page] && page !== 'dashboard') {
    const target = page === 'monitoring'
      ? ['monitoringProjects', 'No accessible projects.', listTargets.projects[2]]
      : page === 'reports'
        ? ['reportProjects', 'No accessible projects.', listTargets.projects[2]]
        : listTargets[page];
    load(endpoints[page], target);
  }

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
      show(await api(`/api/workspaces/${encodeURIComponent(values.roleWorkspaceId)}/role`, jsonRequest('PATCH', {
        userId: values.roleUserId,
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
    bindSubmit('projectMemberForm', async (formData) => {
      const values = formValues(formData);
      const projectId = values.projectId;
      delete values.projectId;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members`, jsonRequest('POST', values)));
    });
    bindSubmit('projectMemberRoleForm', async (formData) => {
      const values = formValues(formData);
      const { projectId, userId, ...role } = values;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/role`, jsonRequest('PATCH', role)));
    });
    bindSubmit('projectMemberRemoveForm', async (formData) => {
      const { projectId, userId } = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }));
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
    bindSubmit('taskFilterForm', async (formData) => {
      const values = formValues(formData);
      const query = new URLSearchParams(
        Object.entries(values).filter(([, value]) => Boolean(value))
      );
      await load(`/api/tasks?${query.toString()}`, listTargets.tasks);
    });
    bindSubmit('deadlineAlertForm', async (formData) => {
      const values = formValues(formData);
      show(await api('/api/tasks/deadline-alerts', jsonRequest('POST', { days: Number(values.days) })));
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
      const values = formValues(formData);
      values.attendees = values.attendees ? values.attendees.split(',').map((id) => id.trim()).filter(Boolean) : [];
      if (!values.project) delete values.project;
      show(await api('/api/meetings', jsonRequest('POST', values)));
    });
  }

  if (page === 'messages') {
    bindSubmit('messageFilterForm', async (formData) => {
      const { projectId } = formValues(formData);
      const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
      await load(`/api/messages${query}`, listTargets.messages);
    });
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
