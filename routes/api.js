const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const requireAuth = require('../middleware/auth');
const allowRoles = require('../middleware/roles');
const requireWorkspaceAccess = require('../middleware/workspaceAccess');
const {
  projectFilterForUser,
  requireProjectAccess,
} = require('../middleware/projectAccess');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Meeting = require('../models/Meeting');
const ChatMessage = require('../models/ChatMessage');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const { uploadSubmissionFiles } = require('../middleware/upload');

const router = express.Router();

const normalizeEmail = (email) => email.trim().toLowerCase();

const createToken = (user) => jwt.sign(
  { userId: user._id.toString(), role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
);

const logActivity = async ({ workspace, project = null, user, action, details = '' }) => {
  await ActivityLog.create({ workspace, project, user, action, details });
};

const sanitizeUser = (user) => {
  if (!user) return null;

  const doc = user.toObject ? user.toObject() : user;
  delete doc.password;
  return doc;
};

router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Collaborative Workspace API is running.' });
});

router.get('/dashboard', async (req, res) => {
  try {
    const [usersCount, workspacesCount, projectsCount, tasksCount] = await Promise.all([
      User.countDocuments(),
      Workspace.countDocuments(),
      Project.countDocuments(),
      Task.countDocuments(),
    ]);

    res.json({
      totalUsers: usersCount,
      totalWorkspaces: workspacesCount,
      totalProjects: projectsCount,
      totalTasks: tasksCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Dashboard data could not be loaded.', error: error.message });
  }
});

router.post('/users/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ message: 'Full name, email and password are required.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'A user with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      fullName,
      email: normalizedEmail,
      password: hashedPassword,
      role: 'developer',
    });

    res.status(201).json({
      message: 'User registered successfully.',
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'User registration failed.', error: error.message });
  }
});

router.post('/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    res.json({
      message: 'Login successful.',
      token: createToken(user),
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
});

router.get('/users/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get('/users', requireAuth, allowRoles('admin', 'project_manager'), async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users.map(sanitizeUser));
  } catch (error) {
    res.status(500).json({ message: 'Users could not be loaded.', error: error.message });
  }
});

router.patch('/users/:userId/role', requireAuth, allowRoles('admin'), async (req, res) => {
  try {
    const allowedRoles = ['admin', 'project_manager', 'developer', 'viewer'];
    const { role } = req.body;

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: `Role must be one of: ${allowedRoles.join(', ')}.`,
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { role },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({
      message: 'User role updated successfully.',
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'User role update failed.', error: error.message });
  }
});

router.post('/workspaces', requireAuth, allowRoles('admin'), async (req, res) => {
  try {
    const { name, description, owner, members = [] } = req.body;

    if (!name || !owner) {
      return res.status(400).json({ message: 'Workspace name and owner are required.' });
    }

    const workspace = await Workspace.create({
      name,
      description,
      owner,
      members: [...new Set(members.concat(owner))],
    });

    await User.updateMany({ _id: { $in: workspace.members } }, { $addToSet: { workspaceIds: workspace._id } });
    await logActivity({
      workspace: workspace._id,
      user: req.user._id,
      action: 'workspace_created',
      details: `Workspace "${workspace.name}" was created.`,
    });

    res.status(201).json({ message: 'Workspace created successfully.', workspace });
  } catch (error) {
    res.status(500).json({ message: 'Workspace creation failed.', error: error.message });
  }
});

router.get('/workspaces', requireAuth, async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? {}
      : { $or: [{ owner: req.user._id }, { members: req.user._id }] };
    const workspaces = await Workspace.find(filter).populate('owner members projects');
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ message: 'Workspaces could not be loaded.', error: error.message });
  }
});

router.get('/workspaces/:workspaceId/members', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const members = await User.find({ _id: { $in: req.workspace.members } }).select('-password');
    res.json(members);
  } catch (error) {
    res.status(500).json({ message: 'Workspace members could not be loaded.', error: error.message });
  }
});

