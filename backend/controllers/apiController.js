const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { getAccessibleProjectIds, resolveProjectAccess } = require('../middleware/projectAccess');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Meeting = require('../models/Meeting');
const ChatMessage = require('../models/ChatMessage');
const Notification = require('../models/Notification');
const ActivityLog = require('../models/ActivityLog');
const path = require('path');
const { uploadDirectory } = require('../middleware/upload');
const {
  emitNotification,
  disconnectUserSockets,
  emitProjectChatMessage,
  emitMeetingEnded,
} = require('../services/realtime');

const normalizeEmail = (email) => email.trim().toLowerCase();
const workspaceFilterForUser = async (user) => {
  const [ownedWorkspaceIds, memberWorkspaceIds] = await Promise.all([
    Workspace.find({ owner: user._id, status: 'active' }).distinct('_id'),
    WorkspaceMember.find({
      user: user._id,
      isActive: true,
    }).distinct('workspace'),
  ]);
  return {
    _id: { $in: [...new Set([...ownedWorkspaceIds, ...memberWorkspaceIds].map(String))] },
    status: 'active',
  };
};

const getAdminWorkspaceIds = async (user) => {
  const [owned, memberships] = await Promise.all([
    Workspace.find({ owner: user._id, status: 'active' }).distinct('_id'),
    WorkspaceMember.find({ user: user._id, role: 'admin', isActive: true }).distinct('workspace'),
  ]);
  return [...new Set([...owned, ...memberships].map((id) => id.toString()))]
    .map((id) => new mongoose.Types.ObjectId(id));
};

const createToken = (user) => jwt.sign(
  { userId: user._id.toString(), tokenVersion: user.tokenVersion || 0 },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
);

const sanitizeUser = (user) => {
  if (!user) return null;

  const doc = user.toObject ? user.toObject() : { ...user };
  delete doc.password;
  delete doc.tokenVersion;
  return doc;
};

const logActivity = (activity) => ActivityLog.create(activity);

const createNotification = async (notificationData) => {
  const notification = await Notification.create(notificationData);
  emitNotification(notification);
  return notification;
};

const recalculateProjectProgress = async (projectId) => {
  const [summary] = await Task.aggregate([
    { $match: { project: projectId } },
    {
      $group: {
        _id: '$project',
        averageProgress: { $avg: '$completionPercentage' },
      },
    },
  ]);

  return Project.findByIdAndUpdate(projectId, {
    progress: summary ? Math.round(summary.averageProgress) : 0,
  });
};

const handleGetHealth = (req, res) => {
  res.json({ status: 'ok', message: 'Collaborative Workspace API is running.' });
};

const handleGetDashboard = async (req, res) => {
  try {
    const adminWorkspaceIds = await getAdminWorkspaceIds(req.user);
    if (adminWorkspaceIds.length) {
      const workspaceIds = adminWorkspaceIds;
      const projectIds = await Project.find({ workspace: { $in: workspaceIds } }).distinct('_id');
      const memberIds = await Workspace.find({ _id: { $in: workspaceIds } }).distinct('members');
      const [totalUsers, totalWorkspaces, totalProjects, totalTasks, pendingSubmissions, pendingTasks] = await Promise.all([
        User.countDocuments({ _id: { $in: memberIds }, isActive: true }),
        Workspace.countDocuments({ _id: { $in: workspaceIds } }),
        Project.countDocuments({ _id: { $in: projectIds } }),
        Task.countDocuments({ project: { $in: projectIds } }),
        Submission.countDocuments({ project: { $in: projectIds }, reviewStatus: 'pending' }),
        Task.countDocuments({ project: { $in: projectIds }, status: { $ne: 'completed' } }),
      ]);

      const stats = {
        totalUsers,
        totalWorkspaces,
        totalProjects,
        totalTasks,
        pendingSubmissions,
        pendingTasks,
      };

      return res.json({ ...stats, stats });
    }

    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const taskFilter = { project: { $in: projectIds } };
    const [totalTasks, totalCompletedTasks, totalSubmissions, pendingTasks, pendingSubmissions, mySubmissions] = await Promise.all([
      Task.countDocuments(taskFilter),
      Task.countDocuments({ ...taskFilter, status: 'completed' }),
      Submission.countDocuments({ project: { $in: projectIds } }),
      Task.countDocuments({ ...taskFilter, status: { $ne: 'completed' } }),
      Submission.countDocuments({ project: { $in: projectIds }, reviewStatus: 'pending' }),
      Submission.countDocuments({ developer: req.user._id, project: { $in: projectIds } }),
    ]);

    const stats = {
      totalProjects: projectIds.length,
      totalTasks,
      totalCompletedTasks,
      totalSubmissions,
      pendingTasks,
      pendingSubmissions,
      mySubmissions,
    };

    return res.json({
      ...stats,
      stats,
    });
  } catch (error) {
    res.status(500).json({ message: 'Dashboard data could not be loaded.', error: error.message });
  }
};

const handlePostUsersRegister = async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (
      typeof fullName !== 'string' || !fullName.trim()
      || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72
    ) {
      return res.status(400).json({
        message: 'A full name, valid email and password between 8 and 72 bytes are required.',
      });
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
    });

    res.status(201).json({
      message: 'User registered successfully.',
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'User registration failed.', error: error.message });
  }
};

const handlePostUsersLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const token = createToken(user);
    res.cookie('collaborativeWorkspaceToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });

    res.json({
      message: 'Login successful.',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
};

const handlePostUsersLogout = (req, res) => {
  res.clearCookie('collaborativeWorkspaceToken', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.json({ message: 'Logged out successfully.' });
};

const handleGetUsersMe = (req, res) => {
  res.json({ user: req.user });
};

const handlePatchUsersMe = async (req, res) => {
  try {
    const allowedFields = ['fullName', 'email', 'profileImage', 'skills'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Provide at least one profile field to update.' });
    }
    if (updates.fullName !== undefined && (typeof updates.fullName !== 'string' || !updates.fullName.trim())) {
      return res.status(400).json({ message: 'Full name cannot be empty.' });
    }
    if (updates.email !== undefined && (
      typeof updates.email !== 'string'
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email.trim())
    )) {
      return res.status(400).json({ message: 'A valid email address is required.' });
    }
    if (updates.profileImage !== undefined && typeof updates.profileImage !== 'string') {
      return res.status(400).json({ message: 'Profile image must be a string URL or path.' });
    }
    if (updates.skills !== undefined && (
      !Array.isArray(updates.skills)
      || updates.skills.some((skill) => typeof skill !== 'string' || !skill.trim())
    )) {
      return res.status(400).json({ message: 'Skills must be an array of non-empty strings.' });
    }

    if (updates.fullName !== undefined) updates.fullName = updates.fullName.trim();
    if (updates.email !== undefined) {
      updates.email = normalizeEmail(updates.email);
      const existingUser = await User.findOne({ email: updates.email, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(409).json({ message: 'A user with this email already exists.' });
      }
    }
    if (updates.profileImage !== undefined) updates.profileImage = updates.profileImage.trim();
    if (updates.skills !== undefined) {
      updates.skills = [...new Set(updates.skills.map((skill) => skill.trim()))];
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).select('-password -tokenVersion');

    res.json({ message: 'Profile updated successfully.', user });
  } catch (error) {
    res.status(500).json({ message: 'Profile update failed.', error: error.message });
  }
};

const handlePatchUsersMePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword
      || typeof newPassword !== 'string' || newPassword.length < 8
      || Buffer.byteLength(newPassword, 'utf8') > 72) {
      return res.status(400).json({
        message: 'Current password and a new password between 8 and 72 bytes are required.',
      });
    }

    const user = await User.findById(req.user._id);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current password.' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    disconnectUserSockets(user._id);
    res.json({ message: 'Password changed successfully. Please sign in again.' });
  } catch (error) {
    res.status(500).json({ message: 'Password update failed.', error: error.message });
  }
};

