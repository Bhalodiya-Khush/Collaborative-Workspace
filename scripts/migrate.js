require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const ActivityLog = require('../models/ActivityLog');

const migrate = async () => {
  try {
    await connectDB();

    const users = await User.find();
    const workspaces = await Workspace.find();
    const projects = await Project.find();

    for (const workspace of workspaces) {
      const memberIds = [...new Set([
        workspace.owner.toString(),
        ...workspace.members.map((member) => member.toString()),
      ])];

      workspace.members = memberIds;
      await workspace.save();
      await User.updateMany(
        { _id: { $in: memberIds } },
        { $addToSet: { workspaceIds: workspace._id } }
      );
    }

    for (const project of projects) {
      const workspace = await Workspace.findById(project.workspace);
      if (!workspace) {
        console.warn(`Skipping project ${project._id}: workspace not found.`);
        continue;
      }

      const projectUserIds = [...new Set([
        project.projectManager.toString(),
        ...project.developers.map((developer) => developer.toString()),
      ])];

      const missingMembers = projectUserIds.filter(
        (userId) => !workspace.members.some((member) => member.toString() === userId)
      );

      if (missingMembers.length > 0) {
        workspace.members.push(...missingMembers);
        await workspace.save();
        await User.updateMany(
          { _id: { $in: missingMembers } },
          { $addToSet: { workspaceIds: workspace._id } }
        );
      }

      await User.updateMany(
        { _id: { $in: projectUserIds } },
        { $addToSet: { projectIds: project._id } }
      );

      await ProjectMember.findOneAndUpdate(
        { project: project._id, user: project.projectManager },
        {
          project: project._id,
          user: project.projectManager,
          role: 'project_manager',
          accessLevel: 'admin',
          isActive: true,
        },
        { upsert: true, new: true, runValidators: true }
      );

      for (const developer of project.developers) {
        await ProjectMember.findOneAndUpdate(
          { project: project._id, user: developer },
          {
            project: project._id,
            user: developer,
            role: 'developer',
            accessLevel: 'write',
            isActive: true,
          },
          { upsert: true, new: true, runValidators: true }
        );
      }

      const existingActivity = await ActivityLog.findOne({
        workspace: workspace._id,
        project: project._id,
        action: 'database_migrated',
      });

      if (!existingActivity) {
        await ActivityLog.create({
          workspace: workspace._id,
          project: project._id,
          user: project.projectManager,
          action: 'database_migrated',
          details: 'Workspace and project membership references were synchronized.',
        });
      }
    }

    console.log(`Migration completed: ${users.length} users, ${workspaces.length} workspaces, ${projects.length} projects checked.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

migrate();