router.post('/workspaces/:workspaceId/members', requireAuth, allowRoles('admin'), requireWorkspaceAccess, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    await Workspace.findByIdAndUpdate(req.workspace._id, { $addToSet: { members: user._id } });
    await User.findByIdAndUpdate(user._id, { $addToSet: { workspaceIds: req.workspace._id } });
    await logActivity({
      workspace: req.workspace._id,
      user: req.user._id,
      action: 'workspace_member_added',
      details: `User ${user.email} was added to the workspace.`,
    });

    res.status(201).json({ message: 'Workspace member added successfully.', user: { _id: user._id, email: user.email, fullName: user.fullName } });
  } catch (error) {
    res.status(500).json({ message: 'Workspace member could not be added.', error: error.message });
  }
});

router.delete('/workspaces/:workspaceId/members/:userId', requireAuth, allowRoles('admin'), requireWorkspaceAccess, async (req, res) => {
  try {
    if (req.workspace.owner.toString() === req.params.userId) {
      return res.status(400).json({ message: 'The workspace owner cannot be removed.' });
    }

    await Workspace.findByIdAndUpdate(req.workspace._id, { $pull: { members: req.params.userId } });
    await User.findByIdAndUpdate(req.params.userId, { $pull: { workspaceIds: req.workspace._id } });
    await logActivity({
      workspace: req.workspace._id,
      user: req.user._id,
      action: 'workspace_member_removed',
      details: `User ${req.params.userId} was removed from the workspace.`,
    });

    res.json({ message: 'Workspace member removed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Workspace member could not be removed.', error: error.message });
  }
});

router.patch('/workspaces/:workspaceId/role', requireAuth, allowRoles('admin'), requireWorkspaceAccess, async (req, res) => {
  try {
    const { userId, role } = req.body;
    const allowedRoles = ['admin', 'project_manager', 'developer', 'viewer'];
    if (!userId || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'User ID and a valid role are required.' });
    }

    const user = await User.findByIdAndUpdate(userId, { role }, { new: true }).select('-password');
    if (!user || !req.workspace.members.some((member) => member.toString() === userId)) {
      return res.status(400).json({ message: 'The user must be an active workspace member.' });
    }

    await logActivity({
      workspace: req.workspace._id,
      user: req.user._id,
      action: 'workspace_role_assigned',
      details: `User ${user.email} was assigned role ${role}.`,
    });
    res.json({ message: 'Workspace role assigned successfully.', user });
  } catch (error) {
    res.status(500).json({ message: 'Workspace role assignment failed.', error: error.message });
  }
});

router.get('/workspaces/:workspaceId/activity', requireAuth, requireWorkspaceAccess, async (req, res) => {
  try {
    const logs = await ActivityLog.find({ workspace: req.workspace._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user', 'fullName email role')
      .populate('project', 'name');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Workspace activity could not be loaded.', error: error.message });
  }
});

router.post('/projects', requireAuth, allowRoles('admin'), async (req, res) => {
  try {
    const { name, description, workspace, projectManager, developers = [], status, repositoryUrl, defaultBranch } = req.body;

    if (!name || !workspace || !projectManager) {
      return res.status(400).json({ message: 'Project name, workspace and project manager are required.' });
    }

    const workspaceRecord = await Workspace.findOne({
      _id: workspace,
      members: { $all: [projectManager, ...developers] },
    });
    if (!workspaceRecord) {
      return res.status(400).json({ message: 'Project manager and developers must be workspace members.' });
    }

    const project = await Project.create({
      name,
      description,
      workspace,
      projectManager,
      developers,
      status,
      repositoryUrl,
      defaultBranch,
    });

    await Workspace.findByIdAndUpdate(workspace, { $addToSet: { projects: project._id } });
    await User.updateMany({ _id: { $in: [projectManager, ...developers] } }, { $addToSet: { projectIds: project._id } });

    await Promise.all(
      [projectManager, ...developers].map((userId) =>
        ProjectMember.findOneAndUpdate(
          { project: project._id, user: userId },
          {
            project: project._id,
            user: userId,
            role: userId.toString() === projectManager.toString() ? 'project_manager' : 'developer',
            accessLevel: userId.toString() === projectManager.toString() ? 'admin' : 'write',
          },
          { upsert: true, new: true }
        )
      )
    );
    await logActivity({
      workspace,
      project: project._id,
      user: req.user._id,
      action: 'project_created',
      details: `Project "${project.name}" was created.`,
    });

    res.status(201).json({ message: 'Project created successfully.', project });
  } catch (error) {
    res.status(500).json({ message: 'Project creation failed.', error: error.message });
  }
});

router.get('/projects', requireAuth, async (req, res) => {
  try {
    const projects = await Project.find(projectFilterForUser(req.user))
      .populate('workspace projectManager developers');
    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: 'Projects could not be loaded.', error: error.message });
  }
});