const handleGetUsers = async (req, res) => {
  try {
    if (!req.workspace || !['admin', 'project_manager'].includes(req.workspaceRole)) {
      return res.status(403).json({ message: 'Workspace management access is required.' });
    }
    let userFilter = {
      _id: { $in: req.workspace.members },
      isActive: true,
    };
    if (req.query.available === 'true') {
      if (req.workspaceRole !== 'admin') {
        return res.status(403).json({ message: 'Only workspace administrators can view the member directory.' });
      }
      userFilter = { isActive: true };
    }
    const [users, memberships] = await Promise.all([
      User.find(userFilter)
      .select('fullName email profileImage skills isActive createdAt')
      .sort({ createdAt: -1 }),
      WorkspaceMember.find({
        workspace: req.workspace._id,
        isActive: true,
      }).select('user role'),
    ]);
    const roles = new Map(memberships.map((membership) => [
      membership.user.toString(),
      membership.role,
    ]));
    res.json(users.map((user) => ({
      ...sanitizeUser(user),
      role: roles.get(user._id.toString())
        || (req.workspace.owner.toString() === user._id.toString() ? 'admin' : null),
    })));
  } catch (error) {
    res.status(500).json({ message: 'Users could not be loaded.', error: error.message });
  }
};

const handlePostWorkspaces = async (req, res) => {
  try {
    const { name, description, members = [] } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Workspace name is required.' });
    }
    if (!Array.isArray(members)
      || members.some((memberId) => typeof memberId !== 'string')) {
      return res.status(400).json({ message: 'Workspace members must be valid user IDs.' });
    }

    const owner = req.user._id;
    const memberIds = [...new Set([owner.toString(), ...members])];
    if (memberIds.some((memberId) => !mongoose.isValidObjectId(memberId))) {
      return res.status(400).json({ message: 'Workspace member IDs must be valid user IDs.' });
    }
    const activeMembers = await User.find({ _id: { $in: memberIds }, isActive: true }).select('_id');
    if (activeMembers.length !== memberIds.length) {
      return res.status(400).json({ message: 'All workspace members must be active user accounts.' });
    }

    const workspace = await Workspace.create({
      name: name.trim(),
      description,
      owner,
      members: memberIds,
    });

    await Promise.all([
      User.updateMany({ _id: { $in: workspace.members } }, { $addToSet: { workspaceIds: workspace._id } }),
      ...memberIds.map((userId) => WorkspaceMember.findOneAndUpdate(
        { workspace: workspace._id, user: userId },
        {
          workspace: workspace._id,
          user: userId,
          role: userId === owner.toString() ? 'admin' : 'developer',
          isActive: true,
        },
        { upsert: true, new: true, runValidators: true }
      )),
    ]);
    await logActivity({
      workspace: workspace._id,
      user: req.user._id,
      action: 'workspace_created',
      details: `Workspace "${workspace.name}" was created.`,
    });

    res.status(201).json({
      message: 'Workspace created successfully.',
      workspace,
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    res.status(500).json({ message: 'Workspace creation failed.', error: error.message });
  }
};

const handlePatchWorkspacesWorkspaceId = async (req, res) => {
  try {
    const allowedFields = ['name', 'description', 'status', 'settings'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Provide at least one workspace field to update.' });
    }
    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) {
      return res.status(400).json({ message: 'Workspace name cannot be empty.' });
    }
    if (updates.settings !== undefined) {
      if (!updates.settings || typeof updates.settings !== 'object' || Array.isArray(updates.settings)) {
        return res.status(400).json({ message: 'Workspace settings must be an object.' });
      }
      const settingUpdates = {};
      if (updates.settings.allowExternalFiles !== undefined) {
        if (typeof updates.settings.allowExternalFiles !== 'boolean') {
          return res.status(400).json({ message: 'allowExternalFiles must be a boolean.' });
        }
        settingUpdates['settings.allowExternalFiles'] = updates.settings.allowExternalFiles;
      }
      if (updates.settings.defaultRole !== undefined) {
        if (!['developer', 'viewer'].includes(updates.settings.defaultRole)) {
          return res.status(400).json({ message: 'Workspace default role must be developer or viewer.' });
        }
        settingUpdates['settings.defaultRole'] = updates.settings.defaultRole;
      }
      delete updates.settings;
      Object.assign(updates, settingUpdates);
      if (!Object.keys(updates).length) {
        return res.status(400).json({ message: 'Provide at least one supported workspace setting.' });
      }
    }
    if (updates.name !== undefined) updates.name = updates.name.trim();

    const workspace = await Workspace.findByIdAndUpdate(req.workspace._id, updates, {
      new: true,
      runValidators: true,
    });
    if (workspace.status === 'archived' && req.workspace.status !== 'archived') {
      const projectIds = await Project.find({ workspace: workspace._id }).distinct('_id');
      const projectMembers = await ProjectMember.find({
        project: { $in: projectIds },
        isActive: true,
      }).distinct('user');
      const userIds = new Set([
        workspace.owner.toString(),
        ...workspace.members.map((member) => member.toString()),
        ...projectMembers.map((member) => member.toString()),
      ]);
      userIds.forEach(disconnectUserSockets);
    }
    await logActivity({
      workspace: workspace._id,
      user: req.user._id,
      action: 'workspace_updated',
      details: `Workspace "${workspace.name}" was updated.`,
    });
    res.json({ message: 'Workspace updated successfully.', workspace });
  } catch (error) {
    res.status(500).json({ message: 'Workspace update failed.', error: error.message });
  }
};

const handleGetWorkspaces = async (req, res) => {
  try {
    const filter = await workspaceFilterForUser(req.user);
    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const workspaces = await Workspace.find(filter)
      .populate('owner', 'fullName email profileImage')
      .populate('members', 'fullName email profileImage')
      .populate({ path: 'projects', match: { _id: { $in: projectIds } }, select: 'name description status progress projectManager developers' });
    const membershipRoles = await WorkspaceMember.find({
      workspace: { $in: workspaces.map((workspace) => workspace._id) },
      isActive: true,
    }).select('workspace user role');
    const roleByWorkspaceAndUser = new Map(
      membershipRoles.map((membership) => [
        `${membership.workspace}:${membership.user}`,
        membership.role,
      ])
    );
    for (const workspace of workspaces) {
      workspace.members = workspace.members.map((member) => {
        const memberObject = member.toObject();
        memberObject.role = roleByWorkspaceAndUser.get(`${workspace._id}:${member._id}`)
          || (workspace.owner._id.toString() === member._id.toString() ? 'admin' : 'developer');
        return memberObject;
      });
    }
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ message: 'Workspaces could not be loaded.', error: error.message });
  }
};

const handleGetWorkspacesWorkspaceIdMembers = async (req, res) => {
  try {
    const [members, memberships] = await Promise.all([
      User.find({ _id: { $in: req.workspace.members }, isActive: true })
        .select('fullName email profileImage skills isActive createdAt'),
      WorkspaceMember.find({ workspace: req.workspace._id, isActive: true }).select('user role'),
    ]);
    const roles = new Map(memberships.map((membership) => [membership.user.toString(), membership.role]));
    res.json(members.map((member) => ({
      ...member.toObject(),
      role: roles.get(member._id.toString())
        || (req.workspace.owner.toString() === member._id.toString() ? 'admin' : 'developer'),
    })));
  } catch (error) {
    res.status(500).json({ message: 'Workspace members could not be loaded.', error: error.message });
  }
};

