const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    workspace: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    messageType: {
      type: String,
      enum: ['text', 'file', 'system'],
      default: 'text',
    },
    attachments: [{ type: String }],
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