router.patch('/projects/:projectId', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, async (req, res) => {
  try {
    const allowedFields = ['name', 'description', 'status', 'progress', 'repositoryUrl', 'defaultBranch', 'startDate', 'endDate'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );

    if (updates.progress !== undefined && (!Number.isInteger(Number(updates.progress))
      || Number(updates.progress) < 0 || Number(updates.progress) > 100)) {
      return res.status(400).json({ message: 'Project progress must be an integer from 0 to 100.' });
    }

    const project = await Project.findByIdAndUpdate(
      req.project._id,
      updates,
      { new: true, runValidators: true }
    ).populate('workspace projectManager developers');
    await logActivity({
      workspace: project.workspace._id || project.workspace,
      project: project._id,
      user: req.user._id,
      action: 'project_updated',
      details: `Project "${project.name}" was updated.`,
    });

    res.json({ message: 'Project updated successfully.', project });
  } catch (error) {
    res.status(500).json({ message: 'Project update failed.', error: error.message });
  }
});

router.get('/projects/:projectId/monitoring', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const [taskSummary, submissionSummary, activityCount] = await Promise.all([
      Task.aggregate([
        { $match: { project: req.project._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $match: { project: req.project._id } },
        { $group: { _id: '$reviewStatus', count: { $sum: 1 } } },
      ]),
      ActivityLog.countDocuments({ project: req.project._id }),
    ]);

    res.json({
      project: req.project,
      taskSummary,
      submissionSummary,
      activityCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Project monitoring data could not be loaded.', error: error.message });
  }
});

router.get('/projects/:projectId/report', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const [tasks, submissions, meetings] = await Promise.all([
      Task.find({ project: req.project._id }).select('title status completionPercentage dueDate'),
      Submission.find({ project: req.project._id }).select('title reviewStatus submittedAt'),
      Meeting.countDocuments({ project: req.project._id }),
    ]);
    const completedTasks = tasks.filter((task) => task.status === 'completed').length;
    const averageProgress = tasks.length
      ? Math.round(tasks.reduce((total, task) => total + task.completionPercentage, 0) / tasks.length)
      : 0;

    res.json({
      project: req.project,
      totals: {
        tasks: tasks.length,
        completedTasks,
        submissions: submissions.length,
        meetings,
        averageTaskProgress: averageProgress,
      },
      tasks,
      submissions,
    });
  } catch (error) {
    res.status(500).json({ message: 'Project report could not be generated.', error: error.message });
  }
});

router.get('/projects/:projectId/members', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    const members = await ProjectMember.find({
      project: req.params.projectId,
      isActive: true,
    }).populate('user', '-password');

    res.json(members);
  } catch (error) {
    res.status(500).json({ message: 'Project members could not be loaded.', error: error.message });
  }
});

router.post(
  '/projects/:projectId/members',
  requireAuth,
  allowRoles('admin', 'project_manager'),
  requireProjectAccess,
  async (req, res) => {
    try {
      const { userId, role = 'developer', accessLevel = 'write' } = req.body;
      const allowedRoles = ['developer', 'reviewer', 'guest'];
      const allowedAccessLevels = ['read', 'write'];

      if (!userId || !allowedRoles.includes(role) || !allowedAccessLevels.includes(accessLevel)) {
        return res.status(400).json({
          message: 'User ID, valid project role, and valid access level are required.',
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (user._id.toString() === req.project.projectManager.toString()) {
        return res.status(400).json({ message: 'The project manager is already a project member.' });
      }

      const member = await ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: user._id },
        { project: req.project._id, user: user._id, role, accessLevel, isActive: true },
        { upsert: true, new: true, runValidators: true }
      ).populate('user', '-password');

      await Project.findByIdAndUpdate(req.project._id, { $addToSet: { developers: user._id } });
      await User.findByIdAndUpdate(user._id, { $addToSet: { projectIds: req.project._id } });

      res.status(201).json({ message: 'Project member added successfully.', member });
    } catch (error) {
      res.status(500).json({ message: 'Project member could not be added.', error: error.message });
    }
  }
);

router.patch(
  '/projects/:projectId/members/:userId/role',
  requireAuth,
  allowRoles('admin', 'project_manager'),
  requireProjectAccess,
  async (req, res) => {
    try {
      const { role, accessLevel = 'write' } = req.body;
      const member = await ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: req.params.userId, isActive: true },
        { role, accessLevel },
        { new: true, runValidators: true }
      ).populate('user', '-password');

      if (!member) {
        return res.status(404).json({ message: 'Active project member not found.' });
      }

      res.json({ message: 'Project member role updated successfully.', member });
    } catch (error) {
      res.status(500).json({ message: 'Project member role update failed.', error: error.message });
    }
  }
);

