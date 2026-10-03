const express = require('express');
const pageController = require('../controllers/pageController');

const router = express.Router();

router.get('/', pageController.renderLogin);
router.get('/login', pageController.renderLogin);
router.get('/register', pageController.renderRegister);
router.get('/dashboard', pageController.renderDashboard);
router.get('/users', pageController.renderUsers);
router.get('/workspaces', pageController.renderWorkspaces);
router.get('/projects', pageController.renderProjects);
router.get('/monitoring', pageController.renderMonitoring);
router.get('/reports', pageController.renderReports);
router.get('/tasks', pageController.renderTasks);
router.get('/submissions', pageController.renderSubmissions);
router.get('/meetings', pageController.renderMeetings);
router.get('/messages', pageController.renderMessages);
router.get('/notifications', pageController.renderNotifications);
router.get('/pages', pageController.renderPagesIndex);
router.get('/pages/*path', pageController.renderPagesIndex);

module.exports = router;
