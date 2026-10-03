const renderView = (viewName) => (req, res) => {
  res.render(viewName, { user: req.user || null });
};

const renderDashboard = (req, res) => {
  const dashboards = {
    admin: 'dashboard/admin',
    project_manager: 'dashboard/project_manager',
    developer: 'dashboard/developer',
    viewer: 'dashboard/viewer',
  };
  const view = dashboards[req.user.role];

  if (!view) {
    return res.status(403).render('forbidden', { user: req.user });
  }

  return res.render(view, { user: req.user });
};

module.exports = {
  renderLogin: renderView('login'),
  renderRegister: renderView('register'),
  renderDashboard,
  renderUsers: renderView('users'),
  renderWorkspaces: renderView('workspaces'),
  renderProjects: renderView('projects'),
  renderMonitoring: renderView('monitoring'),
  renderReports: renderView('reports'),
  renderTasks: renderView('tasks'),
  renderSubmissions: renderView('submissions'),
  renderMeetings: (req, res) => res.render('meetings', {
    user: req.user,
    iceServers: req.app.locals.iceServers,
  }),
  renderMessages: renderView('messages'),
  renderNotifications: renderView('notifications'),
  renderProfile: renderView('profile'),
  renderPagesIndex: renderView('pages/index'),
};