const handlePostWorkspacesWorkspaceIdMembers = async (req, res) => {
  try {
    const { userId, role } = req.body;
    const memberRole = role || req.workspace.settings?.defaultRole || 'developer';
    if (!['admin', 'project_manager', 'developer', 'viewer'].includes(memberRole)) {
      return res.status(400).json({ message: 'A valid workspace member role is required.' });
    }
    const user = await User.findOne({ _id: userId, isActive: true });
    if (!user) return res.status(404).json({ message: 'Active user not found.' });

    await Workspace.findByIdAndUpdate(req.workspace._id, { $addToSet: { members: user._id } });
    await Promise.all([
      User.findByIdAndUpdate(user._id, { $addToSet: { workspaceIds: req.workspace._id } }),
      WorkspaceMember.findOneAndUpdate(
        { workspace: req.workspace._id, user: user._id },
        { workspace: req.workspace._id, user: user._id, role: memberRole, isActive: true },
        { upsert: true, new: true, runValidators: true }
      ),
    ]);
    await logActivity({
      workspace: req.workspace._id,
      user: req.user._id,
      action: 'workspace_member_added',
      details: `User ${user.email} was added to the workspace.`,
    });

    res.status(201).json({
      message: 'Workspace member added successfully.',
      user: { _id: user._id, email: user.email, fullName: user.fullName, role: memberRole },
    });
  } catch (error) {
    res.status(500).json({ message: 'Workspace member could not be added.', error: error.message });
  }
};

const handleDeleteWorkspacesWorkspaceIdMembersUserId = async (req, res) => {
  try {
    if (req.workspace.owner.toString() === req.params.userId) {
      return res.status(400).json({ message: 'The workspace owner cannot be removed.' });
    }
    const isMember = req.workspace.members.some((member) => member.toString() === req.params.userId);
    if (!isMember) {
      return res.status(404).json({ message: 'Workspace member not found.' });
    }
    const managedProjects = await Project.find({
      workspace: req.workspace._id,
      projectManager: req.params.userId,
    }).select('_id');
    if (managedProjects.length) {
      return res.status(409).json({
        message: "Reassign this user's managed projects before removing them from the workspace.",
      });
    }
    const developerProjects = await Project.find({
      workspace: req.workspace._id,
      developers: req.params.userId,
    }).select('_id');
    const projectIds = developerProjects.map((project) => project._id);

    await Promise.all([
      Workspace.findByIdAndUpdate(req.workspace._id, { $pull: { members: req.params.userId } }),
      WorkspaceMember.findOneAndUpdate(
        { workspace: req.workspace._id, user: req.params.userId },
        { isActive: false }
      ),
      User.findByIdAndUpdate(req.params.userId, {
        $pull: {
          workspaceIds: req.workspace._id,
          projectIds: { $in: projectIds },
        },
      }),
      Project.updateMany({ _id: { $in: projectIds } }, { $pull: { developers: req.params.userId } }),
      ProjectMember.updateMany(
        { project: { $in: projectIds }, user: req.params.userId, isActive: true },
        { $set: { isActive: false } }
      ),
    ]);
    disconnectUserSockets(req.params.userId);
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
};

const handlePatchWorkspacesWorkspaceIdRole = async (req, res) => {
  try {
    const { userId, role } = req.body;
    const allowedRoles = ['admin', 'project_manager', 'developer', 'viewer'];
    if (!userId || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'User ID and a valid role are required.' });
    }

    const isWorkspaceMember = req.workspace.members.some((member) => member.toString() === userId);
    if (!isWorkspaceMember) {
      return res.status(400).json({ message: 'The user must be an active workspace member.' });
    }
    if (req.workspace.owner.toString() === userId) {
      return res.status(400).json({ message: 'The workspace administrator role cannot be changed here.' });
    }

    const user = await User.findOne({ _id: userId, isActive: true })
      .select('fullName email profileImage skills isActive createdAt');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    await WorkspaceMember.findOneAndUpdate(
      { workspace: req.workspace._id, user: user._id },
      { workspace: req.workspace._id, user: user._id, role, isActive: true },
      { upsert: true, new: true, runValidators: true }
    );
    await logActivity({
      workspace: req.workspace._id,
      user: req.user._id,
      action: 'workspace_role_assigned',
      details: `User ${user.email} was assigned role ${role}.`,
    });
    res.json({ message: 'Workspace role assigned successfully.', user: { ...user.toObject(), role } });
  } catch (error) {
    res.status(500).json({ message: 'Workspace role assignment failed.', error: error.message });
  }
};

const handleGetWorkspacesWorkspaceIdActivity = async (req, res) => {
  try {
    const logs = await ActivityLog.find({ workspace: req.workspace._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('user', 'fullName email')
      .populate('project', 'name');
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Workspace activity could not be loaded.', error: error.message });
  }
};

const handlePostProjects = async (req, res) => {
  try {
    const { name, description, workspace, projectManager, developers = [], status, repositoryUrl, defaultBranch } = req.body;

    if (typeof name !== 'string' || !name.trim() || !workspace || !projectManager) {
      return res.status(400).json({ message: 'Project name, workspace and project manager are required.' });
    }
    if (!req.workspace || req.workspace._id.toString() !== String(workspace)) {
      return res.status(403).json({ message: 'Choose a workspace you administer.' });
    }
    if (!Array.isArray(developers)) {
      return res.status(400).json({ message: 'Project developers must be an array of user IDs.' });
    }
    if (developers.map(String).includes(String(projectManager))) {
      return res.status(400).json({ message: 'The project manager cannot also be listed as a developer.' });
    }
    if (![workspace, projectManager, ...developers].every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).json({ message: 'Workspace, project manager and developer IDs must be valid IDs.' });
    }

    const workspaceRecord = await Workspace.findOne({
      _id: workspace,
      status: 'active',
      members: { $all: [projectManager, ...developers] },
    });
    if (!workspaceRecord) {
      return res.status(400).json({ message: 'Project manager and developers must be members of an active workspace.' });
    }

    const projectUsers = await User.find({
      _id: { $in: [projectManager, ...developers] },
      isActive: true,
    }).select('_id');
    if (projectUsers.length !== new Set([projectManager, ...developers].map(String)).size) {
      return res.status(400).json({ message: 'The project manager and developers must be active user accounts.' });
    }

    const project = await Project.create({
      name: name.trim(),
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
};

const handleGetProjects = async (req, res) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const projects = await Project.find({ _id: { $in: projectIds } })
      .populate('workspace', 'name description status')
      .populate('projectManager developers', 'fullName email');
    const projectsWithContextualRole = await Promise.all(projects.map(async (project) => {
      const access = await resolveProjectAccess(req.user, project._id);
      return {
        ...project.toObject(),
        currentUserRole: access?.role || null,
      };
    }));
    res.json(projectsWithContextualRole);
  } catch (error) {
    res.status(500).json({ message: 'Projects could not be loaded.', error: error.message });
  }
};

const handlePatchProjectsProjectId = async (req, res) => {
  try {
    const allowedFields = ['name', 'description', 'status', 'progress', 'repositoryUrl', 'defaultBranch', 'startDate', 'endDate'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Provide at least one supported project field to update.' });
    }
    if (updates.name !== undefined && (typeof updates.name !== 'string' || !updates.name.trim())) {
      return res.status(400).json({ message: 'Project name cannot be empty.' });
    }
    if (updates.name !== undefined) updates.name = updates.name.trim();
    if (updates.status !== undefined
      && !['planning', 'in_progress', 'review', 'completed', 'on_hold'].includes(updates.status)) {
      return res.status(400).json({ message: 'Project status is invalid.' });
    }
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
};

const handlePatchProjectsProjectIdManager = async (req, res) => {
  try {
    const { projectManagerId } = req.body;
    if (typeof projectManagerId !== 'string') {
      return res.status(400).json({ message: 'A project manager user ID is required.' });
    }

    const manager = await User.findOne({
      _id: projectManagerId,
      isActive: true,
    }).select('_id fullName email');
    const isWorkspaceMember = manager && await Workspace.exists({
      _id: req.project.workspace,
      status: 'active',
      $or: [{ owner: manager._id }, { members: manager._id }],
    });
    if (!manager || !isWorkspaceMember) {
      return res.status(400).json({
        message: 'The new project manager must be an active member of the project workspace.',
      });
    }

    const previousManagerId = req.project.projectManager;
    if (previousManagerId.toString() === manager._id.toString()) {
      return res.status(400).json({ message: 'This user is already the project manager.' });
    }

    req.project.projectManager = manager._id;
    await req.project.save();
    await Promise.all([
      ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: previousManagerId },
        { isActive: false },
        { new: true }
      ),
      ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: manager._id },
        {
          project: req.project._id,
          user: manager._id,
          role: 'project_manager',
          accessLevel: 'admin',
          isActive: true,
        },
        { upsert: true, new: true, runValidators: true }
      ),
      User.findByIdAndUpdate(previousManagerId, { $pull: { projectIds: req.project._id } }),
      User.findByIdAndUpdate(manager._id, { $addToSet: { projectIds: req.project._id } }),
    ]);
    disconnectUserSockets(previousManagerId);
    await logActivity({
      workspace: req.project.workspace,
      project: req.project._id,
      user: req.user._id,
      action: 'project_manager_reassigned',
      details: `Project manager was changed from ${previousManagerId} to ${manager.fullName}.`,
    });

    res.json({ message: 'Project manager reassigned successfully.', project: req.project });
  } catch (error) {
    res.status(500).json({ message: 'Project manager could not be reassigned.', error: error.message });
  }
};