router.delete(
  '/projects/:projectId/members/:userId',
  requireAuth,
  allowRoles('admin', 'project_manager'),
  requireProjectAccess,
  async (req, res) => {
    try {
      const member = await ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: req.params.userId, isActive: true },
        { isActive: false },
        { new: true }
      );

      if (!member) {
        return res.status(404).json({ message: 'Active project member not found.' });
      }

      await Project.findByIdAndUpdate(req.project._id, { $pull: { developers: req.params.userId } });
      await User.findByIdAndUpdate(req.params.userId, { $pull: { projectIds: req.project._id } });

      res.json({ message: 'Project member removed successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Project member could not be removed.', error: error.message });
    }
  }
);

router.post('/tasks', requireAuth, allowRoles('admin', 'project_manager'), requireProjectAccess, async (req, res) => {
  try {
    const { title, description, project, workspace, assignee, priority, status, dueDate, labels, branchName } = req.body;

    if (!title || !project || !workspace) {
      return res.status(400).json({ message: 'Task title, project and workspace are required.' });
    }

    if (assignee && !req.project.developers.some((developer) => developer.toString() === assignee)) {
      return res.status(400).json({ message: 'Assignee must be an active developer in this project.' });
    }

    const task = await Task.create({
      title,
      description,
      project,
      workspace,
      assignee,
      reporter: req.user._id,
      priority,
      status,
      dueDate,
      labels,
      branchName,
    });

    res.status(201).json({ message: 'Task created successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task creation failed.', error: error.message });
  }
});

router.patch('/tasks/:taskId/assign', requireAuth, allowRoles('admin', 'project_manager'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = await Project.findOne({
      _id: task.project,
      ...projectFilterForUser(req.user),
    });
    if (!project) {
      return res.status(404).json({ message: 'Task project not found or access denied.' });
    }

    const { assignee } = req.body;
    if (!assignee || !project.developers.some((developer) => developer.toString() === assignee)) {
      return res.status(400).json({ message: 'Assignee must be an active developer in this project.' });
    }

    task.assignee = assignee;
    await task.save();
    res.json({ message: 'Task assigned successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task assignment failed.', error: error.message });
  }
});

router.patch('/tasks/:taskId/status', requireAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = await Project.findOne({ _id: task.project, ...projectFilterForUser(req.user) });
    if (!project) {
      return res.status(404).json({ message: 'Task project not found or access denied.' });
    }

    const canUpdate = ['admin', 'project_manager'].includes(req.user.role)
      || (req.user.role === 'developer' && task.assignee?.toString() === req.user._id.toString());
    if (!canUpdate) {
      return res.status(403).json({ message: 'You can only update tasks assigned to you.' });
    }

    const allowedStatuses = ['todo', 'in_progress', 'in_review', 'completed', 'blocked'];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid task status.' });
    }

    task.status = req.body.status;
    await task.save();
    res.json({ message: 'Task status updated successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task status update failed.', error: error.message });
  }
});

router.patch('/tasks/:taskId/progress', requireAuth, async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = await Project.findOne({ _id: task.project, ...projectFilterForUser(req.user) });
    if (!project) {
      return res.status(404).json({ message: 'Task project not found or access denied.' });
    }

    const canUpdate = ['admin', 'project_manager'].includes(req.user.role)
      || (req.user.role === 'developer' && task.assignee?.toString() === req.user._id.toString());
    if (!canUpdate) {
      return res.status(403).json({ message: 'You can only update tasks assigned to you.' });
    }

    const completionPercentage = Number(req.body.completionPercentage);
    if (!Number.isInteger(completionPercentage) || completionPercentage < 0 || completionPercentage > 100) {
      return res.status(400).json({ message: 'Progress must be an integer from 0 to 100.' });
    }

    task.completionPercentage = completionPercentage;
    await task.save();
    res.json({ message: 'Task progress updated successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task progress update failed.', error: error.message });
  }
});

