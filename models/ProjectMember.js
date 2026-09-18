const mongoose = require('mongoose');

const projectMemberSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['project_manager', 'developer', 'reviewer', 'guest'],
      default: 'developer',
    },
    accessLevel: {
      type: String,
      enum: ['read', 'write', 'admin'],
      default: 'write',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProjectMember', projectMemberSchema);