const handleGetProjectsProjectIdMonitoring = async (req, res) => {
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
};

const handleGetProjectsProjectIdReport = async (req, res) => {
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
};

const handleGetProjectsProjectIdMembers = async (req, res) => {
  try {
    const members = await ProjectMember.find({
      project: req.params.projectId,
      isActive: true,
    }).populate('user', 'fullName email profileImage skills isActive');

    res.json(members);
  } catch (error) {
    res.status(500).json({ message: 'Project members could not be loaded.', error: error.message });
  }
};

const handlePostProjectsProjectIdMembers = async (req, res) => {
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
      if (!user.isActive) {
        return res.status(400).json({
          message: 'Only active user accounts can be added as project members.',
        });
      }
      const workspace = await Workspace.findOne({ _id: req.project.workspace, members: user._id });
      if (!workspace) {
        return res.status(400).json({ message: 'The user must be a member of the project workspace first.' });
      }

      if (user._id.toString() === req.project.projectManager.toString()) {
        return res.status(400).json({ message: 'The project manager is already a project member.' });
      }

      const member = await ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: user._id },
        { project: req.project._id, user: user._id, role, accessLevel, isActive: true },
        { upsert: true, new: true, runValidators: true }
      ).populate('user', 'fullName email profileImage skills isActive');

      if (role === 'developer') {
        await Project.findByIdAndUpdate(req.project._id, { $addToSet: { developers: user._id } });
      } else {
        await Project.findByIdAndUpdate(req.project._id, { $pull: { developers: user._id } });
      }
      await User.findByIdAndUpdate(user._id, { $addToSet: { projectIds: req.project._id } });
      await logActivity({
        workspace: req.project.workspace,
        project: req.project._id,
        user: req.user._id,
        action: 'project_member_added',
        details: `${user.fullName} was added to the project.`,
      });

      res.status(201).json({ message: 'Project member added successfully.', member });
    } catch (error) {
      res.status(500).json({ message: 'Project member could not be added.', error: error.message });
    }
  };

const handlePatchProjectsProjectIdMembersUserIdRole = async (req, res) => {
    try {
      const { role, accessLevel = 'write' } = req.body;
      if (!['developer', 'reviewer', 'guest'].includes(role)
        || !['read', 'write'].includes(accessLevel)) {
        return res.status(400).json({ message: 'A valid project role and access level are required.' });
      }
      if (req.params.userId === req.project.projectManager.toString()) {
        return res.status(400).json({ message: 'Reassign the project manager before changing this membership.' });
      }
      const member = await ProjectMember.findOneAndUpdate(
        { project: req.project._id, user: req.params.userId, isActive: true },
        { role, accessLevel },
        { new: true, runValidators: true }
      ).populate('user', 'fullName email profileImage skills isActive');

      if (!member) {
        return res.status(404).json({ message: 'Active project member not found.' });
      }
      if (role === 'developer') {
        await Project.findByIdAndUpdate(req.project._id, { $addToSet: { developers: req.params.userId } });
      } else {
        await Project.findByIdAndUpdate(req.project._id, { $pull: { developers: req.params.userId } });
      }

      disconnectUserSockets(req.params.userId);
      await logActivity({
        workspace: req.project.workspace,
        project: req.project._id,
        user: req.user._id,
        action: 'project_member_role_updated',
        details: `Project member ${req.params.userId} role was updated to ${role}.`,
      });
      res.json({ message: 'Project member role updated successfully.', member });
    } catch (error) {
      res.status(500).json({ message: 'Project member role update failed.', error: error.message });
    }
  };

const handleDeleteProjectsProjectIdMembersUserId = async (req, res) => {
    try {
      if (req.params.userId === req.project.projectManager.toString()) {
        return res.status(400).json({ message: 'Reassign the project manager before removing this member.' });
      }
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
      disconnectUserSockets(req.params.userId);
      await logActivity({
        workspace: req.project.workspace,
        project: req.project._id,
        user: req.user._id,
        action: 'project_member_removed',
        details: `User ${req.params.userId} was removed from the project.`,
      });

      res.json({ message: 'Project member removed successfully.' });
    } catch (error) {
      res.status(500).json({ message: 'Project member could not be removed.', error: error.message });
    }
  };

const handlePostTasks = async (req, res) => {
  try {
    const { title, description, project, workspace, assignee, priority, status, dueDate, labels, branchName } = req.body;

    if (!title || !project || !workspace) {
      return res.status(400).json({ message: 'Task title, project and workspace are required.' });
    }

    if (req.project.workspace.toString() !== workspace) {
      return res.status(400).json({ message: 'Task workspace must match its project workspace.' });
    }

    if (assignee) {
      const assigneeUser = await User.findOne({ _id: assignee, isActive: true }).select('_id');
      const assigneeAccess = assigneeUser
        ? await resolveProjectAccess(assigneeUser, req.project._id)
        : null;
      if (!assigneeUser || assigneeAccess?.membership?.role !== 'developer'
        || !assigneeAccess || !assigneeAccess.permissions.has('write')) {
        return res.status(400).json({ message: 'Assignee must be an active developer in this project.' });
      }
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
    if (task.status === 'completed') {
      task.completionPercentage = 100;
      await task.save();
    }

    await recalculateProjectProgress(task.project);
    await logActivity({
      workspace: task.workspace,
      project: task.project,
      user: req.user._id,
      action: 'task_created',
      details: `Task "${task.title}" was created.`,
    });
    if (task.assignee) {
      await createNotification({
        user: task.assignee,
        title: 'New task assigned',
        message: `You have been assigned to "${task.title}".`,
        type: 'task',
        relatedId: task._id,
      });
    }
    res.status(201).json({ message: 'Task created successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task creation failed.', error: error.message });
  }
};

const handlePatchTasksTaskId = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = req.project;

    const allowedFields = ['title', 'description', 'priority', 'dueDate', 'labels', 'branchName', 'assignee'];
    const updates = Object.fromEntries(
      Object.entries(req.body).filter(([key]) => allowedFields.includes(key))
    );
    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: 'Provide at least one task field to update.' });
    }
    if (updates.title !== undefined && (typeof updates.title !== 'string' || !updates.title.trim())) {
      return res.status(400).json({ message: 'Task title cannot be empty.' });
    }
    if (updates.labels !== undefined && (
      !Array.isArray(updates.labels)
      || updates.labels.some((label) => typeof label !== 'string' || !label.trim())
    )) {
      return res.status(400).json({ message: 'Task labels must be an array of non-empty strings.' });
    }
    if (updates.assignee !== undefined && updates.assignee !== null) {
      const assigneeUser = await User.findOne({ _id: updates.assignee, isActive: true }).select('_id');
      const assigneeAccess = assigneeUser
        ? await resolveProjectAccess(assigneeUser, project._id)
        : null;
      if (!assigneeUser || assigneeAccess?.membership?.role !== 'developer'
        || !assigneeAccess || !assigneeAccess.permissions.has('write')) {
        return res.status(400).json({ message: 'Assignee must be an active developer in this project.' });
      }
    }

    if (updates.title !== undefined) updates.title = updates.title.trim();
    if (updates.labels !== undefined) {
      updates.labels = [...new Set(updates.labels.map((label) => label.trim()))];
    }
    Object.assign(task, updates);
    await task.save();
    await recalculateProjectProgress(task.project);
    await logActivity({
      workspace: task.workspace,
      project: task.project,
      user: req.user._id,
      action: 'task_updated',
      details: `Task "${task.title}" was updated.`,
    });
    res.json({ message: 'Task updated successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task update failed.', error: error.message });
  }
};

