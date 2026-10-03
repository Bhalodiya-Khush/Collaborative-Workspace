(() => {
  const tokenKey = 'collaborativeWorkspaceToken';
  const page = document.body.dataset.page;
  const messageElement = document.getElementById('message');
  const dataElement = document.getElementById('data');

  const show = (data) => {
    if (messageElement) messageElement.textContent = 'Operation completed.';
    if (dataElement) dataElement.textContent = JSON.stringify(data, null, 2);
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

  const textWithId = (item, value, id) => {
    item.textContent = `${value} (ID: ${id})`;
  };

  const fail = (error) => {
    if (messageElement) messageElement.textContent = error.message;
  };

  const api = async (url, options = {}) => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      window.location.href = '/login';
      return null;
    }

    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (response.status === 401) {
      localStorage.removeItem(tokenKey);
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
      localStorage.setItem(tokenKey, data.token);
      if (data.user?.role) localStorage.setItem('collaborativeWorkspaceRole', data.user.role);
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
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      window.location.href = '/login';
      return;
    }

    bindLogout();

    Promise.all([
      api('/api/users/me'),
      api('/api/dashboard'),
      api('/api/projects'),
      api('/api/tasks'),
      api('/api/notifications'),
    ]).then(([userData, stats, projects, tasks, notifications]) => {
      if (!userData) return;
      localStorage.setItem('collaborativeWorkspaceRole', userData.user.role);
      const statsElement = document.getElementById('stats');
      if (statsElement) {
        const values = userData.user.role === 'admin'
          ? [`Users: ${stats.totalUsers}`, `Workspaces: ${stats.totalWorkspaces}`, `Projects: ${stats.totalProjects}`, `Tasks: ${stats.totalTasks}`]
          : [`Projects: ${stats.totalProjects}`, `Tasks: ${stats.totalTasks}`, `Completed tasks: ${stats.totalCompletedTasks}`, `Submissions: ${stats.totalSubmissions}`];
        statsElement.textContent = values.join(' | ');
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
        await fetch('/api/users/logout', { method: 'POST' });
      } finally {
        localStorage.removeItem(tokenKey);
        localStorage.removeItem('collaborativeWorkspaceRole');
        window.location.href = '/login';
      }
    });
  }

  const createRealtimeSocket = () => {
    if (typeof window.io !== 'function') {
      throw new Error('Real-time connection support could not be loaded.');
    }
    const token = localStorage.getItem(tokenKey);
    if (!token) throw new Error('Sign in before connecting.');
    const socket = window.io({
      auth: { token },
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
    selectIds.forEach((selectId) => {
      const select = document.getElementById(selectId);
      if (!select) return;
      select.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = projects.length ? 'Choose a project' : 'No accessible projects';
      select.append(placeholder);
      projects.forEach((project) => {
        const option = document.createElement('option');
        option.value = project._id;
        option.textContent = project.name;
        select.append(option);
      });
    });
    return projectMap;
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
      textWithId(item, `${submission.title} — ${submission.reviewStatus} — ${submission.branchName || 'no branch'}`, submission._id);
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
      textWithId(item, `${notification.title}: ${notification.message}`, notification._id);
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
    const canEndMeetings = ['admin', 'project_manager'].includes(document.body.dataset.role);

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
          if (canEndMeetings || meetingHostId === currentUserId) {
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

  if (page === 'users') {
    bindSubmit('roleForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/users/${encodeURIComponent(values.userId)}/role`, jsonRequest('PATCH', { role: values.role })));
    });
  }

  if (page === 'workspaces') {
    bindSubmit('workspaceForm', async (formData) => {
      const values = formValues(formData);
      values.members = values.members ? values.members.split(',').map((item) => item.trim()).filter(Boolean) : [];
      show(await api('/api/workspaces', jsonRequest('POST', values)));
    });
    bindSubmit('memberForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/members`, jsonRequest('POST', { userId: values.userId })));
    });
    bindSubmit('roleForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.roleWorkspaceId)}/role`, jsonRequest('PATCH', {
        userId: values.roleUserId,
        role: values.role,
      })));
    });
    bindSubmit('activityForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/workspaces/${encodeURIComponent(values.workspaceId)}/activity`));
    });
  }

  if (page === 'projects') {
    bindSubmit('projectForm', async (formData) => {
      const values = formValues(formData);
      values.developers = values.developers ? values.developers.split(',').map((item) => item.trim()).filter(Boolean) : [];
      show(await api('/api/projects', jsonRequest('POST', values)));
    });
    bindSubmit('projectUpdateForm', async (formData) => {
      const values = formValues(formData);
      const projectId = values.projectId;
      delete values.projectId;
      if (values.progress === '') delete values.progress;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}`, jsonRequest('PATCH', values)));
    });
    bindSubmit('projectMemberForm', async (formData) => {
      const values = formValues(formData);
      const projectId = values.projectId;
      delete values.projectId;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members`, jsonRequest('POST', values)));
    });
    bindSubmit('projectMemberRoleForm', async (formData) => {
      const values = formValues(formData);
      const { projectId, userId, ...role } = values;
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/role`, jsonRequest('PATCH', role)));
    });
    bindSubmit('projectMemberRemoveForm', async (formData) => {
      const { projectId, userId } = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }));
    });
  }

  if (page === 'monitoring' || page === 'reports') {
    const formId = page === 'monitoring' ? 'monitoringForm' : 'reportForm';
    const suffix = page === 'monitoring' ? '/monitoring' : '/report';
    bindSubmit(formId, async (formData) => {
      const { projectId } = formValues(formData);
      show(await api(`/api/projects/${encodeURIComponent(projectId)}${suffix}`));
    });
  }

  if (page === 'tasks') {
    bindSubmit('taskForm', async (formData) => {
      const values = formValues(formData);
      if (!values.assignee) delete values.assignee;
      if (!values.dueDate) delete values.dueDate;
      show(await api('/api/tasks', jsonRequest('POST', values)));
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
    });
    bindSubmit('taskAssignForm', async (formData) => {
      const values = formValues(formData);
      show(await api(`/api/tasks/${encodeURIComponent(values.taskId)}/assign`, jsonRequest('PATCH', { assignee: values.assignee })));
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
    bindSubmit('submissionForm', async (formData) => {
      const token = localStorage.getItem(tokenKey);
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Upload failed.');
      show(data);
    });
    bindSubmit('submissionReviewForm', async (formData) => {
      const values = formValues(formData);
      const submissionId = values.submissionId;
      delete values.submissionId;
      show(await api(`/api/submissions/${encodeURIComponent(submissionId)}/review`, jsonRequest('PATCH', values)));
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
      document.getElementById('projectChatTitle').textContent = `${selectedProjects.get(projectId)?.name || 'Project'} team chat`;
      chatStatus.textContent = 'Connecting to project chat...';
      try {
        const joined = await requestRealtime(socket, 'project:chat:join', { projectId });
        chatStatus.textContent = `Connected to ${selectedProjects.get(joined.projectId)?.name || 'project'} team chat.`;
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
    bindSubmit('notificationForm', async (formData) => {
      show(await api('/api/notifications', jsonRequest('POST', formValues(formData))));
    });
  }
})();
