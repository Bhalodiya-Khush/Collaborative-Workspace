require('dotenv').config();
const mongoose = require('mongoose');

const connectDB = require('../config/db');
const User = require('../models/User');
const Workspace = require('../models/Workspace');
const WorkspaceMember = require('../models/WorkspaceMember');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const ActivityLog = require('../models/ActivityLog');

const getLegacyWorkspaceRole = (legacyRole, defaultRole) => {
  if (['project_manager', 'developer', 'viewer'].includes(legacyRole)) return legacyRole;
  return ['developer', 'viewer'].includes(defaultRole) ? defaultRole : 'developer';
};

const migrate = async () => {
  try {
    await connectDB();

    const legacyUsers = await User.collection.find({}, { projection: { _id: 1, role: 1 } }).toArray();
    const legacyRoleByUser = new Map(legacyUsers.map((user) => [user._id.toString(), user.role]));
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
      for (const userId of memberIds) {
        const existingMembership = await WorkspaceMember.findOne({
          workspace: workspace._id,
          user: userId,
        });
        const role = userId === workspace.owner.toString()
          ? 'admin'
          : existingMembership?.role
            || getLegacyWorkspaceRole(
              legacyRoleByUser.get(userId),
              workspace.settings?.defaultRole
            );
        await WorkspaceMember.findOneAndUpdate(
          { workspace: workspace._id, user: userId },
          { workspace: workspace._id, user: userId, role, isActive: true },
          { upsert: true, runValidators: true }
        );
      }
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
        for (const userId of missingMembers) {
          const legacyRole = legacyRoleByUser.get(userId);
          await WorkspaceMember.findOneAndUpdate(
            { workspace: workspace._id, user: userId },
            {
              workspace: workspace._id,
              user: userId,
              role: getLegacyWorkspaceRole(legacyRole, workspace.settings?.defaultRole),
              isActive: true,
            },
            { upsert: true, runValidators: true }
          );
        }
      }

      await User.updateMany(
        { _id: { $in: projectUserIds } },
        { $addToSet: { projectIds: project._id } }
      );

      const existingManagerMembership = await ProjectMember.findOne({
        project: project._id,
        user: project.projectManager,
      });
      if (existingManagerMembership) {
        existingManagerMembership.role = 'project_manager';
        existingManagerMembership.accessLevel = 'admin';
        existingManagerMembership.isActive = true;
        await existingManagerMembership.save();
      } else {
        await ProjectMember.create({
          project: project._id,
          user: project.projectManager,
          role: 'project_manager',
          accessLevel: 'admin',
          isActive: true,
        });
      }

      for (const developer of project.developers) {
        const existingDeveloperMembership = await ProjectMember.findOne({
          project: project._id,
          user: developer,
        });
        if (existingDeveloperMembership) {
          existingDeveloperMembership.isActive = true;
          await existingDeveloperMembership.save();
        } else {
          await ProjectMember.create({
            project: project._id,
            user: developer,
            role: 'developer',
            accessLevel: 'write',
            isActive: true,
          });
        }
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

    await User.collection.updateMany({}, { $unset: { role: '' } });

    console.log(`Migration completed: ${legacyUsers.length} users, ${workspaces.length} workspaces, ${projects.length} projects checked.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

migrate();
