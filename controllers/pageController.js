const path = require('path');

const viewDirectory = path.join(__dirname, '..', 'views');

const renderView = (viewName) => (req, res) => {
  res.sendFile(path.join(viewDirectory, viewName));
};

const renderPagesIndex = renderView('pages.html');

module.exports = {
  renderLogin: renderView('login.html'),
  renderRegister: renderView('register.html'),
  renderDashboard: renderView('dashboard.html'),
  renderUsers: renderView('users.html'),
  renderWorkspaces: renderView('workspaces.html'),
  renderProjects: renderView('projects.html'),
  renderMonitoring: renderView('monitoring.html'),
  renderReports: renderView('reports.html'),
  renderTasks: renderView('tasks.html'),
  renderSubmissions: renderView('submissions.html'),
  renderMeetings: renderView('meetings.html'),
  renderMessages: renderView('messages.html'),
  renderNotifications: renderView('notifications.html'),
  renderPagesIndex,
};
