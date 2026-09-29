const express = require('express');
const requireAuth = require('../middleware/auth');
const allowRoles = require('../middleware/roles');
const requireWorkspaceAccess = require('../middleware/workspaceAccess');
const { requireProjectAccess } = require('../middleware/projectAccess');
const { uploadSubmissionFiles } = require('../middleware/upload');
const apiController = require('../controllers/apiController');

const router = express.Router();

const requireDevelopment = (req, res, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ message: 'This endpoint is unavailable.' });
  }

  return next();
};

router.get('/health', apiController.handleGetHealth);
router.get('/dashboard', requireAuth, apiController.handleGetDashboard);
router.post('/users/register', apiController.handlePostUsersRegister);
router.post('/users/login', apiController.handlePostUsersLogin);
router.post('/users/logout', apiController.handlePostUsersLogout);
router.get('/users/me', requireAuth, apiController.handleGetUsersMe);
router.get('/users', requireAuth, allowRoles('admin', 'project_manager'), apiController.handleGetUsers);
router.patch('/users/:userId/role', requireAuth, allowRoles('admin'), apiController.handlePatchUsersUserIdRole);
router.post('/workspaces', requireAuth, allowRoles('admin'), apiController.handlePostWorkspaces);
router.get('/workspaces', requireAuth, apiController.handleGetWorkspaces);
router.get('/workspaces/:workspaceId/members', requireAuth, requireWorkspaceAccess, apiController.handleGetWorkspacesWorkspaceIdMembers);
router.post('/workspaces/:workspaceId/members', requireAuth, allowRoles('admin'), requireWorkspaceAccess, apiController.handlePostWorkspacesWorkspaceIdMembers);
router.delete('/workspaces/:workspaceId/members/:userId', requireAuth, allowRoles('admin'), requireWorkspaceAccess, apiController.handleDeleteWorkspacesWorkspaceIdMembersUserId);
router.patch('/workspaces/:workspaceId/role', requireAuth, allowRoles('admin'), requireWorkspaceAccess, apiController.handlePatchWorkspacesWorkspaceIdRole);
router.get('/workspaces/:workspaceId/activity', requireAuth, requireWorkspaceAccess, apiController.handleGetWorkspacesWorkspaceIdActivity);
router.post('/projects', requireAuth, allowRoles('admin'), apiController.handlePostProjects);
router.get('/projects', requireAuth, apiController.handleGetProjects);
router.patch('/projects/:projectId', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, apiController.handlePatchProjectsProjectId);
router.get('/projects/:projectId/monitoring', requireAuth, requireProjectAccess, apiController.handleGetProjectsProjectIdMonitoring);
router.get('/projects/:projectId/report', requireAuth, requireProjectAccess, apiController.handleGetProjectsProjectIdReport);
router.get('/projects/:projectId/members', requireAuth, requireProjectAccess, apiController.handleGetProjectsProjectIdMembers);
router.post('/projects/:projectId/members', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, apiController.handlePostProjectsProjectIdMembers);
router.patch('/projects/:projectId/members/:userId/role', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, apiController.handlePatchProjectsProjectIdMembersUserIdRole);
router.delete('/projects/:projectId/members/:userId', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, apiController.handleDeleteProjectsProjectIdMembersUserId);
router.post('/tasks', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, apiController.handlePostTasks);
router.patch('/tasks/:taskId/assign', requireAuth, allowRoles('admin', 'project_manager'), apiController.handlePatchTasksTaskIdAssign);
router.patch('/tasks/:taskId/status', requireAuth, apiController.handlePatchTasksTaskIdStatus);
router.patch('/tasks/:taskId/progress', requireAuth, apiController.handlePatchTasksTaskIdProgress);
router.get('/tasks', requireAuth, apiController.handleGetTasks);
router.post('/tasks/deadline-alerts', requireAuth, allowRoles('admin', 'project_manager'), apiController.handlePostTasksDeadlineAlerts);
router.post('/submissions', requireAuth, allowRoles('developer'), uploadSubmissionFiles.array('files', 10), requireProjectAccess, apiController.handlePostSubmissions);
router.get('/submissions', requireAuth, apiController.handleGetSubmissions);
router.get('/files/:fileName', requireAuth, apiController.handleGetSubmissionFile);
router.patch('/submissions/:submissionId/review', requireAuth, allowRoles('admin', 'project_manager'), apiController.handlePatchSubmissionsSubmissionIdReview);
router.post('/meetings', requireAuth, allowRoles('admin', 'project_manager', 'developer'), requireWorkspaceAccess, apiController.handlePostMeetings);
router.get('/meetings', requireAuth, apiController.handleGetMeetings);
router.post('/messages', requireAuth, allowRoles('admin', 'project_manager', 'developer'), requireWorkspaceAccess, apiController.handlePostMessages);
router.get('/messages', requireAuth, apiController.handleGetMessages);
router.post('/notifications', requireAuth, allowRoles('admin', 'project_manager'), apiController.handlePostNotifications);
router.get('/notifications', requireAuth, apiController.handleGetNotifications);
router.post('/seed', requireDevelopment, requireAuth, allowRoles('admin'), apiController.handlePostSeed);

module.exports = router;