const handlePatchTasksTaskIdAssign = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = req.project;

    const { assignee } = req.body;
    const assigneeUser = assignee ? await User.findById(assignee).select('_id isActive') : null;
    const assigneeAccess = assigneeUser?.isActive
      ? await resolveProjectAccess(assigneeUser, project._id)
      : null;
    if (!assigneeUser || assigneeAccess?.membership?.role !== 'developer'
      || !assigneeAccess || !assigneeAccess.permissions.has('write')) {
      return res.status(400).json({ message: 'Assignee must be an active developer in this project.' });
    }

    task.assignee = assignee;
    await task.save();
    await createNotification({
      user: assignee,
      title: 'Task assigned',
      message: `You have been assigned to "${task.title}".`,
      type: 'task',
      relatedId: task._id,
    });
    await logActivity({
      workspace: task.workspace,
      project: task.project,
      user: req.user._id,
      action: 'task_assigned',
      details: `Task "${task.title}" was assigned to ${assignee}.`,
    });
    res.json({ message: 'Task assigned successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task assignment failed.', error: error.message });
  }
};

const handlePatchTasksTaskIdStatus = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = req.project;

    const isManager = !req.projectMembership
      || ['admin', 'project_manager'].includes(req.projectMembership.role);
    const canUpdate = isManager || task.assignee?.toString() === req.user._id.toString();
    if (!canUpdate) {
      return res.status(403).json({ message: 'You can only update tasks assigned to you.' });
    }

    const allowedStatuses = isManager
      ? ['todo', 'in_progress', 'in_review', 'completed', 'blocked']
      : ['todo', 'in_progress', 'in_review', 'blocked'];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Invalid task status.' });
    }

    task.status = req.body.status;
    if (task.status === 'completed') task.completionPercentage = 100;
    await task.save();
    await recalculateProjectProgress(task.project);
    await logActivity({
      workspace: task.workspace,
      project: task.project,
      user: req.user._id,
      action: 'task_status_updated',
      details: `Task "${task.title}" status changed to ${task.status}.`,
    });
    res.json({ message: 'Task status updated successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task status update failed.', error: error.message });
  }
};

const handlePatchTasksTaskIdProgress = async (req, res) => {
  try {
    const task = await Task.findById(req.params.taskId);
    if (!task) {
      return res.status(404).json({ message: 'Task not found.' });
    }

    const project = req.project;

    const isManager = !req.projectMembership
      || ['admin', 'project_manager'].includes(req.projectMembership.role);
    const canUpdate = isManager || task.assignee?.toString() === req.user._id.toString();
    if (!canUpdate) {
      return res.status(403).json({ message: 'You can only update tasks assigned to you.' });
    }

    const completionPercentage = Number(req.body.completionPercentage);
    if (!Number.isInteger(completionPercentage) || completionPercentage < 0 || completionPercentage > 100) {
      return res.status(400).json({ message: 'Progress must be an integer from 0 to 100.' });
    }

    task.completionPercentage = completionPercentage;
    await task.save();
    await recalculateProjectProgress(task.project);
    await logActivity({
      workspace: task.workspace,
      project: task.project,
      user: req.user._id,
      action: 'task_progress_updated',
      details: `Task "${task.title}" progress changed to ${completionPercentage}%.`,
    });
    res.json({ message: 'Task progress updated successfully.', task });
  } catch (error) {
    res.status(500).json({ message: 'Task progress update failed.', error: error.message });
  }
};

const handleGetTasks = async (req, res) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const projectRecords = await Project.find({ _id: { $in: projectIds } }).select('_id');
    const developerProjectIds = [];
    const unrestrictedProjectIds = [];
    for (const project of projectRecords) {
      const access = await resolveProjectAccess(req.user, project._id);
      if (access?.membership?.role === 'developer') developerProjectIds.push(project._id);
      else unrestrictedProjectIds.push(project._id);
    }
    const taskFilter = {
      $or: [
        { project: { $in: unrestrictedProjectIds } },
        { project: { $in: developerProjectIds }, assignee: req.user._id },
      ],
    };
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
      .populate('project', 'name status progress')
      .populate('workspace', 'name status')
      .populate('assignee', 'fullName email')
      .populate('reporter', 'fullName email');
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Tasks could not be loaded.', error: error.message });
  }
};

