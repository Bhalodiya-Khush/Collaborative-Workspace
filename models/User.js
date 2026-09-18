const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['admin', 'project_manager', 'developer', 'viewer'],
      default: 'developer',
    },
    profileImage: {
      type: String,
      default: '',
    },
    skills: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    workspaceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' }],
    projectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
