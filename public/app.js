const output = document.getElementById('output');
const dashboard = document.getElementById('dashboard');
const authStatus = document.getElementById('authStatus');
const tokenStorageKey = 'collaborativeWorkspaceToken';

let currentUser = null;

const printOutput = (data) => {
  output.textContent = JSON.stringify(data, null, 2);
};

const getToken = () => localStorage.getItem(tokenStorageKey);

const updateAuthStatus = (user = null) => {
  currentUser = user;
  authStatus.textContent = user
    ? `Logged in: ${user.fullName} (${user.role})`
    : 'Not logged in';
};

const apiRequest = async (endpoint, options = {}) => {
  const token = getToken();
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
};

const apiFormRequest = async (endpoint, formData) => {
  const token = getToken();
  const response = await fetch(`/api${endpoint}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
};

const renderDashboard = (stats) => {
  dashboard.innerHTML = `
    <div class="stat-box"><span class="stat-label">Users</span><span class="stat-value">${stats.totalUsers ?? 0}</span></div>
    <div class="stat-box"><span class="stat-label">Workspaces</span><span class="stat-value">${stats.totalWorkspaces ?? 0}</span></div>
    <div class="stat-box"><span class="stat-label">Projects</span><span class="stat-value">${stats.totalProjects ?? 0}</span></div>
    <div class="stat-box"><span class="stat-label">Tasks</span><span class="stat-value">${stats.totalTasks ?? 0}</span></div>
  `;
};

const submitForm = async (event, endpoint, transform = (data) => data, afterSubmit = () => {}) => {
  event.preventDefault();
  try {
    const data = await apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(transform(Object.fromEntries(new FormData(event.target).entries()))),
    });
    printOutput(data);
    afterSubmit();
  } catch (error) {
    printOutput({ error: error.message });
  }
};

const fetchDashboard = async () => {
  try {
    renderDashboard(await apiRequest('/dashboard'));
  } catch (error) {
    printOutput({ error: error.message });
  }
};

const loadCurrentUser = async () => {
  if (!getToken()) {
    updateAuthStatus();
    return;
  }

  try {
    const data = await apiRequest('/users/me');
    updateAuthStatus(data.user);
  } catch (error) {
    localStorage.removeItem(tokenStorageKey);
    updateAuthStatus();
    printOutput({ error: error.message });
  }
};

document.getElementById('seedDataBtn').addEventListener('click', async () => {
  try {
    printOutput(await apiRequest('/seed', { method: 'POST' }));
    fetchDashboard();
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('registerForm').addEventListener('submit', (event) => (
  submitForm(event, '/users/register', (data) => data, fetchDashboard)
));

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const data = await apiRequest('/users/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(event.target).entries())),
    });
    localStorage.setItem(tokenStorageKey, data.token);
    updateAuthStatus(data.user);
    printOutput(data);
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem(tokenStorageKey);
  updateAuthStatus();
  printOutput({ message: 'Logged out successfully.' });
});

document.getElementById('workspaceForm').addEventListener('submit', (event) => (
  submitForm(event, '/workspaces', (data) => ({
    ...data,
    members: data.members ? data.members.split(',').map((item) => item.trim()).filter(Boolean) : [],
  }), fetchDashboard)
));

document.getElementById('projectForm').addEventListener('submit', (event) => (
  submitForm(event, '/projects', (data) => ({
    ...data,
    developers: data.developers ? data.developers.split(',').map((item) => item.trim()).filter(Boolean) : [],
  }), fetchDashboard)
));

document.getElementById('taskForm').addEventListener('submit', (event) => (
  submitForm(event, '/tasks', (data) => data, fetchDashboard)
));

document.getElementById('submissionForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    printOutput(await apiFormRequest('/submissions', new FormData(event.target)));
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('memberForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    printOutput(await apiRequest(`/projects/${data.projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }));
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('taskAssignForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    printOutput(await apiRequest(`/tasks/${data.taskId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assignee: data.assignee }),
    }));
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('taskUpdateForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    const statusResult = await apiRequest(`/tasks/${data.taskId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: data.status }),
    });
    const progressResult = await apiRequest(`/tasks/${data.taskId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify({ completionPercentage: Number(data.completionPercentage) }),
    });
    printOutput({ statusResult, progressResult });
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('reviewForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  try {
    printOutput(await apiRequest(`/submissions/${data.submissionId}/review`, {
      method: 'PATCH',
      body: JSON.stringify({
        reviewStatus: data.reviewStatus,
        reviewNotes: data.reviewNotes,
      }),
    }));
  } catch (error) {
    printOutput({ error: error.message });
  }
});

loadCurrentUser();
fetchDashboard();
