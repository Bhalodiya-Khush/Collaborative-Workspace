require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const connectDB = require('../config/db');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const Submission = require('../models/Submission');
const Meeting = require('../models/Meeting');
const Notification = require('../models/Notification');

const seed = async () => {
  try {
    await connectDB();

    const userCount = await User.countDocuments();
    if (userCount > 0) {
      console.log('Demo data already exists. Database is seeded.');
      process.exit(0);
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
      description: 'Main workspace for company software development projects.',
      owner: admin._id,
      members: [admin._id, pm._id, dev1._id, dev2._id],
    });

    const project = await Project.create({
      name: 'Collaborative Workspace Platform',
      description: 'Build the developer collaboration platform with project and task tracking.',
      workspace: workspace._id,
      projectManager: pm._id,
      developers: [dev1._id, dev2._id],
      status: 'in_progress',
      progress: 42,
      defaultBranch: 'main',
    });

    await Workspace.findByIdAndUpdate(workspace._id, { $set: { projects: [project._id] } });
    await User.updateMany(
      { _id: { $in: [admin._id, pm._id, dev1._id, dev2._id] } },
      { $addToSet: { workspaceIds: workspace._id } }
    );
    await User.updateMany(
      { _id: { $in: [pm._id, dev1._id, dev2._id] } },
      { $addToSet: { projectIds: project._id } }
    );
    await ProjectMember.create([
      {
        project: project._id,
        user: pm._id,
        role: 'project_manager',
        accessLevel: 'admin',
      },
      {
        project: project._id,
        user: dev1._id,
        role: 'developer',
        accessLevel: 'write',
      },
      {
        project: project._id,
        user: dev2._id,
        role: 'developer',
        accessLevel: 'write',
      },
    ]);

    const task = await Task.create({
      title: 'Create login and workspace dashboard',
      description: 'Design and implement the login flow and dashboard for the platform.',
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
      agenda: 'Review sprint goals and assign work items.',
    });

    await Notification.create({
      user: dev1._id,
      title: 'New task assigned',
      message: 'You have been assigned to the login dashboard task.',
      type: 'task',
    });

    console.log('Database seeded successfully.');
    console.log({ admin, pm, dev1, dev2, workspace, project, task });
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  }
};

seed();