router.get('/tasks', requireAuth, async (req, res) => {
  try {
    const projectFilter = projectFilterForUser(req.user);
    const accessibleProjects = await Project.find(projectFilter).select('_id');
    const projectIds = accessibleProjects.map((project) => project._id);
    const taskFilter = { project: { $in: projectIds } };
    const { projectId, status, priority, assignee, due, search } = req.query;

    if (projectId) taskFilter.project = { $in: projectIds, $eq: projectId };
    if (status) taskFilter.status = status;
    if (priority) taskFilter.priority = priority;
    if (assignee) taskFilter.assignee = assignee;
    if (search) taskFilter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];

    if (due === 'overdue') {
      taskFilter.dueDate = { $lt: new Date() };
      taskFilter.status = { $nin: ['completed'] };
    } else if (due === 'upcoming') {
      taskFilter.dueDate = {
        $gte: new Date(),
        $lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };
    } else if (due === 'none') {
      taskFilter.dueDate = null;
    }

    const tasks = await Task.find(taskFilter)
      .sort({ dueDate: 1, createdAt: -1 })
      .populate('project workspace assignee reporter');
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Tasks could not be loaded.', error: error.message });
  }
});

router.post('/tasks/deadline-alerts', requireAuth, async (req, res) => {
  try {
    const days = Number(req.body.days || req.query.days || 2);
    if (!Number.isInteger(days) || days < 0 || days > 30) {
      return res.status(400).json({ message: 'Days must be an integer from 0 to 30.' });
    }

    const accessibleProjects = await Project.find(projectFilterForUser(req.user)).select('_id');
    const projectIds = accessibleProjects.map((project) => project._id);
    const now = new Date();
    const deadline = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const tasks = await Task.find({
      project: { $in: projectIds },
      assignee: { $ne: null },
      dueDate: { $lte: deadline },
      status: { $nin: ['completed'] },
    }).select('title dueDate assignee');

    let createdCount = 0;
    for (const task of tasks) {
      const existing = await Notification.findOne({
        user: task.assignee,
        relatedId: task._id,
        type: 'task',
        title: 'Task deadline approaching',
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      });

      if (!existing) {
        await Notification.create({
          user: task.assignee,
          title: task.dueDate < now ? 'Task deadline overdue' : 'Task deadline approaching',
          message: `"${task.title}" is due by ${task.dueDate.toISOString()}.`,
          type: 'task',
          relatedId: task._id,
        });
        createdCount += 1;
      }
    }

    res.json({
      message: 'Deadline alerts checked successfully.',
      matchingTasks: tasks.length,
      notificationsCreated: createdCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Deadline alerts could not be created.', error: error.message });
  }
});

router.post(
  '/submissions',
  requireAuth,
  allowRoles('developer'),
  uploadSubmissionFiles.array('files', 10),
  requireProjectAccess,
  async (req, res) => {
    try {
      const { project, task, title, description, branchName } = req.body;

      if (!project || !task || !title) {
        return res.status(400).json({ message: 'Project, task and submission title are required.' });
      }

      const files = (req.files || []).map((file) => ({
        fileName: file.originalname,
        downloadUrl: `/uploads/${file.filename}`,
        fileType: file.mimetype || 'application/octet-stream',
        size: file.size,
      }));

      const submission = await Submission.create({
        project,
        task,
        developer: req.user._id,
        title,
        description,
        branchName,
        files,
      });

      res.status(201).json({ message: 'Submission created successfully.', submission });
    } catch (error) {
      (req.files || []).forEach((file) => {
        try {
          require('fs').unlinkSync(file.path);
        } catch (cleanupError) {
          console.error('Uploaded file cleanup failed:', cleanupError.message);
        }
      });
      res.status(500).json({ message: 'Submission creation failed.', error: error.message });
    }
  }
);

router.get('/submissions', requireAuth, async (req, res) => {
  try {
    const accessibleProjects = await Project.find(projectFilterForUser(req.user)).select('_id');
    const projectIds = accessibleProjects.map((project) => project._id);
    const submissionFilter = req.query.projectId
      ? { project: { $in: projectIds, $eq: req.query.projectId } }
      : { project: { $in: projectIds } };
    const submissions = await Submission.find(submissionFilter).populate('project task developer');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Submissions could not be loaded.', error: error.message });
  }
});

router.patch('/submissions/:submissionId/review', requireAuth, allowRoles('admin', 'project_manager'), async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    const project = await Project.findOne({
      _id: submission.project,
      ...projectFilterForUser(req.user),
    });
    if (!project) {
      return res.status(404).json({ message: 'Submission project not found or access denied.' });
    }

    const allowedStatuses = ['approved', 'changes_requested'];
    if (!allowedStatuses.includes(req.body.reviewStatus)) {
      return res.status(400).json({ message: 'Review status must be approved or changes_requested.' });
    }

    submission.reviewStatus = req.body.reviewStatus;
    submission.reviewNotes = req.body.reviewNotes || '';
    await submission.save();
    res.json({ message: 'Submission review updated successfully.', submission });
  } catch (error) {
    res.status(500).json({ message: 'Submission review failed.', error: error.message });
  }
});

