const output = document.getElementById('output');
const dashboard = document.getElementById('dashboard');

const printOutput = (data) => {
  output.textContent = JSON.stringify(data, null, 2);
};

const renderDashboard = (stats) => {
  dashboard.innerHTML = `
    <div class="stat-box">
      <span class="stat-label">Users</span>
      <span class="stat-value">${stats.totalUsers ?? 0}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Workspaces</span>
      <span class="stat-value">${stats.totalWorkspaces ?? 0}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Projects</span>
      <span class="stat-value">${stats.totalProjects ?? 0}</span>
    </div>
    <div class="stat-box">
      <span class="stat-label">Tasks</span>
      <span class="stat-value">${stats.totalTasks ?? 0}</span>
    </div>
  `;
};

const apiRequest = async (endpoint, options = {}) => {
  const response = await fetch(`/api${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
};

const fetchDashboard = async () => {
  try {
    const data = await apiRequest('/dashboard');
    renderDashboard(data);
  } catch (error) {
    printOutput({ error: error.message });
  }
};

document.getElementById('seedDataBtn').addEventListener('click', async () => {
  try {
    const data = await apiRequest('/seed', { method: 'POST' });
    printOutput(data);
    fetchDashboard();
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target).entries());
  try {
    const data = await apiRequest('/users/register', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    printOutput(data);
    fetchDashboard();
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target).entries());
  try {
    const data = await apiRequest('/users/login', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    printOutput(data);
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('workspaceForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target).entries());
  const payload = {
    ...formData,
    members: formData.members ? formData.members.split(',').map((item) => item.trim()).filter(Boolean) : [],
  };

  try {
    const data = await apiRequest('/workspaces', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    printOutput(data);
    fetchDashboard();
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('projectForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target).entries());
  const payload = {
    ...formData,
    developers: formData.developers ? formData.developers.split(',').map((item) => item.trim()).filter(Boolean) : [],
  };

  try {
    const data = await apiRequest('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    printOutput(data);
    fetchDashboard();
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('taskForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target).entries());
  try {
    const data = await apiRequest('/tasks', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    printOutput(data);
    fetchDashboard();
  } catch (error) {
    printOutput({ error: error.message });
  }
});

document.getElementById('submissionForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = Object.fromEntries(new FormData(event.target).entries());
  try {
    const data = await apiRequest('/submissions', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    printOutput(data);
  } catch (error) {
    printOutput({ error: error.message });
  }
});

fetchDashboard();
