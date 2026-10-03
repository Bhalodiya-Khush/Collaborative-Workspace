const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    projects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Project' }],
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active',
    },
    settings: {
      allowExternalFiles: { type: Boolean, default: true },
      defaultRole: { type: String, default: 'developer' },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Workspace', workspaceSchema);