router.post('/meetings', requireAuth, allowRoles('admin', 'project_manager', 'developer'), async (req, res, next) => {
  try {
    const { title, project, workspace, attendees = [], scheduledAt, durationMinutes, meetingType, agenda } = req.body;

    if (!title || !workspace || !scheduledAt) {
      return res.status(400).json({ message: 'Meeting title, workspace and schedule time are required.' });
    }

    if (project) {
      req.body.project = project;
      return requireProjectAccess(req, res, async () => {
        const meeting = await Meeting.create({
          title,
          project,
          workspace,
          host: req.user._id,
          attendees,
          scheduledAt,
          durationMinutes,
          meetingType,
          agenda,
        });

        return res.status(201).json({ message: 'Meeting scheduled successfully.', meeting });
      });
    }

    const meeting = await Meeting.create({
      title,
      project,
      workspace,
      host: req.user._id,
      attendees,
      scheduledAt,
      durationMinutes,
      meetingType,
      agenda,
    });

    res.status(201).json({ message: 'Meeting scheduled successfully.', meeting });
  } catch (error) {
    res.status(500).json({ message: 'Meeting scheduling failed.', error: error.message });
  }
});

router.get('/meetings', requireAuth, async (req, res) => {
  try {
    const accessibleProjects = await Project.find(projectFilterForUser(req.user)).select('_id');
    const projectIds = accessibleProjects.map((project) => project._id);
    const meetingFilter = req.query.projectId
      ? { $or: [{ project: { $in: projectIds, $eq: req.query.projectId } }, { project: null }] }
      : { $or: [{ project: { $in: projectIds } }, { project: null }] };
    const meetings = await Meeting.find(meetingFilter).populate('project workspace host attendees');
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: 'Meetings could not be loaded.', error: error.message });
  }
});

router.post('/messages', requireAuth, allowRoles('admin', 'project_manager', 'developer'), async (req, res) => {
  try {
    const { workspace, project, receiver, content, messageType, attachments = [] } = req.body;

    if (!workspace || !content) {
      return res.status(400).json({ message: 'Workspace and message content are required.' });
    }

    if (project) {
      return requireProjectAccess(req, res, async () => {
        const message = await ChatMessage.create({
          workspace,
          project,
          sender: req.user._id,
          receiver,
          content,
          messageType,
          attachments,
        });

        return res.status(201).json({ message: 'Message sent successfully.', message });
      });
    }

    const message = await ChatMessage.create({
      workspace,
      project,
      sender: req.user._id,
      receiver,
      content,
      messageType,
      attachments,
    });

    res.status(201).json({ message: 'Message sent successfully.', message });
  } catch (error) {
    res.status(500).json({ message: 'Message sending failed.', error: error.message });
  }
});

