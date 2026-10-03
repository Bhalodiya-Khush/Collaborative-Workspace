(() => {
  const page = document.body.dataset.page;
  const messageElement = document.getElementById('message');
  const dataElement = document.getElementById('data');

  const show = (data) => {
    if (messageElement) {
      messageElement.textContent = data?.message || 'Completed successfully.';
      messageElement.dataset.error = 'false';
    }
    if (dataElement && data && typeof data === 'object') {
      const hideIdentifiers = (value) => {
        if (Array.isArray(value)) return value.map(hideIdentifiers);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value)
          .filter(([key]) => !['_id', 'id', 'token', 'tokenVersion', 'password'].includes(key))
          .map(([key, child]) => [key, hideIdentifiers(child)]));
      };
      dataElement.textContent = JSON.stringify(hideIdentifiers(data), null, 2);
      dataElement.hidden = false;
    }
  };

  const renderList = (id, items, emptyMessage, renderItem) => {
    const list = document.getElementById(id);
    if (!list) return;
    list.replaceChildren();
    if (!items.length) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = emptyMessage;
      list.append(emptyItem);
      return;
    }
    items.forEach((item) => {
      const listItem = document.createElement('li');
      renderItem(listItem, item);
      list.append(listItem);
    });
  };

  const textWithId = (item, value) => { item.textContent = value; };

  const fail = (error) => {
    if (messageElement) {
      messageElement.textContent = error.message;
      messageElement.dataset.error = 'true';
    }
  };

  const api = async (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const data = response.status === 204 ? null : await response.json();

    if (response.status === 401) {
      window.location.href = '/login';
      return null;
    }
    if (!response.ok) throw new Error(data.message || 'Request failed.');
    return data;
  };

  const bindSubmit = (formId, handler) => {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (messageElement) messageElement.textContent = '';
      try {
        await handler(new FormData(form), form);
      } catch (error) {
        fail(error);
      }
    });
  };

  const formValues = (formData) => Object.fromEntries(formData.entries());
  const jsonRequest = (method, body) => ({ method, body: JSON.stringify(body) });

  if (page === 'login') {
    bindSubmit('loginForm', async (formData) => {
      if (messageElement) messageElement.textContent = 'Logging in...';
      const values = formValues(formData);
      values.email = values.email.trim().toLowerCase();
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Login failed.');
      window.location.href = '/dashboard';
    });
    return;
  }

  if (page === 'register') {
    bindSubmit('registerForm', async (formData) => {
      if (messageElement) messageElement.textContent = 'Creating account...';
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formValues(formData)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Registration failed.');
      if (messageElement) messageElement.textContent = 'Registration successful. Redirecting to login...';
      window.setTimeout(() => { window.location.href = '/login'; }, 700);
    });
    return;
  }

  if (page === 'dashboard') {
    bindLogout();

    Promise.all([
      api('/api/users/me'),
      api('/api/dashboard'),
      api('/api/projects'),
      api('/api/tasks'),
      api('/api/notifications'),
    ]).then(([userData, stats, projects, tasks, notifications]) => {
      if (!userData) return;
      const statsElement = document.getElementById('stats');
      if (statsElement) {
        const values = userData.user.role === 'admin'
          ? [['Team members', stats.totalUsers], ['Workspaces', stats.totalWorkspaces], ['Projects', stats.totalProjects], ['Tasks', stats.totalTasks]]
          : [['Projects', stats.totalProjects], ['Tasks', stats.totalTasks], ['Completed tasks', stats.totalCompletedTasks], ['Submissions', stats.totalSubmissions]];
        statsElement.replaceChildren();
        statsElement.className = 'stats-grid';
        values.forEach(([label, value]) => {
          const card = document.createElement('div');
          card.className = 'stat-card';
          const number = document.createElement('strong');
          number.textContent = String(value);
          const caption = document.createElement('span');
          caption.textContent = label;
          card.append(number, caption);
          statsElement.append(card);
        });
      }
      renderList('projects', projects, 'No accessible projects.', (item, project) => {
        textWithId(item, `${project.name} — ${project.status}`, project._id);
      });
      renderList('tasks', tasks, 'No tasks are assigned or available to you.', (item, task) => {
        textWithId(item, `${task.title} — ${task.status} — ${task.completionPercentage}%`, task._id);
      });
      renderList('notifications', notifications, 'No notifications.', (item, notification) => {
        item.textContent = `${notification.title}: ${notification.message}`;
      });
    }).catch((error) => {
      fail(error);
    });
    return;
  }

  function bindLogout() {
    const logoutButton = document.getElementById('logoutButton');
    if (!logoutButton) return;
    logoutButton.addEventListener('click', async () => {
      try {
        await fetch('/api/users/logout', { method: 'POST', credentials: 'same-origin' });
      } finally {
        window.location.href = '/login';
      }
    });
  }

  const createRealtimeSocket = () => {
    if (typeof window.io !== 'function') {
      throw new Error('Real-time connection support could not be loaded.');
    }
    const socket = window.io({
      withCredentials: true,
      reconnection: true,
    });
    socket.on('connect_error', (error) => {
      fail(new Error(error.message || 'Real-time connection failed.'));
    });
    return socket;
  };

  const requestRealtime = (socket, event, payload) => new Promise((resolve, reject) => {
    socket.timeout(10000).emit(event, payload, (error, result) => {
      if (error) {
        reject(new Error('Real-time request timed out. Check your connection and try again.'));
      } else if (!result?.ok) {
        reject(new Error(result?.message || 'Real-time request failed.'));
      } else {
        resolve(result);
      }
    });
  });

  const loadProjectOptions = async (selectIds) => {
    const projects = await api('/api/projects');
    const projectMap = new Map(projects.map((project) => [project._id, project]));
    selectIds.forEach((selectId) => fillSelect(
      document.getElementById(selectId),
      projects,
      (project) => project.name,
      'Choose a project'
    ));
    return projectMap;
  };

  const fillSelect = (select, items, label, placeholder = 'Choose an option', selectedValue = '') => {
    if (!select) return;
    select.replaceChildren();
    const initialOption = document.createElement('option');
    initialOption.value = '';
    initialOption.textContent = placeholder;
    select.append(initialOption);
    items.forEach((item) => {
      const option = document.createElement('option');
      option.value = item._id;
      option.textContent = label(item);
      if (item.role) option.dataset.role = item.role;
      select.append(option);
    });
    if (selectedValue) select.value = selectedValue;
  };

  const fillMemberChecks = (container, members, name, filter = () => true) => {
    if (!container) return;
    container.replaceChildren();
    const eligibleMembers = members.filter(filter);
    if (!eligibleMembers.length) {
      const empty = document.createElement('p');
      empty.className = 'help';
      empty.textContent = 'No eligible team members found.';
      container.append(empty);
      return;
    }
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'member-search';
    search.placeholder = 'Search by name, email, or role';
    search.setAttribute('aria-label', 'Search members');
    container.append(search);
    const labels = [];
    eligibleMembers.forEach((member) => {
      const label = document.createElement('label');
      label.dataset.searchText = `${member.fullName} ${member.email} ${member.role}`.toLowerCase();
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.name = name;
      checkbox.value = member._id;
      const text = document.createElement('span');
      text.textContent = member.fullName;
      const detail = document.createElement('small');
      detail.textContent = `${member.email} · ${member.role.replace('_', ' ')}`;
      text.append(detail);
      label.append(checkbox, text);
      labels.push(label);
      container.append(label);
    });
    search.addEventListener('input', () => {
      const query = search.value.trim().toLowerCase();
      labels.forEach((label) => {
        label.hidden = query && !label.dataset.searchText.includes(query);
      });
    });
  };

  const getWorkspaceMembers = async (workspaceId) => (
    workspaceId
      ? api(`/api/workspaces/${encodeURIComponent(workspaceId)}/members`)
      : []
  );

  const getProjectMembers = async (projectId) => (
    projectId
      ? api(`/api/projects/${encodeURIComponent(projectId)}/members`)
      : []
  );

  const projectPermissionCache = new Map();
  let projectAccessList;
  const hasProjectPermission = (projectId, permission) => {
    const key = `${projectId}:${permission}`;
    if (projectPermissionCache.has(key)) return projectPermissionCache.get(key);
    const accessPromise = (async () => {
      projectAccessList = projectAccessList || api('/api/projects');
      const projects = await projectAccessList;
      const project = projects.find((item) => String(item._id) === String(projectId));
      if (!project) return false;
      const role = document.body.dataset.role;
      const userId = document.body.dataset.userId;
      if (role === 'admin') return true;
      if (role === 'project_manager'
        && String(project.projectManager?._id || project.projectManager) === userId) return true;

      const memberships = await getProjectMembers(projectId);
      const membership = memberships.find((item) => (
        item.isActive && String(item.user?._id || item.user) === userId
      ));
      if (!membership) return false;
      if (permission === 'review') return membership.role === 'reviewer';
      return role === 'developer'
        && membership.role === 'developer'
        && ['write', 'admin'].includes(membership.accessLevel);
    })();
    projectPermissionCache.set(key, accessPromise);
    return accessPromise;
  };

  const projectOptions = async (selectIds) => {
    const projects = await api('/api/projects');
    selectIds.forEach((id) => fillSelect(
      document.getElementById(id),
      projects,
      (project) => `${project.name} · ${project.workspace?.name || 'Workspace'}`,
      'Choose a project'
    ));
    return projects;
  };

  const taskOptions = async (selectIds, projectId = '') => {
    const tasks = await api('/api/tasks');
    const filtered = projectId
      ? tasks.filter((task) => String(task.project?._id || task.project) === projectId)
      : tasks;
    selectIds.forEach((id) => fillSelect(
      document.getElementById(id),
      filtered,
      (task) => `${task.title} · ${task.project?.name || 'Project'} · ${task.status}`,
      'Choose a task'
    ));
    return tasks;
  };

  bindLogout();

  const endpoints = {
    users: '/api/users',
    workspaces: '/api/workspaces',
    projects: '/api/projects',
    monitoring: '/api/projects',
    reports: '/api/projects',
    tasks: '/api/tasks',
    submissions: '/api/submissions',
    meetings: '/api/meetings',
    messages: '/api/messages',
    notifications: '/api/notifications',
  };
  const listTargets = {
    users: ['users', 'No users are visible to this account.', (item, user) => {
      textWithId(item, `${user.fullName} — ${user.email} — ${user.role}`, user._id);
    }],
    workspaces: ['workspaces', 'No workspaces are available to this account.', (item, workspace) => {
      const members = Array.isArray(workspace.members) ? workspace.members.length : 0;
      textWithId(item, `${workspace.name} — ${members} members`, workspace._id);
    }],
    projects: ['projects', 'No projects are available to this account.', (item, project) => {
      textWithId(item, `${project.name} — ${project.status} — ${project.progress}%`, project._id);
    }],
    tasks: ['tasks', 'No tasks are assigned or available to you.', (item, task) => {
      textWithId(item, `${task.title} — ${task.status} — ${task.completionPercentage}%`, task._id);
    }],
    submissions: ['submissions', 'No submissions are available to this account.', (item, submission) => {
      const title = document.createElement('strong');
      title.textContent = `${submission.title} · ${submission.reviewStatus.replace('_', ' ')}`;
      const details = document.createElement('p');
      details.textContent = `${submission.project?.name || 'Project'} · ${submission.task?.title || 'Task'} · ${submission.branchName || 'no branch'} · ${submission.developer?.fullName || 'Developer'}`;
      item.append(title, details);
      (submission.files || []).forEach((file) => {
        const link = document.createElement('a');
        const storedPath = new URL(file.downloadUrl, window.location.origin).pathname;
        const fileName = storedPath.split('/').pop();
        link.href = `/api/files/${encodeURIComponent(decodeURIComponent(fileName))}`;
        link.textContent = `Download ${file.fileName}`;
        link.setAttribute('download', file.fileName);
        item.append(document.createElement('br'), link);
      });
    }],
    meetings: ['meetings', 'No meetings are available to this account.', (item, meeting) => {
      textWithId(item, `${meeting.title} — ${new Date(meeting.scheduledAt).toLocaleString()} — ${meeting.status}`, meeting._id);
    }],
    messages: ['messages', 'No messages are available to this account.', (item, message) => {
      textWithId(item, `${message.sender?.fullName || 'Member'}: ${message.content}`, message._id);
    }],
    notifications: ['notifications', 'No notifications.', (item, notification) => {
      const title = document.createElement('strong');
      title.textContent = notification.title;
      const details = document.createElement('p');
      details.textContent = notification.message;
      item.append(title, details);
      if (!notification.isRead) {
        const markRead = document.createElement('button');
        markRead.type = 'button';
        markRead.className = 'button button-quiet';
        markRead.textContent = 'Mark as read';
        markRead.addEventListener('click', async () => {
          try {
            await api(`/api/notifications/${encodeURIComponent(notification._id)}/read`, { method: 'PATCH' });
            await load('/api/notifications', listTargets.notifications);
          } catch (error) {
            fail(error);
          }
        });
        item.append(markRead);
      }
    }],
  };
  const load = async (endpoint, target = listTargets[page]) => {
    try {
      const result = await api(endpoint);
      if (target && Array.isArray(result)) {
        renderList(target[0], result, target[1], target[2]);
      } else {
        show(result);
      }
    } catch (error) {
      fail(error);
    }
  };
  if (endpoints[page] && !['dashboard', 'meetings', 'messages'].includes(page)) {
    const target = page === 'monitoring'
      ? ['monitoringProjects', 'No accessible projects.', listTargets.projects[2]]
      : page === 'reports'
        ? ['reportProjects', 'No accessible projects.', listTargets.projects[2]]
        : listTargets[page];
    load(endpoints[page], target);
  }

  if (page === 'meetings') {
    let projectMap = new Map();
    let meetingSocket = null;
    let activeMeetingId = null;
    let localStream = null;
    const peerConnections = new Map();
    const remoteVideos = document.getElementById('remoteMeetingVideos');
    const liveMeetingPanel = document.getElementById('liveMeeting');
    const meetingStatus = document.getElementById('meetingStatus');
    const localVideo = document.getElementById('localMeetingVideo');
    const currentUserId = document.body.dataset.userId;
    const canJoinMeetings = ['admin', 'project_manager', 'developer'].includes(document.body.dataset.role);
    const isWorkspaceAdmin = document.body.dataset.role === 'admin';

    const renderMeetings = (meetings) => {
      renderList('meetings', meetings, 'No meetings for this project yet.', (item, meeting) => {
        const details = document.createElement('p');
        details.textContent = `${meeting.title} — ${new Date(meeting.scheduledAt).toLocaleString()} — ${meeting.status}`;
        item.append(details);
        if (meeting.agenda) {
          const agenda = document.createElement('p');
          agenda.textContent = meeting.agenda;
          item.append(agenda);
        }
        if (canJoinMeetings && (meeting.status === 'scheduled' || meeting.status === 'live')) {
          const joinButton = document.createElement('button');
          joinButton.type = 'button';
          joinButton.textContent = meeting.status === 'live' ? 'Join live meeting' : 'Start / join meeting';
          joinButton.addEventListener('click', () => joinMeeting(meeting).catch(fail));
          item.append(joinButton);
          const meetingHostId = meeting.host?._id || meeting.host;
          const meetingProject = projectMap.get(String(meeting.project?._id || meeting.project));
          const isAssignedManager = document.body.dataset.role === 'project_manager'
            && String(meetingProject?.projectManager?._id || meetingProject?.projectManager) === currentUserId;
          if (isWorkspaceAdmin || isAssignedManager || meetingHostId === currentUserId) {
            const endButton = document.createElement('button');
            endButton.type = 'button';
            endButton.textContent = 'End meeting';
            endButton.addEventListener('click', async () => {
              try {
                await api(`/api/meetings/${encodeURIComponent(meeting._id)}/end`, { method: 'PATCH' });
                await loadMeetings(meeting.project?._id || meeting.project);
              } catch (error) {
                fail(error);
              }
            });
            item.append(endButton);
          }
        }
      });
    };

    const loadMeetings = async (projectId) => {
      const meetings = await api(`/api/meetings?projectId=${encodeURIComponent(projectId)}`);
      renderMeetings(meetings);
    };

    const sendSignal = (peerId, signal) => {
      if (!meetingSocket || !activeMeetingId) return;
      meetingSocket.timeout(10000).emit('meeting:signal', {
        meetingId: activeMeetingId,
        targetPeerId: peerId,
        signal,
      }, (error, result) => {
        if (error) fail(new Error('Meeting signal timed out.'));
        else if (!result?.ok) fail(new Error(result?.message || 'Meeting signal could not be sent.'));
      });
    };

    const createPeerConnection = (peerId, initiateOffer) => {
      if (peerConnections.has(peerId)) return peerConnections.get(peerId);
      const connection = new RTCPeerConnection({ iceServers: window.workspaceIceServers || [] });
      const pendingIceCandidates = [];
      connection.onicecandidate = (event) => {
        if (event.candidate) sendSignal(peerId, { candidate: event.candidate });
      };
      connection.ontrack = (event) => {
        let video = document.getElementById(`remote-video-${peerId}`);
        if (!video) {
          const participant = document.createElement('section');
          const label = document.createElement('p');
          label.id = `remote-label-${peerId}`;
          const currentPeer = peerConnections.get(peerId);
          label.textContent = currentPeer?.displayName || 'Team member';
          video = document.createElement('video');
          video.id = `remote-video-${peerId}`;
          video.autoplay = true;
          video.playsInline = true;
          video.width = 320;
          participant.append(label, video);
          remoteVideos.append(participant);
        }
        if (event.streams[0]) video.srcObject = event.streams[0];
      };
      connection.onconnectionstatechange = () => {
        if (['failed', 'closed'].includes(connection.connectionState)) removePeer(peerId);
      };
      localStream.getTracks().forEach((track) => connection.addTrack(track, localStream));
      connection.pendingIceCandidates = pendingIceCandidates;
      peerConnections.set(peerId, connection);

      if (initiateOffer) {
        connection.createOffer()
          .then((offer) => connection.setLocalDescription(offer))
          .then(() => sendSignal(peerId, { description: connection.localDescription }))
          .catch(fail);
      }
      return connection;
    };

    const removePeer = (peerId) => {
      const connection = peerConnections.get(peerId);
      if (connection) {
        connection.close();
        peerConnections.delete(peerId);
      }
      document.getElementById(`remote-video-${peerId}`)?.parentElement?.remove();
    };

    const leaveMeeting = (notifyServer = true) => {
      if (notifyServer && meetingSocket?.connected && activeMeetingId) {
        meetingSocket.emit('meeting:leave', { meetingId: activeMeetingId });
      }
      peerConnections.forEach((connection) => connection.close());
      peerConnections.clear();
      if (localStream) localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
      activeMeetingId = null;
      localVideo.srcObject = null;
      remoteVideos.replaceChildren();
      liveMeetingPanel.hidden = true;
    };

    const joinMeeting = async (meeting) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support camera and microphone access. Use HTTPS or localhost.');
      }
      if (activeMeetingId) leaveMeeting();
      meetingSocket = meetingSocket || createRealtimeSocket();
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      activeMeetingId = meeting._id;
      localVideo.srcObject = localStream;
      liveMeetingPanel.hidden = false;
      document.getElementById('liveMeetingTitle').textContent = meeting.title;
      meetingStatus.textContent = 'Connecting to the project meeting...';
      document.getElementById('endMeeting').hidden = !canEndMeetings;

      meetingSocket.timeout(10000).emit('meeting:join', { meetingId: meeting._id }, (error, result) => {
        if (error) {
          leaveMeeting(false);
          fail(new Error('Meeting join timed out. Check your connection and try again.'));
          return;
        }
        if (!result?.ok) {
          leaveMeeting(false);
          fail(new Error(result?.message || 'Meeting could not be joined.'));
          return;
        }
        meetingStatus.textContent = `Connected as ${result.user}. ${result.peers.length + 1} participant(s).`;
        result.peers.forEach((peer) => {
          const connection = createPeerConnection(peer.peerId, true);
          connection.displayName = peer.user;
        });
      });
    };

    bindSubmit('meetingForm', async (formData) => {
      const values = formValues(formData);
      values.workspace = document.getElementById('meetingWorkspace').value;
      values.meetingType = 'video';
      values.attendees = [];
      const result = await api('/api/meetings', jsonRequest('POST', values));
      show(result);
      await loadMeetings(values.project);
    });
    bindSubmit('meetingFilterForm', async (formData) => {
      const { projectId } = formValues(formData);
      if (!projectId) throw new Error('Choose a project.');
      await loadMeetings(projectId);
    });

    document.getElementById('meetingProject')?.addEventListener('change', (event) => {
      const project = projectMap.get(event.target.value);
      document.getElementById('meetingWorkspace').value = project?.workspace?._id || project?.workspace || '';
      const filterProject = document.getElementById('meetingFilterProject');
      if (filterProject && project) filterProject.value = project._id;
      const scheduleButton = document.getElementById('scheduleMeetingButton');
      if (scheduleButton) {
        scheduleButton.disabled = true;
        scheduleButton.textContent = 'Checking project access...';
        hasProjectPermission(event.target.value, 'write')
          .then((allowed) => {
            scheduleButton.disabled = !allowed;
            scheduleButton.textContent = allowed
              ? 'Schedule project meeting'
              : 'You have read-only access to this project';
          })
          .catch(fail);
      }
    });
    document.getElementById('leaveMeeting')?.addEventListener('click', leaveMeeting);
    document.getElementById('toggleMeetingMic')?.addEventListener('click', (event) => {
      if (!localStream) return;
      const tracks = localStream.getAudioTracks();
      tracks.forEach((track) => { track.enabled = !track.enabled; });
      event.currentTarget.textContent = tracks.some((track) => track.enabled) ? 'Mute microphone' : 'Unmute microphone';
    });
    document.getElementById('toggleMeetingCamera')?.addEventListener('click', (event) => {
      if (!localStream) return;
      const tracks = localStream.getVideoTracks();
      tracks.forEach((track) => { track.enabled = !track.enabled; });
      event.currentTarget.textContent = tracks.some((track) => track.enabled) ? 'Turn camera off' : 'Turn camera on';
    });
    document.getElementById('endMeeting')?.addEventListener('click', async () => {
      if (!activeMeetingId) return;
      const meetingId = activeMeetingId;
      await api(`/api/meetings/${encodeURIComponent(meetingId)}/end`, { method: 'PATCH' });
      leaveMeeting();
      const projectId = document.getElementById('meetingFilterProject').value;
      if (projectId) await loadMeetings(projectId);
    });

    try {
      meetingSocket = createRealtimeSocket();
    } catch (error) {
      fail(error);
      return;
    }
    loadProjectOptions(['meetingProject', 'meetingFilterProject'])
      .then((projects) => { projectMap = projects; })
      .catch(fail);
    meetingSocket.on('meeting:peer-joined', ({ peerId, user }) => {
      const connection = createPeerConnection(peerId, false);
      connection.displayName = user;
      const label = document.getElementById(`remote-label-${peerId}`);
      if (label) label.textContent = user;
    });
    meetingSocket.on('meeting:signal', async ({ peerId, signal }) => {
      try {
        const connection = peerConnections.get(peerId) || createPeerConnection(peerId, false);
        if (signal.description) {
          await connection.setRemoteDescription(signal.description);
          if (signal.description.type === 'offer') {
            await connection.setLocalDescription(await connection.createAnswer());
            sendSignal(peerId, { description: connection.localDescription });
          }
          for (const candidate of connection.pendingIceCandidates) {
            await connection.addIceCandidate(candidate);
          }
          connection.pendingIceCandidates.length = 0;
        } else if (signal.candidate) {
          if (connection.remoteDescription) await connection.addIceCandidate(signal.candidate);
          else connection.pendingIceCandidates.push(signal.candidate);
        }
      } catch (error) {
        fail(new Error(`Meeting media connection failed: ${error.message}`));
      }
    });
    meetingSocket.on('meeting:peer-left', ({ peerId }) => removePeer(peerId));
    meetingSocket.on('meeting:started', () => {
      if (meetingStatus) meetingStatus.textContent = 'Meeting is live.';
    });
    meetingSocket.on('meeting:ended', ({ meetingId }) => {
      if (activeMeetingId === meetingId) {
        meetingStatus.textContent = 'The host ended this meeting.';
        leaveMeeting();
        const projectId = document.getElementById('meetingFilterProject').value;
        if (projectId) loadMeetings(projectId).catch(fail);
      }
    });
    meetingSocket.on('disconnect', () => {
      if (activeMeetingId) {
        leaveMeeting(false);
        fail(new Error('Connection to the meeting was lost. Rejoin to continue.'));
      }
    });
  }

  if (page === 'workspaces') {
    let workspaces = [];
    let directory = [];
    const refreshWorkspaces = async () => {
      workspaces = await api('/api/workspaces');
      const owned = workspaces.filter((workspace) => (
        String(workspace.owner?._id || workspace.owner) === document.body.dataset.userId
      ));
      ['manageWorkspace', 'roleWorkspace', 'activityWorkspace', 'removeMemberWorkspace', 'updateWorkspace'].forEach((id) => fillSelect(
        document.getElementById(id),
        owned,
        (workspace) => workspace.name,
        'Choose a workspace'
      ));
      const emptyMessage = document.body.dataset.role === 'admin'
        ? 'No workspaces yet. Create your first workspace above.'
        : 'No workspaces are available to your account yet.';
      renderList('workspaces', workspaces, emptyMessage, (item, workspace) => {
        const projectCount = Array.isArray(workspace.projects) ? workspace.projects.length : 0;
        item.textContent = `${workspace.name} · ${workspace.members?.length || 0} members · ${projectCount} projects`;
      });
    };
    if (document.body.dataset.role === 'admin') {
      Promise.all([api('/api/users?available=true'), refreshWorkspaces()])
        .then(([users]) => {
          directory = users;
          fillMemberChecks(document.getElementById('initialWorkspaceMembers'), directory, 'members');
          refreshAvailableWorkspaceMembers();
        }).catch(fail);
    } else {
      refreshWorkspaces().catch(fail);
    }

    async function refreshAvailableWorkspaceMembers() {
      const workspaceId = document.getElementById('manageWorkspace')?.value;
      const existing = workspaceId ? await getWorkspaceMembers(workspaceId) : [];
      const existingIds = new Set(existing.map((member) => String(member._id)));
      const eligible = directory.filter((member) => !existingIds.has(String(member._id)));
      fillSelect(
        document.getElementById('availableWorkspaceMember'),
        eligible,
        (member) => `${member.fullName} · ${member.email}`,
        workspaceId ? 'Choose a person to add' : 'Choose a workspace first'
      );
    }

    async function refreshWorkspaceRoleMembers() {
      const workspaceId = document.getElementById('roleWorkspace')?.value;
      const members = await getWorkspaceMembers(workspaceId);
      const workspace = workspaces.find((item) => String(item._id) === String(workspaceId));
      const ownerId = workspace?.owner?._id || workspace?.owner;
      fillSelect(
        document.getElementById('roleWorkspaceMember'),
        members.filter((member) => String(member._id) !== String(ownerId)),
        (member) => `${member.fullName} · ${member.role.replace('_', ' ')}`,
        workspaceId ? 'Choose a team member' : 'Choose a workspace first'
      );
    }
    async function refreshRemovableWorkspaceMembers() {
      const workspaceId = document.getElementById('removeMemberWorkspace')?.value;
      const members = await getWorkspaceMembers(workspaceId);
      const ownerId = workspaces.find((workspace) => String(workspace._id) === String(workspaceId))?.owner?._id
        || workspaces.find((workspace) => String(workspace._id) === String(workspaceId))?.owner;
      fillSelect(
        document.getElementById('removeWorkspaceMember'),
        members.filter((member) => String(member._id) !== String(ownerId)),
        (member) => `${member.fullName} · ${member.role.replace('_', ' ')}`,
        workspaceId ? 'Choose a member' : 'Choose a workspace first'
      );
    }

    document.getElementById('manageWorkspace')?.addEventListener('change', () => {
      refreshAvailableWorkspaceMembers().catch(fail);
    });
    document.getElementById('roleWorkspace')?.addEventListener('change', () => {
      refreshWorkspaceRoleMembers().catch(fail);
    });
    document.getElementById('removeMemberWorkspace')?.addEventListener('change', () => {
      refreshRemovableWorkspaceMembers().catch(fail);
    });
    document.getElementById('updateWorkspace')?.addEventListener('change', (event) => {
      const workspace = workspaces.find((item) => String(item._id) === event.target.value);
      const form = document.getElementById('workspaceUpdateForm');
      if (form && workspace) {
        form.elements.name.value = workspace.name;
      }
    });
    document.getElementById('refreshWorkspaces')?.addEventListener('click', () => {
      refreshWorkspaces().catch(fail);
    });
    bindSubmit('workspaceForm', async (formData) => {
      const values = formValues(formData);
      values.members = formData.getAll('members');
      show(await api('/api/workspaces', jsonRequest('POST', values)));
      document.getElementById('workspaceForm').reset();
      await refreshWorkspaces();
    });
    bindSubmit('memberForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/members`, jsonRequest('POST', { userId: values.userId })));
      await refreshAvailableWorkspaceMembers();
      await refreshWorkspaces();
    });
    bindSubmit('roleForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.roleWorkspaceId)}/role`, jsonRequest('PATCH', {
        userId: values.roleUserId,
        role: values.role,
      })));
      await refreshWorkspaceRoleMembers();
      await refreshWorkspaces();
    });
    bindSubmit('removeWorkspaceMemberForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/members/${encodeURIComponent(values.userId)}`, { method: 'DELETE' }));
      await refreshRemovableWorkspaceMembers();
      await refreshWorkspaces();
    });
    bindSubmit('workspaceUpdateForm', async (formData) => {
      const values = formValues(formData);
      const workspaceId = values.workspaceId;
      delete values.workspaceId;
      if (!values.name) delete values.name;
      show(await api(`/api/workspaces/${encodeURIComponent(workspaceId)}`, jsonRequest('PATCH', values)));
      await refreshWorkspaces();
    });
    bindSubmit('activityForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/activity`));
    });
  }

  if (page === 'projects') {
    let projects = [];
    const refreshProjects = async () => {
      projects = await projectOptions(['updateProject', 'managerProject', 'memberProject', 'roleProject', 'removeProject']);
      renderList('projects', projects, 'No projects are available yet.', (item, project) => {
        item.textContent = `${project.name} · ${project.status.replace('_', ' ')} · ${project.progress}% complete · Manager: ${project.projectManager?.fullName || 'Not assigned'}`;
      });
      return projects;
    };
    refreshProjects().catch(fail);
    const availableWorkspaces = api('/api/workspaces');
    availableWorkspaces.then((items) => fillSelect(
      document.getElementById('projectWorkspace'),
      items.filter((workspace) => String(workspace.owner?._id || workspace.owner) === document.body.dataset.userId),
      (workspace) => workspace.name,
      'Choose a workspace'
    )).catch((error) => {
      if (document.getElementById('projectWorkspace')) fail(error);
    });

    const loadWorkspaceProjectChoices = async (workspaceId) => {
      const members = await getWorkspaceMembers(workspaceId);
      fillSelect(
        document.getElementById('projectManager'),
        members.filter((member) => member.role === 'project_manager'),
        (member) => `${member.fullName} · ${member.email}`,
        'Choose a project manager'
      );
      fillMemberChecks(
        document.getElementById('projectDeveloperChoices'),
        members,
        'developers',
        (member) => member.role === 'developer'
      );
    };
    document.getElementById('projectWorkspace')?.addEventListener('change', (event) => {
      loadWorkspaceProjectChoices(event.target.value).catch(fail);
    });
    document.getElementById('updateProject')?.addEventListener('change', (event) => {
      const project = projects.find((item) => String(item._id) === event.target.value);
      const form = document.getElementById('projectUpdateForm');
      if (form && project) {
        form.elements.name.value = project.name;
        form.elements.status.value = project.status;
        form.elements.progress.value = project.progress;
      }
    });
    document.getElementById('managerProject')?.addEventListener('change', async (event) => {
      const project = projects.find((item) => String(item._id) === event.target.value);
      const members = await getWorkspaceMembers(project?.workspace?._id || project?.workspace);
      fillSelect(
        document.getElementById('newProjectManager'),
        members.filter((member) => member.role === 'project_manager'
          && String(member._id) !== String(project?.projectManager?._id || project?.projectManager)),
        (member) => `${member.fullName} · ${member.email}`,
        'Choose a project manager'
      );
    });

    const refreshProjectMembers = async (projectId, selectId, includeActiveOnly = true) => {
      const members = await getProjectMembers(projectId);
      const selectable = members
        .filter((member) => member.user && (!includeActiveOnly || member.isActive))
        .map((member) => ({
          _id: member.user._id,
          fullName: member.user.fullName,
          role: member.role,
        }));
      fillSelect(
        document.getElementById(selectId),
        selectable,
        (member) => `${member.fullName} · ${member.role.replace('_', ' ')}`,
        projectId ? 'Choose a project member' : 'Choose a project first'
      );
    };
    const refreshNewProjectMemberChoices = async (projectId) => {
      const project = projects.find((item) => String(item._id) === String(projectId));
      const workspaceMembers = await getWorkspaceMembers(project?.workspace?._id || project?.workspace);
      const activeProjectMembers = await getProjectMembers(projectId);
      const existingIds = new Set(activeProjectMembers.map((member) => String(member.user?._id || '')));
      const eligible = workspaceMembers.filter((member) => (
        !existingIds.has(String(member._id))
        && ['developer', 'viewer'].includes(member.role)
      ));
      fillSelect(
        document.getElementById('projectMemberUser'),
        eligible,
        (member) => `${member.fullName} · ${member.role.replace('_', ' ')}`,
        'Choose a workspace member'
      );
    };
    document.getElementById('projectMemberUser')?.addEventListener('change', (event) => {
      const selectedRole = event.target.selectedOptions[0]?.dataset.role;
      const roleSelect = document.getElementById('newMemberRole');
      const accessSelect = document.getElementById('newMemberAccess');
      if (selectedRole === 'viewer') {
        roleSelect.value = 'guest';
        accessSelect.value = 'read';
      }
    });
    [
      ['memberProject', 'projectMemberUser', false],
      ['roleProject', 'roleProjectMember', true],
      ['removeProject', 'removeProjectMember', true],
    ].forEach(([projectSelect, memberSelect, activeOnly]) => {
      document.getElementById(projectSelect)?.addEventListener('change', (event) => {
        const action = projectSelect === 'memberProject'
          ? refreshNewProjectMemberChoices(event.target.value)
          : refreshProjectMembers(event.target.value, memberSelect, activeOnly);
        action.catch(fail);
      });
    });

    bindSubmit('projectForm', async (formData) => {
      const values = formValues(formData);
      values.developers = formData.getAll('developers');
      show(await api('/api/projects', jsonRequest('POST', values)));
      document.getElementById('projectForm').reset();
      document.getElementById('projectDeveloperChoices')?.replaceChildren();
      await refreshProjects();
    });
    bindSubmit('projectUpdateForm', async (formData) => {
      const values = formValues(formData);
      const projectId = values.projectId;
      delete values.projectId;
      if (values.progress === '') delete values.progress;
      if (values.name === '') delete values.name;
      if (values.status === '') delete values.status;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}`, jsonRequest('PATCH', values)));
      await refreshProjects();
    });
    bindSubmit('projectManagerForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(values.projectId)}/manager`, jsonRequest('PATCH', {
        projectManagerId: values.projectManagerId,
      })));
      await refreshProjects();
    });
    bindSubmit('projectMemberForm', async (formData) => {
      const values = formValues(formData);
      const projectId = values.projectId;
      if (document.getElementById('projectMemberUser')?.selectedOptions[0]?.dataset.role === 'viewer') {
        values.role = 'guest';
        values.accessLevel = 'read';
      }
      delete values.projectId;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members`, jsonRequest('POST', values)));
      await refreshNewProjectMemberChoices(projectId);
      await refreshProjects();
    });
    bindSubmit('projectMemberRoleForm', async (formData) => {
      const values = formValues(formData);
      const { projectId, userId, ...role } = values;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/role`, jsonRequest('PATCH', role)));
      await refreshProjectMembers(projectId, 'roleProjectMember');
    });
    bindSubmit('projectMemberRemoveForm', async (formData) => {
      const { projectId, userId } = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }));
      await refreshProjectMembers(projectId, 'removeProjectMember');
      await refreshProjects();
    });
  }

  if (page === 'monitoring' || page === 'reports') {
    const formId = page === 'monitoring' ? 'monitoringForm' : 'reportForm';
    const suffix = page === 'monitoring' ? '/monitoring' : '/report';
    const selectId = page === 'monitoring' ? 'monitoringProject' : 'reportProject';
    projectOptions([selectId]).catch(fail);
    bindSubmit(formId, async (formData) => {
      const { projectId } = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(projectId)}${suffix}`));
    });
  }

  if (page === 'tasks') {
    let accessibleProjects = [];
    let accessibleTasks = [];
    projectOptions(['taskProject', 'filterTaskProject'])
      .then((projects) => { accessibleProjects = projects; })
      .catch(fail);
    const populateTaskChoices = async () => {
      accessibleTasks = await taskOptions(['assignTask', 'updateTask']);
    };
    populateTaskChoices().catch(fail);
    const loadTaskAssignees = async (projectId, selectId) => {
      const members = await getProjectMembers(projectId);
      const developers = members
        .filter((member) => member.isActive
          && member.user?.role === 'developer'
          && member.role === 'developer'
          && ['write', 'admin'].includes(member.accessLevel))
        .map((member) => ({
          _id: member.user._id,
          fullName: member.user.fullName,
          email: member.user.email,
        }));
      fillSelect(
        document.getElementById(selectId),
        developers,
        (developer) => `${developer.fullName} · ${developer.email}`,
        developers.length ? 'Choose a developer' : 'No writable developers'
      );
    };
    document.getElementById('taskProject')?.addEventListener('change', (event) => {
      const project = accessibleProjects.find((item) => String(item._id) === event.target.value);
      document.getElementById('taskWorkspace').value = project?.workspace?._id || project?.workspace || '';
      loadTaskAssignees(event.target.value, 'taskAssignee').catch(fail);
    });
    document.getElementById('assignTask')?.addEventListener('change', (event) => {
      const task = accessibleTasks.find((item) => String(item._id) === event.target.value);
      loadTaskAssignees(task?.project?._id || task?.project, 'assignDeveloper').catch(fail);
    });
    document.getElementById('updateTask')?.addEventListener('change', (event) => {
      const task = accessibleTasks.find((item) => String(item._id) === event.target.value);
      const form = document.getElementById('taskUpdateForm');
      if (form && task) {
        form.elements.status.value = task.status;
        form.elements.completionPercentage.value = task.completionPercentage ?? '';
      }
    });
    bindSubmit('taskForm', async (formData) => {
      const values = formValues(formData);
      if (!values.assignee) delete values.assignee;
      if (!values.dueDate) delete values.dueDate;
      show(await api('/api/tasks', jsonRequest('POST', values)));
      document.getElementById('taskForm').reset();
      await populateTaskChoices();
    });
    bindSubmit('taskUpdateForm', async (formData) => {
      const values = formValues(formData);
      const taskId = values.taskId;
      if (values.status) await api(`/api/tasks/${encodeURIComponent(taskId)}/status`, jsonRequest('PATCH', { status: values.status }));
      if (values.completionPercentage !== '') {
        show(await api(`/api/tasks/${encodeURIComponent(taskId)}/progress`, jsonRequest('PATCH', {
          completionPercentage: Number(values.completionPercentage),
        })));
      } else if (values.status) {
        show({ message: 'Task status updated successfully.' });
      } else {
        throw new Error('Choose a status or enter progress to update.');
      }
      await populateTaskChoices();
    });
    bindSubmit('taskAssignForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/tasks/${encodeURIComponent(values.taskId)}/assign`, jsonRequest('PATCH', { assignee: values.assignee })));
      await populateTaskChoices();
    });
    bindSubmit('taskFilterForm', async (formData) => {
      const values = formValues(formData);
      const query = new URLSearchParams(
        Object.entries(values).filter(([, value]) => Boolean(value))
      );
      await load(`/api/tasks?${query.toString()}`, listTargets.tasks);
    });
    bindSubmit('deadlineAlertForm', async (formData) => {
      const values = formValues(formData);
      show(await api('/api/tasks/deadline-alerts', jsonRequest('POST', { days: Number(values.days) })));
    });
  }

  if (page === 'submissions') {
    const populateSubmissions = async () => {
      const submissions = await api('/api/submissions');
      const reviewable = [];
      for (const submission of submissions) {
        const projectId = String(submission.project?._id || submission.project);
        if (await hasProjectPermission(projectId, 'review')) reviewable.push(submission);
      }
      fillSelect(
        document.getElementById('reviewSubmission'),
        reviewable,
        (submission) => `${submission.title} · ${submission.project?.name || 'Project'} · ${submission.reviewStatus.replace('_', ' ')}`,
        reviewable.length ? 'Choose a submission' : 'No submissions are available for your review'
      );
    };
    if (document.getElementById('submissionProject')) {
      projectOptions(['submissionProject']).catch(fail);
      document.getElementById('submissionProject').addEventListener('change', (event) => {
        const button = document.getElementById('uploadSubmissionButton');
        button.disabled = true;
        button.textContent = 'Checking project access...';
        Promise.all([
          hasProjectPermission(event.target.value, 'write'),
          taskOptions(['submissionTask'], event.target.value),
        ]).then(([allowed]) => {
          button.disabled = !allowed;
          button.textContent = allowed
            ? 'Upload submission'
            : 'You have read-only access to this project';
        }).catch(fail);
      });
    }
    if (document.getElementById('reviewSubmission')) populateSubmissions().catch(fail);
    bindSubmit('submissionForm', async (formData) => {
      const button = document.getElementById('uploadSubmissionButton');
      button.disabled = true;
      button.textContent = 'Uploading...';
      let uploaded = false;
      try {
        const response = await fetch('/api/submissions', {
          method: 'POST',
          body: formData,
          credentials: 'same-origin',
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Upload failed.');
        show(data);
        uploaded = true;
        document.getElementById('submissionForm').reset();
        await load('/api/submissions', listTargets.submissions);
        if (document.getElementById('reviewSubmission')) await populateSubmissions();
      } finally {
        button.disabled = uploaded;
        button.textContent = uploaded ? 'Choose a project with write access' : 'Upload submission';
      }
    });
    bindSubmit('submissionReviewForm', async (formData) => {
      const values = formValues(formData);
      const submissionId = values.submissionId;
      delete values.submissionId;
      show(await api(`/api/submissions/${encodeURIComponent(submissionId)}/review`, jsonRequest('PATCH', values)));
      await populateSubmissions();
      await load('/api/submissions', listTargets.submissions);
    });
  }

  if (page === 'messages') {
    const socket = createRealtimeSocket();
    const chatPanel = document.getElementById('projectChatPanel');
    const chatList = document.getElementById('project-chat-messages');
    const chatStatus = document.getElementById('projectChatConnection');
    let activeProjectId = null;
    let selectedProjects = new Map();
    let seenMessageIds = new Set();
    let historyLoading = false;
    let queuedChatMessages = [];

    const appendChatMessage = (message) => {
      const messageProjectId = String(message.project?._id || message.project || '');
      if (messageProjectId && activeProjectId && messageProjectId !== activeProjectId) return;
      const messageId = String(message._id || '');
      if (messageId && seenMessageIds.has(messageId)) return;
      if (messageId) seenMessageIds.add(messageId);
      if (!chatList) return;
      const empty = chatList.querySelector('[data-empty]');
      if (empty) empty.remove();
      const item = document.createElement('li');
      const senderName = message.sender?.fullName || 'Team member';
      const timestamp = new Date(message.createdAt || Date.now()).toLocaleString();
      item.textContent = `${senderName} · ${timestamp}: ${message.content}`;
      chatList.append(item);
      chatList.scrollTop = chatList.scrollHeight;
    };

    const openProjectChat = async (projectId) => {
      if (!projectId) throw new Error('Choose a project.');
      if (activeProjectId && activeProjectId !== projectId) {
        socket.emit('project:chat:leave', { projectId: activeProjectId });
      }
      activeProjectId = projectId;
      seenMessageIds = new Set();
      queuedChatMessages = [];
      historyLoading = true;
      chatPanel.hidden = false;
      const chatForm = document.getElementById('projectChatForm');
      chatForm.hidden = true;
      document.getElementById('projectChatTitle').textContent = `${selectedProjects.get(projectId)?.name || 'Project'} team chat`;
      chatStatus.textContent = 'Connecting to project chat...';
      try {
        const joined = await requestRealtime(socket, 'project:chat:join', { projectId });
        const canSend = await hasProjectPermission(projectId, 'write');
        chatStatus.textContent = canSend
          ? `Connected to ${selectedProjects.get(joined.projectId)?.name || 'project'} team chat.`
          : 'You have read-only access to this project chat.';
        chatForm.hidden = !canSend;
        const messages = await api(`/api/messages?projectId=${encodeURIComponent(projectId)}&group=true`);
        chatList.replaceChildren();
        if (!messages.length) {
          const empty = document.createElement('li');
          empty.dataset.empty = 'true';
          empty.textContent = 'No messages yet. Start the conversation.';
          chatList.append(empty);
        } else {
          messages.forEach(appendChatMessage);
        }
        queuedChatMessages.forEach(appendChatMessage);
      } finally {
        historyLoading = false;
        queuedChatMessages = [];
      }
    };

    bindSubmit('projectChatSelectForm', async (formData) => {
      await openProjectChat(formValues(formData).projectId);
    });
    bindSubmit('projectChatForm', async (formData, form) => {
      const content = formValues(formData).content.trim();
      if (!content || !activeProjectId) throw new Error('Open a project chat and enter a message.');
      const result = await requestRealtime(socket, 'project:chat:send', { projectId: activeProjectId, content });
      form.reset();
      show({ message: 'Message sent.', id: result.message._id });
    });

    socket.on('project:chat:message', (message) => {
      if (historyLoading) queuedChatMessages.push(message);
      else appendChatMessage(message);
    });
    socket.on('connect', () => {
      chatStatus.textContent = activeProjectId ? 'Reconnected. Reopen this project chat to continue.' : '';
      if (activeProjectId) openProjectChat(activeProjectId).catch(fail);
    });
    loadProjectOptions(['chatProject'])
      .then((projects) => { selectedProjects = projects; })
      .catch(fail);
  }

  if (page === 'notifications') {
    if (document.getElementById('notificationUser')) {
      api('/api/users')
        .then((users) => fillSelect(
          document.getElementById('notificationUser'),
          users,
          (user) => `${user.fullName} · ${user.email}`,
          'Choose a team member'
        )).catch(fail);
    }
    bindSubmit('notificationForm', async (formData) => {
      show(await api('/api/notifications', jsonRequest('POST', formValues(formData))));
      document.getElementById('notificationForm').reset();
      await load('/api/notifications', listTargets.notifications);
    });
    document.getElementById('markAllRead')?.addEventListener('click', async () => {
      try {
        show(await api('/api/notifications/read-all', { method: 'PATCH' }));
        await load('/api/notifications', listTargets.notifications);
      } catch (error) { fail(error); }
    });
  }

  if (page === 'profile') {
    bindSubmit('profileForm', async (formData) => {
      const values = formValues(formData);
      values.skills = values.skills.split(',').map((skill) => skill.trim()).filter(Boolean);
      show(await api('/api/users/me', jsonRequest('PATCH', values)));
    });
    bindSubmit('passwordForm', async (formData) => {
      show(await api('/api/users/me/password', jsonRequest('PATCH', formValues(formData))));
      document.getElementById('passwordForm').reset();
      window.setTimeout(() => { window.location.href = '/login'; }, 1200);
    });
  }
})();
