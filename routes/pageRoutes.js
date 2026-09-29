const express = require('express');
const pageController = require('../controllers/pageController');
const { requirePageAuth, allowPageRoles } = require('../middleware/pageAuth');

const router = express.Router();

router.get('/', pageController.renderLogin);
router.get('/login', pageController.renderLogin);
router.get('/register', pageController.renderRegister);

router.get('/dashboard', requirePageAuth, pageController.renderDashboard);
router.get('/users', requirePageAuth, allowPageRoles('admin', 'project_manager'), pageController.renderUsers);
router.get('/workspaces', requirePageAuth, pageController.renderWorkspaces);
router.get('/projects', requirePageAuth, pageController.renderProjects);
router.get('/monitoring', requirePageAuth, pageController.renderMonitoring);
router.get('/reports', requirePageAuth, pageController.renderReports);
router.get('/tasks', requirePageAuth, pageController.renderTasks);
router.get('/submissions', requirePageAuth, pageController.renderSubmissions);
router.get('/meetings', requirePageAuth, pageController.renderMeetings);
router.get('/messages', requirePageAuth, allowPageRoles('admin', 'project_manager', 'developer'), pageController.renderMessages);
router.get('/notifications', requirePageAuth, pageController.renderNotifications);
router.get('/pages', requirePageAuth, pageController.renderPagesIndex);
router.get('/pages/*path', requirePageAuth, pageController.renderPagesIndex);

module.exports = router;