router.get('/messages', requireAuth, async (req, res) => {
  try {
    const accessibleProjects = await Project.find(projectFilterForUser(req.user)).select('_id');
    const projectIds = accessibleProjects.map((project) => project._id);
    const messageFilter = req.query.projectId
      ? { project: { $in: projectIds, $eq: req.query.projectId } }
      : { $or: [{ project: { $in: projectIds } }, { project: null }] };
    const messages = await ChatMessage.find(messageFilter).populate('workspace project sender receiver');
    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: 'Messages could not be loaded.', error: error.message });
  }
});

router.post('/notifications', requireAuth, allowRoles('admin', 'project_manager'), async (req, res) => {
  try {
    const { user, title, message, type, relatedId } = req.body;

    if (!user || !title || !message) {
      return res.status(400).json({ message: 'User, title and message are required.' });
    }

    const notification = await Notification.create({ user, title, message, type, relatedId });
    res.status(201).json({ message: 'Notification created successfully.', notification });
  } catch (error) {
    res.status(500).json({ message: 'Notification creation failed.', error: error.message });
  }
});

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('user');
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Notifications could not be loaded.', error: error.message });
  }
});

router.post('/seed', async (req, res) => {
  try {
    const adminUser = await User.findOne({ email: 'admin@workspace.com' });
    if (adminUser) {
      return res.status(200).json({ message: 'Demo data already seeded.', users: await User.countDocuments() });
    }

    const admin = await User.create({
      fullName: 'System Admin',
      email: 'admin@workspace.com',
      password: await bcrypt.hash('admin123', 10),
      role: 'admin',
    });

    const pm = await User.create({
      fullName: 'Project Manager',
      email: 'manager@workspace.com',
      password: await bcrypt.hash('manager123', 10),
      role: 'project_manager',
    });

    const dev1 = await User.create({
      fullName: 'Developer One',
      email: 'dev1@workspace.com',
      password: await bcrypt.hash('dev123', 10),
      role: 'developer',
    });

    const dev2 = await User.create({
      fullName: 'Developer Two',
      email: 'dev2@workspace.com',
      password: await bcrypt.hash('dev123', 10),
      role: 'developer',
    });

    const workspace = await Workspace.create({
      name: 'Core Development Workspace',
      description: 'Main workspace for the company software development projects.',
      owner: admin._id,
      members: [admin._id, pm._id, dev1._id, dev2._id],
    });

    const project = await Project.create({
      name: 'Collaborative Workspace Platform',
      description: 'Build the developer collaboration platform with task tracking and code review workflow.',
      workspace: workspace._id,
      projectManager: pm._id,
      developers: [dev1._id, dev2._id],
      status: 'in_progress',
      progress: 42,
      defaultBranch: 'main',
    });

    await Workspace.findByIdAndUpdate(workspace._id, { $set: { projects: [project._id] } });

    const task = await Task.create({
      title: 'Create login and workspace dashboard',
      description: 'Design and implement the initial login flow and dashboard for system users.',
      project: project._id,
      workspace: workspace._id,
      assignee: dev1._id,
      reporter: pm._id,
      priority: 'high',
      status: 'in_progress',
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      branchName: 'feature/login-dashboard',
    });

    await Submission.create({
      project: project._id,
      task: task._id,
      developer: dev1._id,
      title: 'Login and dashboard submission',
      description: 'Initial version of the dashboard and user login screens.',
      branchName: 'feature/login-dashboard',
      files: [{ fileName: 'dashboard.zip', downloadUrl: 'https://example.com/files/dashboard.zip', fileType: 'application/zip', size: 1024 }],
      reviewStatus: 'pending',
    });

    await Meeting.create({
      title: 'Sprint Planning Meeting',
      project: project._id,
      workspace: workspace._id,
      host: pm._id,
      attendees: [admin._id, dev1._id, dev2._id],
      scheduledAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
      durationMinutes: 60,
      meetingType: 'video',
      agenda: 'Review sprint goal, assign tasks, approve branch strategy.',
    });

    await Notification.create({
      user: dev1._id,
      title: 'New task assigned',
      message: 'You have been assigned to the login dashboard task.',
      type: 'task',
    });

    res.status(201).json({
      message: 'Demo data seeded successfully.',
      admin,
      projectManager: pm,
      developers: [dev1, dev2],
      workspace,
      project,
      task,
    });
  } catch (error) {
    res.status(500).json({ message: 'Demo seeding failed.', error: error.message });
  }
});

module.exports = router;
