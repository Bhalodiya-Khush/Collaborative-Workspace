const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    branchName: {
      type: String,
      default: 'feature/dev-branch',
    },
    files: [
      {
        fileName: { type: String, required: true },
        downloadUrl: { type: String, required: true },
        fileType: { type: String, default: 'application/octet-stream' },
        size: { type: Number, default: 0 },
      },
    ],
    reviewStatus: {
      type: String,
      enum: ['pending', 'approved', 'changes_requested'],
      default: 'pending',
    },
    reviewNotes: {
      type: String,
      default: '',
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Submission', submissionSchema);
