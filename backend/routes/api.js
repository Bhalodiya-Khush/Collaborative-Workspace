const express = require('express');
const requireAuth = require('../middleware/auth');
const requireWorkspaceAccess = require('../middleware/workspaceAccess');
const {
  requireWorkspaceAdmin,
  requireWorkspaceRole,
} = require('../middleware/workspaceAccess');
const {
  requireProjectAccess,
  requireTaskProjectAccess,
  requireProjectRoles,
} = require('../middleware/projectAccess');
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
router.patch('/users/me', requireAuth, apiController.handlePatchUsersMe);
router.patch('/users/me/password', requireAuth, apiController.handlePatchUsersMePassword);
router.get('/users', requireAuth, requireWorkspaceRole('admin', 'project_manager'), apiController.handleGetUsers);
router.post('/workspaces', requireAuth, apiController.handlePostWorkspaces);
router.get('/workspaces', requireAuth, apiController.handleGetWorkspaces);
router.patch('/workspaces/:workspaceId', requireAuth, requireWorkspaceAdmin, apiController.handlePatchWorkspacesWorkspaceId);
router.get('/workspaces/:workspaceId/members', requireAuth, requireWorkspaceAccess, apiController.handleGetWorkspacesWorkspaceIdMembers);
router.post('/workspaces/:workspaceId/members', requireAuth, requireWorkspaceAdmin, apiController.handlePostWorkspacesWorkspaceIdMembers);
router.delete('/workspaces/:workspaceId/members/:userId', requireAuth, requireWorkspaceAdmin, apiController.handleDeleteWorkspacesWorkspaceIdMembersUserId);
router.patch('/workspaces/:workspaceId/role', requireAuth, requireWorkspaceAdmin, apiController.handlePatchWorkspacesWorkspaceIdRole);
router.get('/workspaces/:workspaceId/activity', requireAuth, requireWorkspaceAccess, apiController.handleGetWorkspacesWorkspaceIdActivity);
router.post('/projects', requireAuth, requireWorkspaceAdmin, apiController.handlePostProjects);
router.get('/projects', requireAuth, apiController.handleGetProjects);
router.patch('/projects/:projectId', requireAuth, requireProjectAccess('manage'), apiController.handlePatchProjectsProjectId);
router.patch('/projects/:projectId/manager', requireAuth, requireProjectAccess('manage'), requireProjectRoles('admin'), apiController.handlePatchProjectsProjectIdManager);
router.get('/projects/:projectId/monitoring', requireAuth, requireProjectAccess('read'), requireProjectRoles('admin', 'project_manager'), apiController.handleGetProjectsProjectIdMonitoring);
router.get('/projects/:projectId/report', requireAuth, requireProjectAccess('read'), requireProjectRoles('admin', 'project_manager'), apiController.handleGetProjectsProjectIdReport);
router.get('/projects/:projectId/members', requireAuth, requireProjectAccess('read'), apiController.handleGetProjectsProjectIdMembers);
router.post('/projects/:projectId/members', requireAuth, requireProjectAccess('manage'), apiController.handlePostProjectsProjectIdMembers);
router.patch('/projects/:projectId/members/:userId/role', requireAuth, requireProjectAccess('manage'), apiController.handlePatchProjectsProjectIdMembersUserIdRole);
router.delete('/projects/:projectId/members/:userId', requireAuth, requireProjectAccess('manage'), apiController.handleDeleteProjectsProjectIdMembersUserId);
router.post('/tasks', requireAuth, requireProjectAccess('manage'), apiController.handlePostTasks);
router.patch('/tasks/:taskId', requireAuth, requireTaskProjectAccess('manage'), apiController.handlePatchTasksTaskId);
router.patch('/tasks/:taskId/assign', requireAuth, requireTaskProjectAccess('manage'), apiController.handlePatchTasksTaskIdAssign);
router.patch('/tasks/:taskId/status', requireAuth, requireTaskProjectAccess('write'), apiController.handlePatchTasksTaskIdStatus);
router.patch('/tasks/:taskId/progress', requireAuth, requireTaskProjectAccess('write'), apiController.handlePatchTasksTaskIdProgress);
router.get('/tasks', requireAuth, apiController.handleGetTasks);
router.post('/tasks/deadline-alerts', requireAuth, apiController.handlePostTasksDeadlineAlerts);
router.post('/submissions', requireAuth, uploadSubmissionFiles.array('files', 10), requireProjectAccess('write'), apiController.handlePostSubmissions);
router.get('/submissions', requireAuth, apiController.handleGetSubmissions);
router.get('/files/:fileName', requireAuth, apiController.handleGetSubmissionFile);
router.patch('/submissions/:submissionId/review', requireAuth, apiController.handlePatchSubmissionsSubmissionIdReview);
router.post('/meetings', requireAuth, requireWorkspaceAccess, apiController.handlePostMeetings);
router.get('/meetings', requireAuth, apiController.handleGetMeetings);
router.patch('/meetings/:meetingId/end', requireAuth, apiController.handlePatchMeetingsMeetingIdEnd);
router.post('/messages', requireAuth, requireWorkspaceAccess, apiController.handlePostMessages);
router.get('/messages', requireAuth, apiController.handleGetMessages);
router.post('/notifications', requireAuth, apiController.handlePostNotifications);
router.get('/notifications', requireAuth, apiController.handleGetNotifications);
router.patch('/notifications/read-all', requireAuth, apiController.handlePatchNotificationsReadAll);
router.patch('/notifications/:notificationId/read', requireAuth, apiController.handlePatchNotificationsNotificationIdRead);
router.post('/seed', requireDevelopment, requireAuth, apiController.handlePostSeed);

module.exports = router;
