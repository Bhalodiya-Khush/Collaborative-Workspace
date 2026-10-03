const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema(
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
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    projectManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    developers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['planning', 'in_progress', 'review', 'completed', 'on_hold'],
      default: 'planning',
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    repositoryUrl: {
      type: String,
      default: '',
    },
    defaultBranch: {
      type: String,
      default: 'main',
    },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Project', projectSchema);