const handlePostTasksDeadlineAlerts = async (req, res) => {
  try {
    const days = Number(req.body.days || req.query.days || 2);
    if (!Number.isInteger(days) || days < 0 || days > 30) {
      return res.status(400).json({ message: 'Days must be an integer from 0 to 30.' });
    }

    const projectIds = await getAccessibleProjectIds(req.user, 'manage');
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
        await createNotification({
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
};

const handlePostSubmissions = async (req, res) => {
    try {
      const { project, task, title, description, branchName } = req.body;

      if (!project || !task || !title) {
        return res.status(400).json({ message: 'Project, task and submission title are required.' });
      }

      if (req.project._id.toString() !== project) {
        return res.status(400).json({ message: 'Submission project access could not be verified.' });
      }
      if (req.projectMembership?.role !== 'developer') {
        return res.status(403).json({ message: 'Only project developers can submit code.' });
      }

      const taskRecord = await Task.findOne({ _id: task, project });
      if (!taskRecord) {
        return res.status(400).json({ message: 'Submission task must belong to the selected project.' });
      }
      if (taskRecord.assignee?.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'You can submit code only for a task assigned to you.' });
      }

      const files = (req.files || []).map((file) => ({
        fileName: file.originalname,
        downloadUrl: `/api/files/${encodeURIComponent(file.filename)}`,
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
      taskRecord.status = 'in_review';
      await taskRecord.save();
      await recalculateProjectProgress(taskRecord.project);
      await Promise.all([
        logActivity({
          workspace: req.project.workspace,
          project: req.project._id,
          user: req.user._id,
          action: 'submission_created',
          details: `Submission "${submission.title}" was created for task "${taskRecord.title}".`,
        }),
        logActivity({
          workspace: taskRecord.workspace,
          project: taskRecord.project,
          user: req.user._id,
          action: 'task_status_updated',
          details: `Task "${taskRecord.title}" moved to in_review after code submission.`,
        }),
        createNotification({
          user: req.project.projectManager,
          title: 'Code submission ready for review',
          message: `${req.user.fullName} submitted "${submission.title}".`,
          type: 'project',
          relatedId: submission._id,
        }),
      ]);

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
  };

const handleGetSubmissions = async (req, res) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const submissionFilter = req.query.projectId
      ? { project: { $in: projectIds, $eq: req.query.projectId } }
      : { project: { $in: projectIds } };
    const submissions = await Submission.find(submissionFilter)
      .populate('project', 'name status')
      .populate('task', 'title status dueDate')
      .populate('developer', 'fullName email');
    res.json(submissions);
  } catch (error) {
    res.status(500).json({ message: 'Submissions could not be loaded.', error: error.message });
  }
};

const handlePatchSubmissionsSubmissionIdReview = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    const access = await resolveProjectAccess(req.user, submission.project);
    if (!access) {
      return res.status(404).json({ message: 'Submission project not found or access denied.' });
    }
    if (!access.permissions.has('review')) {
      return res.status(403).json({ message: 'You do not have review access to this project.' });
    }
    const project = access.project;

    const allowedStatuses = ['approved', 'changes_requested'];
    if (!allowedStatuses.includes(req.body.reviewStatus)) {
      return res.status(400).json({ message: 'Review status must be approved or changes_requested.' });
    }

    submission.reviewStatus = req.body.reviewStatus;
    submission.reviewNotes = req.body.reviewNotes || '';

    const task = await Task.findById(submission.task);
    if (task) {
      if (req.body.reviewStatus === 'approved') {
        task.status = 'completed';
        task.completionPercentage = 100;
      } else {
        task.status = 'in_progress';
        task.completionPercentage = Math.max(task.completionPercentage || 0, 50);
      }
      await task.save();
    }

    await recalculateProjectProgress(submission.project);

    await createNotification({
      user: submission.developer,
      title: 'Submission reviewed',
      message: `Your submission "${submission.title}" was ${req.body.reviewStatus === 'approved' ? 'approved' : 'marked for changes'}. ${submission.reviewNotes ? `Notes: ${submission.reviewNotes}` : ''}`.trim(),
      type: 'system',
      relatedId: submission._id,
    });

    await logActivity({
      workspace: project.workspace,
      project: project._id,
      user: req.user._id,
      action: 'submission_reviewed',
      details: `Submission "${submission.title}" was ${req.body.reviewStatus === 'approved' ? 'approved' : 'sent back for changes'} by ${req.user.fullName || 'project manager'}.`,
    });

    await submission.save();
    res.json({ message: 'Submission review updated successfully.', submission, task });
  } catch (error) {
    res.status(500).json({ message: 'Submission review failed.', error: error.message });
  }
};

const handleGetSubmissionFile = async (req, res) => {
  const fileName = path.basename(req.params.fileName);
  if (!fileName || fileName !== req.params.fileName) {
    return res.status(400).json({ message: 'Invalid file name.' });
  }

  try {
    const encodedUrl = `/api/files/${encodeURIComponent(fileName)}`;
    const legacyUrl = `/uploads/${fileName}`;
    const submission = await Submission.findOne({
      files: { $elemMatch: { downloadUrl: { $in: [encodedUrl, legacyUrl] } } },
    });
    if (!submission) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const access = await resolveProjectAccess(req.user, submission.project);
    if (!access || !access.permissions.has('read')) {
      return res.status(404).json({ message: 'File not found or access denied.' });
    }

    return res.sendFile(path.join(uploadDirectory, fileName), (error) => {
      if (error && !res.headersSent) {
        res.status(error.statusCode || 500).json({ message: 'File could not be downloaded.' });
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'File download failed.', error: error.message });
  }
};

const handlePostMeetings = async (req, res) => {
  try {
    const { title, project, workspace, attendees = [], scheduledAt, durationMinutes, meetingType, agenda } = req.body;

    const scheduledDate = new Date(scheduledAt);
    if (typeof title !== 'string' || !title.trim() || !workspace || !scheduledAt
      || Number.isNaN(scheduledDate.getTime()) || !Array.isArray(attendees)
      || attendees.some((attendee) => typeof attendee !== 'string' || !mongoose.isValidObjectId(attendee))) {
      return res.status(400).json({ message: 'Meeting title, workspace and schedule time are required.' });
    }
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ message: 'Meeting schedule must be in the future.' });
    }
    if (durationMinutes !== undefined
      && (!Number.isInteger(Number(durationMinutes)) || Number(durationMinutes) < 5 || Number(durationMinutes) > 480)) {
      return res.status(400).json({ message: 'Meeting duration must be between 5 and 480 minutes.' });
    }

    if (!req.workspace || req.workspace._id.toString() !== workspace) {
      return res.status(403).json({ message: 'You do not have access to this workspace.' });
    }
    const workspaceMembership = await WorkspaceMember.findOne({
      workspace: req.workspace._id,
      user: req.user._id,
      isActive: true,
    }).select('role');
    const isWorkspaceAdmin = req.workspace.owner.toString() === req.user._id.toString()
      || workspaceMembership?.role === 'admin';
    const isWorkspaceProjectManager = workspaceMembership?.role === 'project_manager';

    if (project) {
      const projectAccess = await resolveProjectAccess(req.user, project);
      const projectRecord = projectAccess && projectAccess.project;
      if (!projectRecord) {
        return res.status(404).json({ message: 'Project not found or access denied.' });
      }
      if (!projectAccess.permissions.has('write')) {
        return res.status(403).json({ message: 'You do not have write access to schedule project meetings.' });
      }
      if (projectRecord.workspace.toString() !== workspace) {
        return res.status(400).json({ message: 'Meeting workspace must match its project workspace.' });
      }
      if (!isWorkspaceAdmin && !isWorkspaceProjectManager
        && !['project_manager', 'developer'].includes(projectAccess.membership?.role)) {
        return res.status(403).json({ message: 'Project manager or developer access is required to schedule meetings.' });
      }
      const projectMemberRecords = await ProjectMember.find({
        project: projectRecord._id,
        isActive: true,
      }).distinct('user');
      const possibleMemberIds = [...new Set([
        projectRecord.projectManager,
        ...projectRecord.developers,
        ...projectMemberRecords,
      ].map(String))];
      const users = await User.find({
        _id: { $in: possibleMemberIds },
        isActive: true,
      }).select('_id');
      const projectMembers = [];
      for (const member of users) {
        const access = await resolveProjectAccess(member, projectRecord._id);
        if (access?.permissions.has('read')) projectMembers.push(member._id.toString());
      }
      if (attendees.some((attendee) => !projectMembers.includes(String(attendee)))) {
        return res.status(400).json({ message: 'All meeting attendees must belong to the selected project.' });
      }
      const meetingAttendees = attendees.length ? [...new Set(attendees.map(String))] : projectMembers;

      const meeting = await Meeting.create({
        title,
        project,
        workspace,
        host: req.user._id,
        attendees: meetingAttendees,
        scheduledAt,
        durationMinutes,
        meetingType,
        agenda,
      });
      await Promise.all([
        ...meetingAttendees
          .filter((attendee) => attendee !== req.user._id.toString())
          .map((attendee) => createNotification({
            user: attendee,
            title: 'Project meeting scheduled',
            message: `"${meeting.title}" is scheduled for ${scheduledDate.toLocaleString()}.`,
            type: 'meeting',
            relatedId: meeting._id,
          })),
        logActivity({
          workspace,
          project: projectRecord._id,
          user: req.user._id,
          action: 'meeting_scheduled',
          details: `Meeting "${meeting.title}" was scheduled.`,
        }),
      ]);
      return res.status(201).json({ message: 'Meeting scheduled successfully.', meeting });
    }

    if (attendees.some((attendee) => !req.workspace.members.some((member) => member.toString() === String(attendee)))) {
      return res.status(400).json({ message: 'All meeting attendees must belong to the selected workspace.' });
    }
    const workspaceAttendees = attendees.length
      ? [...new Set(attendees.map(String))]
      : req.workspace.members.map(String);
    const activeWorkspaceAttendees = await User.find({
      _id: { $in: workspaceAttendees },
      isActive: true,
    }).select('_id');
    if (activeWorkspaceAttendees.length !== workspaceAttendees.length) {
      return res.status(400).json({ message: 'All meeting attendees must have active accounts.' });
    }
    if (!isWorkspaceAdmin && !['project_manager', 'developer'].includes(workspaceMembership?.role)) {
      return res.status(403).json({ message: 'Workspace member role does not allow scheduling meetings.' });
    }

    const meeting = await Meeting.create({
      title: title.trim(),
      project: project || undefined,
      workspace,
      host: req.user._id,
      attendees: workspaceAttendees,
      scheduledAt,
      durationMinutes,
      meetingType,
      agenda,
    });

    await Promise.all([
      ...workspaceAttendees
        .filter((attendee) => attendee !== req.user._id.toString())
        .map((attendee) => createNotification({
          user: attendee,
          title: 'Workspace meeting scheduled',
          message: `"${meeting.title}" was scheduled for your workspace.`,
          type: 'meeting',
          relatedId: meeting._id,
        })),
      logActivity({
        workspace,
        user: req.user._id,
        action: 'workspace_meeting_scheduled',
        details: `Workspace meeting "${meeting.title}" was scheduled.`,
      }),
    ]);

    res.status(201).json({ message: 'Meeting scheduled successfully.', meeting });
  } catch (error) {
    res.status(500).json({ message: 'Meeting scheduling failed.', error: error.message });
  }
};

