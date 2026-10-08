const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const ChatMessage = require('../models/ChatMessage');
const { resolveProjectAccess } = require('../middleware/projectAccess');

let io;

const userRoom = (userId) => `user:${userId}`;
const projectChatRoom = (projectId) => `project:${projectId}:chat`;
const meetingRoom = (meetingId) => `meeting:${meetingId}`;
const acknowledge = (callback, result) => {
  if (typeof callback === 'function') callback(result);
};

const getCookieToken = (cookieHeader, name) => {
  const entry = (cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
};

const attachRealtimeServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_ORIGIN || '*',
    },
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth && socket.handshake.auth.token)
      || getCookieToken(socket.handshake.headers.cookie, 'collaborativeWorkspaceToken');
    if (typeof token !== 'string' || !token) {
      return next(new Error('Authentication required.'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('_id fullName isActive tokenVersion');
      if (!user || !user.isActive || (decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
        return next(new Error('Authentication required.'));
      }

      socket.data.userId = user._id.toString();
      socket.data.displayName = user.fullName;
      socket.data.tokenExpiresAt = decoded.exp;
      return next();
    } catch (error) {
      return next(new Error('Authentication could not be verified.'));
    }
  });

  io.on('connection', (socket) => {
    const room = userRoom(socket.data.userId);
    const expiresAt = socket.data.tokenExpiresAt * 1000;
    const disconnectTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(0, expiresAt - Date.now())
    );
    disconnectTimer.unref();
    socket.once('disconnect', () => clearTimeout(disconnectTimer));
    socket.join(room);

    socket.data.projectChatIds = new Set();
    socket.data.meetingIds = new Set();

    socket.on('project:chat:join', async (payload = {}, callback) => {
      try {
        const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
        const access = await resolveProjectAccess({ _id: socket.data.userId }, projectId);
        if (!access || !access.permissions.has('read')) {
          await socket.leave(projectChatRoom(projectId));
          socket.data.projectChatIds.delete(projectId);
          acknowledge(callback, { ok: false, message: 'Project not found or access denied.' });
          return;
        }

        const roomName = projectChatRoom(projectId);
        await socket.join(roomName);
        socket.data.projectChatIds.add(projectId);
        acknowledge(callback, { ok: true, projectId });
      } catch (error) {
        acknowledge(callback, { ok: false, message: 'Project chat could not be joined.' });
      }
    });

    socket.on('project:chat:leave', async (payload = {}, callback) => {
      const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
      if (!socket.data.projectChatIds.has(projectId)) {
        acknowledge(callback, { ok: true });
        return;
      }
      await socket.leave(projectChatRoom(projectId));
      socket.data.projectChatIds.delete(projectId);
      acknowledge(callback, { ok: true });
    });

    socket.on('project:chat:send', async (payload = {}, callback) => {
      try {
        const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
        const content = typeof payload.content === 'string' ? payload.content.trim() : '';
        if (!socket.data.projectChatIds.has(projectId)) {
          acknowledge(callback, { ok: false, message: 'Join the project chat before sending a message.' });
          return;
        }
        if (!content || content.length > 4000) {
          acknowledge(callback, { ok: false, message: 'Message must contain 1 to 4000 characters.' });
          return;
        }

        const access = await resolveProjectAccess({ _id: socket.data.userId }, projectId);
        if (!access || !access.permissions.has('write')) {
          await socket.leave(projectChatRoom(projectId));
          socket.data.projectChatIds.delete(projectId);
          acknowledge(callback, { ok: false, message: 'Project access was revoked.' });
          return;
        }

        const message = await ChatMessage.create({
          workspace: access.project.workspace,
          project: access.project._id,
          sender: socket.data.userId,
          content,
          messageType: 'text',
        });
        const populatedMessage = await ChatMessage.findById(message._id)
          .populate('sender', 'fullName email')
          .lean();
        io.to(projectChatRoom(projectId)).emit('project:chat:message', populatedMessage);
        acknowledge(callback, { ok: true, message: populatedMessage });
      } catch (error) {
        acknowledge(callback, { ok: false, message: 'Message could not be sent.' });
      }
    });

    socket.on('meeting:join', async (payload = {}, callback) => {
      try {
        const meetingId = typeof payload.meetingId === 'string' ? payload.meetingId : '';
        const meeting = await Meeting.findById(meetingId)
          .select('project workspace host attendees status scheduledAt durationMinutes')
          .populate('host', 'fullName')
          .lean();
        if (!meeting || meeting.status === 'completed' || meeting.status === 'cancelled') {
          acknowledge(callback, { ok: false, message: 'An active meeting was not found.' });
          return;
        }

        let hasAccess = false;
        if (meeting.project) {
          const access = await resolveProjectAccess({ _id: socket.data.userId }, meeting.project);
          const isHost = meeting.host?._id?.toString() === socket.data.userId;
          const isProjectManager = Boolean(access
            && (access.project.projectManager.toString() === socket.data.userId
              || access.membership?.role === 'project_manager'));
          const isAttendee = meeting.attendees.some((attendee) => attendee.toString() === socket.data.userId);
          const isWorkspaceAdmin = Boolean(access && !access.membership
            && access.permissions.has('manage'));
          hasAccess = Boolean(access && access.permissions.has('read')
            && (isHost || isProjectManager || isWorkspaceAdmin || isAttendee));
        } else if (meeting.workspace) {
          const Workspace = require('../models/Workspace');
          const workspace = await Workspace.findOne({
            _id: meeting.workspace,
            status: 'active',
            $or: [{ owner: socket.data.userId }, { members: socket.data.userId }],
          }).lean();
          hasAccess = Boolean(workspace);
        }

        if (!hasAccess) {
          await socket.leave(meetingRoom(meetingId));
          socket.data.meetingIds.delete(meetingId);
          acknowledge(callback, { ok: false, message: 'Meeting access denied.' });
          return;
        }

        const scheduledAt = new Date(meeting.scheduledAt).getTime();
        if (meeting.status === 'scheduled' && Date.now() < scheduledAt - 15 * 60 * 1000) {
          acknowledge(callback, { ok: false, message: 'This meeting can be joined 15 minutes before its scheduled start.' });
          return;
        }

        const roomName = meetingRoom(meetingId);
        const sockets = await io.in(roomName).fetchSockets();
        if (!sockets.some((peer) => peer.id === socket.id) && sockets.length >= 8) {
          acknowledge(callback, { ok: false, message: 'This group meeting is at its 8 participant limit.' });
          return;
        }
        if (meeting.status === 'scheduled') {
          await Meeting.updateOne(
            { _id: meeting._id, status: 'scheduled' },
            { $set: { status: 'live' } }
          );
          io.to(roomName).emit('meeting:started', { meetingId });
        }
        const peers = sockets
          .filter((peer) => peer.id !== socket.id)
          .map((peer) => ({ peerId: peer.id, user: peer.data.displayName || 'Team member' }));
        await Meeting.updateOne({ _id: meeting._id }, { $addToSet: { attendees: socket.data.userId } });
        await socket.join(roomName);
        socket.data.meetingIds.add(meetingId);
        socket.to(roomName).emit('meeting:peer-joined', {
          peerId: socket.id,
          user: socket.data.displayName,
        });
        acknowledge(callback, { ok: true, meetingId, peers, user: socket.data.displayName });
      } catch (error) {
        acknowledge(callback, { ok: false, message: 'Meeting could not be joined.' });
      }
    });

    socket.on('meeting:signal', async (payload = {}, callback) => {
      const { meetingId, targetPeerId, signal } = payload;
      if (typeof meetingId !== 'string' || !socket.data.meetingIds.has(meetingId)
        || typeof targetPeerId !== 'string' || !signal || typeof signal !== 'object') {
        acknowledge(callback, { ok: false, message: 'Invalid meeting signal.' });
        return;
      }

      try {
        const meeting = await Meeting.findOne({
          _id: meetingId,
          status: 'live',
        }).select('project workspace').lean();
        if (!meeting) {
          acknowledge(callback, { ok: false, message: 'Active meeting not found.' });
          return;
        }

        let hasAccess = false;
        if (meeting.project) {
          const access = await resolveProjectAccess({ _id: socket.data.userId }, meeting.project);
          hasAccess = Boolean(access && access.permissions.has('read'));
        } else if (meeting.workspace) {
          const Workspace = require('../models/Workspace');
          const workspace = await Workspace.findOne({
            _id: meeting.workspace,
            status: 'active',
            $or: [{ owner: socket.data.userId }, { members: socket.data.userId }],
          }).lean();
          hasAccess = Boolean(workspace);
        }

        if (!hasAccess) {
          await socket.leave(meetingRoom(meetingId));
          socket.data.meetingIds.delete(meetingId);
          socket.to(meetingRoom(meetingId)).emit('meeting:peer-left', { peerId: socket.id });
          acknowledge(callback, { ok: false, message: 'Meeting access was revoked.' });
          return;
        }
        const targetSockets = await io.in(meetingRoom(meetingId)).fetchSockets();
        const target = targetSockets.find((peer) => peer.id === targetPeerId);
        if (!target) {
          acknowledge(callback, { ok: false, message: 'Meeting participant is no longer connected.' });
          return;
        }
        io.to(targetPeerId).emit('meeting:signal', {
          meetingId,
          peerId: socket.id,
          signal,
        });
        acknowledge(callback, { ok: true });
      } catch (error) {
        acknowledge(callback, { ok: false, message: 'Meeting signal could not be delivered.' });
      }
    });

    socket.on('meeting:leave', async (payload = {}, callback) => {
      const meetingId = typeof payload.meetingId === 'string' ? payload.meetingId : '';
      if (!socket.data.meetingIds.has(meetingId)) {
        acknowledge(callback, { ok: false, message: 'You are not in this meeting.' });
        return;
      }
      await socket.leave(meetingRoom(meetingId));
      socket.data.meetingIds.delete(meetingId);
      socket.to(meetingRoom(meetingId)).emit('meeting:peer-left', { peerId: socket.id });
      acknowledge(callback, { ok: true });
    });

    socket.on('disconnecting', () => {
      for (const meetingId of socket.data.meetingIds) {
        socket.to(meetingRoom(meetingId)).emit('meeting:peer-left', { peerId: socket.id });
      }
    });
  });

  return io;
};

const emitNotification = (notification) => {
  if (!io) {
    throw new Error('Real-time notification server has not been initialized.');
  }

  const payload = notification.toObject ? notification.toObject() : { ...notification };
  io.to(userRoom(String(payload.user))).emit('notification:new', payload);
};

const emitProjectChatMessage = (message) => {
  if (!io) throw new Error('Real-time server has not been initialized.');
  const payload = message.toObject ? message.toObject() : { ...message };
  if (payload.project) {
    io.to(projectChatRoom(String(payload.project))).emit('project:chat:message', payload);
  }
};

const emitMeetingEnded = (meetingId) => {
  if (!io) throw new Error('Real-time server has not been initialized.');
  io.to(meetingRoom(String(meetingId))).emit('meeting:ended', { meetingId: String(meetingId) });
};

const disconnectUserSockets = (userId) => {
  if (io) {
    io.in(userRoom(String(userId))).disconnectSockets(true);
  }
};

module.exports = {
  attachRealtimeServer,
  emitNotification,
  emitProjectChatMessage,
  emitMeetingEnded,
  disconnectUserSockets,
};