const handlePatchMeetingsMeetingIdEnd = async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.meetingId)
      .populate('project', 'projectManager')
      .populate('workspace', 'owner members status');
    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found.' });
    }
    const workspace = meeting.workspace;
    const workspaceMembership = workspace ? await WorkspaceMember.findOne({
      workspace: workspace._id,
      user: req.user._id,
      isActive: true,
    }).select('role') : null;
    const isWorkspaceOwner = workspace?.owner.toString() === req.user._id.toString();
    const isWorkspaceMember = workspace && workspace.status === 'active'
      && (isWorkspaceOwner || Boolean(workspaceMembership));
    const isWorkspaceAdmin = isWorkspaceOwner
      || workspaceMembership?.role === 'admin';
    if (!isWorkspaceMember) {
      return res.status(404).json({ message: 'Meeting not found or access denied.' });
    }
    let isProjectManager = false;
    if (meeting.project) {
      const projectAccess = await resolveProjectAccess(req.user, meeting.project._id);
      if (!projectAccess || !projectAccess.permissions.has('read')) {
        return res.status(404).json({ message: 'Meeting not found or access denied.' });
      }
      isProjectManager = projectAccess.project.projectManager.toString() === req.user._id.toString()
        || projectAccess.membership?.role === 'project_manager'
        || workspaceMembership?.role === 'project_manager';
    }
    const isHost = meeting.host.toString() === req.user._id.toString();
    if (!isWorkspaceAdmin && !isHost && !isProjectManager) {
      return res.status(403).json({ message: 'Only the host, project manager, or admin can end this meeting.' });
    }
    if (meeting.status === 'completed' || meeting.status === 'cancelled') {
      return res.status(409).json({ message: 'This meeting has already ended.' });
    }

    meeting.status = 'completed';
    await meeting.save();
    emitMeetingEnded(meeting._id);
    res.json({ message: 'Meeting ended successfully.', meeting });
  } catch (error) {
    res.status(500).json({ message: 'Meeting could not be ended.', error: error.message });
  }
};

const handleGetMeetings = async (req, res) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const workspaces = await Workspace.find(await workspaceFilterForUser(req.user)).select('_id');
    const workspaceIds = workspaces.map((workspace) => workspace._id);
    if (req.query.projectId && !projectIds.some((id) => id.toString() === req.query.projectId)) {
      return res.status(404).json({ message: 'Project not found or access denied.' });
    }
    const scopeFilter = req.query.projectId
      ? { project: req.query.projectId }
      : { $or: [
        { project: { $in: projectIds } },
        { project: null, workspace: { $in: workspaceIds } },
      ] };
    const adminWorkspaceIds = await getAdminWorkspaceIds(req.user);
    const privilegedProjectIds = await Project.find({
      _id: { $in: projectIds },
      projectManager: req.user._id,
    }).distinct('_id');
    const meetingFilter = adminWorkspaceIds.length
      ? scopeFilter
      : {
        $and: [
          scopeFilter,
          {
            $or: [
              { host: req.user._id },
              { attendees: req.user._id },
              { project: null, workspace: { $in: workspaceIds } },
              { project: { $exists: false }, workspace: { $in: workspaceIds } },
              ...(privilegedProjectIds.length ? [{
                project: {
                  $in: privilegedProjectIds,
                },
              }] : []),
            ],
          },
        ],
      };
    const meetings = await Meeting.find(meetingFilter)
      .populate('project', 'name status')
      .populate('workspace', 'name status')
      .populate('host attendees', 'fullName email');
    res.json(meetings);
  } catch (error) {
    res.status(500).json({ message: 'Meetings could not be loaded.', error: error.message });
  }
};

const handlePostMessages = async (req, res) => {
  try {
    const { workspace, project, receiver, content, messageType, attachments = [] } = req.body;

    if (typeof workspace !== 'string' || !mongoose.isValidObjectId(workspace)
      || typeof content !== 'string' || !content.trim() || content.length > 4000
      || (project && (typeof project !== 'string' || !mongoose.isValidObjectId(project)))
      || (receiver && (typeof receiver !== 'string' || !mongoose.isValidObjectId(receiver)))
      || !Array.isArray(attachments)
      || attachments.some((attachment) => typeof attachment !== 'string')) {
      return res.status(400).json({ message: 'Workspace and message content are required.' });
    }

    if (!req.workspace || req.workspace._id.toString() !== workspace) {
      return res.status(403).json({ message: 'You do not have access to this workspace.' });
    }
    const workspaceMembership = await WorkspaceMember.findOne({
      workspace: req.workspace._id,
      user: req.user._id,
      isActive: true,
    }).select('role');
    const isWorkspaceAdmin = req.workspace.owner.toString() === req.user._id.toString()
      || workspaceMembership?.role === 'admin';

    if (project) {
      const projectAccess = await resolveProjectAccess(req.user, project);
      const projectRecord = projectAccess && projectAccess.project;
      if (!projectRecord) {
        return res.status(404).json({ message: 'Project not found or access denied.' });
      }
      if (projectRecord.workspace.toString() !== workspace) {
        return res.status(400).json({ message: 'Message workspace must match its project workspace.' });
      }
      if (!projectAccess.permissions.has('write')) {
        return res.status(403).json({ message: 'You do not have write access to this project chat.' });
      }
      if (!isWorkspaceAdmin && !['project_manager', 'developer'].includes(projectAccess.membership?.role)) {
        return res.status(403).json({ message: 'Project manager or developer access is required to send messages.' });
      }
      if (receiver) {
        const receiverUser = await User.findOne({ _id: receiver, isActive: true }).select('_id');
        const receiverAccess = receiverUser
          ? await resolveProjectAccess(receiverUser, projectRecord._id)
          : null;
        if (!receiverAccess || !receiverAccess.permissions.has('read')) {
          return res.status(400).json({ message: 'The message receiver must be an active project member.' });
        }
      }

      const message = await ChatMessage.create({
        workspace,
        project,
        sender: req.user._id,
        receiver,
        content: content.trim(),
        messageType,
        attachments,
      });
      const populatedMessage = await ChatMessage.findById(message._id)
        .populate('sender receiver', 'fullName email')
        .lean();
      if (!receiver) emitProjectChatMessage(populatedMessage);

      return res.status(201).json({ message: 'Message sent successfully.', message: populatedMessage });
    }

    if (!isWorkspaceAdmin && !['project_manager', 'developer'].includes(workspaceMembership?.role)) {
      return res.status(403).json({ message: 'Workspace member role does not allow sending messages.' });
    }
    if (receiver && !req.workspace.members.some((member) => member.toString() === String(receiver))) {
      return res.status(400).json({ message: 'The message receiver must belong to this workspace.' });
    }
    if (receiver && !(await User.exists({ _id: receiver, isActive: true }))) {
      return res.status(404).json({ message: 'The message receiver is not active.' });
    }

    const message = await ChatMessage.create({
      workspace,
      project,
      sender: req.user._id,
      receiver,
      content: content.trim(),
      messageType,
      attachments,
    });
    const populatedMessage = await ChatMessage.findById(message._id)
      .populate('sender receiver', 'fullName email')
      .lean();
    if (project && !receiver) emitProjectChatMessage(populatedMessage);

    res.status(201).json({ message: 'Message sent successfully.', message: populatedMessage });
  } catch (error) {
    res.status(500).json({ message: 'Message sending failed.', error: error.message });
  }
};

const handleGetMessages = async (req, res) => {
  try {
    const projectIds = await getAccessibleProjectIds(req.user, 'read');
    const workspaces = await Workspace.find(await workspaceFilterForUser(req.user)).select('_id');
    const workspaceIds = workspaces.map((workspace) => workspace._id);
    if (req.query.projectId && !projectIds.some((id) => id.toString() === req.query.projectId)) {
      return res.status(404).json({ message: 'Project not found or access denied.' });
    }
    const accessFilter = req.query.projectId
      ? { project: req.query.projectId }
      : { $or: [
        { project: { $in: projectIds } },
        { project: null, workspace: { $in: workspaceIds } },
      ] };
    const messageConditions = [
      accessFilter,
      { $or: [{ receiver: null }, { receiver: req.user._id }, { sender: req.user._id }] },
    ];
    if (req.query.group === 'true') messageConditions.push({ receiver: null });
    const messageFilter = { $and: messageConditions };
    const messages = await ChatMessage.find(messageFilter)
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('workspace', 'name status')
      .populate('project', 'name status')
      .populate('sender receiver', 'fullName email');
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: 'Messages could not be loaded.', error: error.message });
  }
};

const handlePostNotifications = async (req, res) => {
  try {
    const { user, title, message, type, relatedId } = req.body;

    if (!user || !title || !message) {
      return res.status(400).json({ message: 'User, title and message are required.' });
    }

    const recipient = await User.findOne({ _id: user, isActive: true }).select('_id');
    if (!recipient) {
      return res.status(404).json({ message: 'Active notification recipient not found.' });
    }

    const [adminWorkspaceIds, managedProjectIds] = await Promise.all([
      getAdminWorkspaceIds(req.user),
      getAccessibleProjectIds(req.user, 'manage'),
    ]);
    if (!adminWorkspaceIds.length && !managedProjectIds.length) {
      return res.status(403).json({ message: 'Workspace or project management access is required.' });
    }
    const permittedRecipientIds = new Set([req.user._id.toString()]);
    const [workspaceMemberIds, projectMemberIds] = await Promise.all([
      adminWorkspaceIds.length
        ? Workspace.find({ _id: { $in: adminWorkspaceIds } }).distinct('members')
        : [],
      managedProjectIds.length
        ? ProjectMember.find({
          project: { $in: managedProjectIds },
          isActive: true,
        }).distinct('user')
        : [],
    ]);
    [...workspaceMemberIds, ...projectMemberIds].forEach((id) => permittedRecipientIds.add(id.toString()));
    if (!permittedRecipientIds.has(recipient._id.toString())) {
      return res.status(403).json({ message: 'You can notify only members of workspaces or projects you manage.' });
    }

    const notification = await createNotification({ user, title, message, type, relatedId });
    res.status(201).json({ message: 'Notification created successfully.', notification });
  } catch (error) {
    res.status(500).json({ message: 'Notification creation failed.', error: error.message });
  }
};

const handleGetNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('user', 'fullName email');
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Notifications could not be loaded.', error: error.message });
  }
};

const handlePatchNotificationsNotificationIdRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user._id },
      { isRead: true },
      { new: true, runValidators: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }
    res.json({ message: 'Notification marked as read.', notification });
  } catch (error) {
    res.status(500).json({ message: 'Notification could not be updated.', error: error.message });
  }
};

const handlePatchNotificationsReadAll = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.json({
      message: 'Notifications marked as read.',
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: 'Notifications could not be updated.', error: error.message });
  }
};

const handlePostSeed = async (req, res) => {
  try {
    if (!(await getAdminWorkspaceIds(req.user)).length) {
      return res.status(403).json({ message: 'Workspace administrator access is required.' });
    }
    const adminUser = await User.findOne({ email: 'admin@workspace.com' });
    if (adminUser) {
      return res.status(200).json({ message: 'Demo data already seeded.', users: await User.countDocuments() });
    }

    const admin = await User.create({
      fullName: 'System Admin',
      email: 'admin@workspace.com',
      password: await bcrypt.hash('admin123', 10),
    });

    const pm = await User.create({
      fullName: 'Project Manager',
      email: 'manager@workspace.com',
      password: await bcrypt.hash('manager123', 10),
    });

    const dev1 = await User.create({
      fullName: 'Developer One',
      email: 'dev1@workspace.com',
      password: await bcrypt.hash('dev123', 10),
    });

    const dev2 = await User.create({
      fullName: 'Developer Two',
      email: 'dev2@workspace.com',
      password: await bcrypt.hash('dev123', 10),
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
    await WorkspaceMember.create([
      { workspace: workspace._id, user: admin._id, role: 'admin' },
      { workspace: workspace._id, user: pm._id, role: 'project_manager' },
      { workspace: workspace._id, user: dev1._id, role: 'developer' },
      { workspace: workspace._id, user: dev2._id, role: 'developer' },
    ]);
    await ProjectMember.create([
      { project: project._id, user: pm._id, role: 'project_manager', accessLevel: 'admin' },
      { project: project._id, user: dev1._id, role: 'developer', accessLevel: 'write' },
      { project: project._id, user: dev2._id, role: 'developer', accessLevel: 'write' },
    ]);

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

    await createNotification({
      user: dev1._id,
      title: 'New task assigned',
      message: 'You have been assigned to the login dashboard task.',
      type: 'task',
    });

    res.status(201).json({
      message: 'Demo data seeded successfully.',
      admin: sanitizeUser(admin),
      projectManager: sanitizeUser(pm),
      developers: [sanitizeUser(dev1), sanitizeUser(dev2)],
      workspace,
      project,
      task,
    });
  } catch (error) {
    res.status(500).json({ message: 'Demo seeding failed.', error: error.message });
  }
};

const handlePatchUsersUserIdRole = async (req, res) => {
  return res.status(400).json({
    message: 'Global user roles are no longer supported. Assign roles through workspace or project membership endpoints.',
  });
};

module.exports = {
  handleGetHealth,
  handleGetDashboard,
  handlePostUsersRegister,
  handlePostUsersLogin,
  handlePostUsersLogout,
  handleGetUsersMe,
  handlePatchUsersMe,
  handlePatchUsersMePassword,
  handleGetUsers,
  handlePatchUsersUserIdRole,
  handlePostWorkspaces,
  handlePatchWorkspacesWorkspaceId,
  handleGetWorkspaces,
  handleGetWorkspacesWorkspaceIdMembers,
  handlePostWorkspacesWorkspaceIdMembers,
  handleDeleteWorkspacesWorkspaceIdMembersUserId,
  handlePatchWorkspacesWorkspaceIdRole,
  handleGetWorkspacesWorkspaceIdActivity,
  handlePostProjects,
  handleGetProjects,
  handlePatchProjectsProjectId,
  handlePatchProjectsProjectIdManager,
  handleGetProjectsProjectIdMonitoring,
  handleGetProjectsProjectIdReport,
  handleGetProjectsProjectIdMembers,
  handlePostProjectsProjectIdMembers,
  handlePatchProjectsProjectIdMembersUserIdRole,
  handleDeleteProjectsProjectIdMembersUserId,
  handlePostTasks,
  handlePatchTasksTaskId,
  handlePatchTasksTaskIdAssign,
  handlePatchTasksTaskIdStatus,
  handlePatchTasksTaskIdProgress,
  handleGetTasks,
  handlePostTasksDeadlineAlerts,
  handlePostSubmissions,
  handleGetSubmissions,
  handleGetSubmissionFile,
  handlePatchSubmissionsSubmissionIdReview,
  handlePostMeetings,
  handlePatchMeetingsMeetingIdEnd,
  handleGetMeetings,
  handlePostMessages,
  handleGetMessages,
  handlePostNotifications,
  handleGetNotifications,
  handlePatchNotificationsNotificationIdRead,
  handlePatchNotificationsReadAll,
  handlePostSeed,
};
