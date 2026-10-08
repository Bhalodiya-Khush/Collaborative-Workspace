import {
  Plus,
  Video,
  CalendarDays,
  Clock3,
  Users,
  FolderKanban,
  Building2,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  Share2,
  Radio,
  CheckCircle2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { useWorkspace } from '../context/useWorkspace';
import api from '../services/api';

function Meetings() {
  const { user } = useAuth();
  const { selectedWorkspaceId, workspaceRole } = useWorkspace();
  const [meetings, setMeetings] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [scopeFilter, setScopeFilter] = useState('all'); // 'all' | 'workspace' | 'project'
  const [meetingScope, setMeetingScope] = useState('workspace'); // form state
  const [selectedProject, setSelectedProject] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activeMeetingRoom, setActiveMeetingRoom] = useState(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadMeetings = async () => {
    try {
      const response = await api.get('/meetings');
      setMeetings(selectedWorkspaceId
        ? (response.data || []).filter((meeting) => String(meeting.workspace?._id || meeting.workspace) === selectedWorkspaceId)
        : response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Meetings could not be loaded.');
    }
  };

  useEffect(() => {
    const requests = [api.get('/meetings'), api.get('/workspaces'), api.get('/projects')];
    if (['admin', 'project_manager'].includes(workspaceRole) && selectedWorkspaceId) {
      requests.push(api.get('/users', { params: { workspaceId: selectedWorkspaceId } }));
    }
    Promise.all(requests)
      .then(([meetingResponse, workspaceResponse, projectResponse, userResponse]) => {
        setMeetings(selectedWorkspaceId
          ? (meetingResponse.data || []).filter((meeting) => String(meeting.workspace?._id || meeting.workspace) === selectedWorkspaceId)
          : meetingResponse.data || []);
        setWorkspaces(workspaceResponse.data || []);
        const accessibleProjects = projectResponse.data || [];
        setProjects(selectedWorkspaceId
          ? accessibleProjects.filter((project) => String(project.workspace?._id || project.workspace) === selectedWorkspaceId)
          : accessibleProjects);
        setMembers(userResponse?.data || []);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Meeting data could not be loaded.'));
  }, [selectedWorkspaceId, workspaceRole]);

  const scheduleMeeting = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    const formData = new FormData(event.currentTarget);

    let workspaceId = selectedWorkspaceId;
    let projectId = undefined;

    if (meetingScope === 'project') {
      const proj = projects.find((item) => item._id === selectedProject);
      if (!proj) {
        setError('Please select a project for project meeting.');
        return;
      }
      projectId = proj._id;
      workspaceId = proj.workspace?._id || proj.workspace;
    }

    if (!workspaceId) {
      setError('Please select a workspace for the meeting.');
      return;
    }

    try {
      await api.post('/meetings', {
        title: formData.get('title'),
        workspace: workspaceId,
        project: projectId,
        attendees: formData.getAll('attendees'),
        scheduledAt: new Date(formData.get('scheduledAt')).toISOString(),
        durationMinutes: Number(formData.get('durationMinutes')),
        agenda: formData.get('agenda'),
      });
      setShowForm(false);
      setSelectedProject('');
      setSuccess('Meeting scheduled successfully! Invitations have been sent.');
      await loadMeetings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Meeting could not be scheduled.');
    }
  };

  const endMeeting = async (meetingId) => {
    try {
      await api.patch(`/meetings/${meetingId}/end`);
      setActiveMeetingRoom(null);
      setSuccess('Meeting concluded successfully.');
      await loadMeetings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Failed to end meeting.');
    }
  };

  const now = new Date();
  const filteredMeetings = meetings.filter((meeting) => {
    if (scopeFilter === 'workspace') return !meeting.project;
    if (scopeFilter === 'project') return !!meeting.project;
    return true;
  });

  const upcomingMeetings = filteredMeetings.filter(
    (meeting) => new Date(meeting.scheduledAt) >= now && meeting.status !== 'cancelled'
  );
  const pastMeetings = filteredMeetings.filter(
    (meeting) => new Date(meeting.scheduledAt) < now || meeting.status === 'completed'
  );
  const minutesToday = upcomingMeetings
    .filter((meeting) => new Date(meeting.scheduledAt).toDateString() === now.toDateString())
    .reduce((sum, meeting) => sum + (meeting.durationMinutes || 0), 0);
  const totalParticipants = new Set(
    upcomingMeetings.flatMap((meeting) => (meeting.attendees || []).map((attendee) => attendee._id || attendee))
  ).size;

  return (
    <div className="meetings-page">
      {/* HEADER */}
      <div className="page-header">
        <div>
          <h1>Meetings & Discussions</h1>
          <p>
            Connect via Workspace-wide all-hands or focused project syncs.
          </p>
        </div>

        <button className="primary-button" onClick={() => setShowForm((visible) => !visible)}>
          <Plus size={17} /> Schedule Meeting
        </button>
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {success && <p className="auth-success" role="status" style={{ background: '#e2f3eb', color: '#183d35', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid #c2e2d5', display: 'flex', alignItems: 'center', gap: '8px' }}><CheckCircle2 size={18} color="#183d35" />{success}</p>}

      {/* SCHEDULE FORM */}
      {showForm && (
        <form className="entity-form" onSubmit={scheduleMeeting}>
          <h3>Schedule a Meeting</h3>
          <p style={{ fontSize: '13px', color: '#5f6e67', marginBottom: '14px' }}>
            Choose whether this is open to the entire workspace or specific to a single project team.
          </p>

          <label>Meeting Title
            <input name="title" placeholder="e.g. Sprint Planning, Workspace All-Hands" required />
          </label>

          <div style={{ margin: '14px 0', padding: '12px', background: '#fbfaf6', border: '1px solid #d7dfd6', borderRadius: '8px' }}>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: '#183d35' }}>Meeting Scope</span>
            <div style={{ display: 'flex', gap: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                <input
                  type="radio"
                  name="scope"
                  checked={meetingScope === 'workspace'}
                  onChange={() => setMeetingScope('workspace')}
                />
                <strong>Workspace Meeting</strong> (All members of workspace can join)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', margin: 0, fontWeight: 'normal' }}>
                <input
                  type="radio"
                  name="scope"
                  checked={meetingScope === 'project'}
                  onChange={() => setMeetingScope('project')}
                />
                <strong>Project Meeting</strong> (Only project team members)
              </label>
            </div>
          </div>

          {meetingScope === 'workspace' ? (
            <label>Workspace
              <select
                name="workspace"
                required
                value={selectedWorkspaceId}
                disabled
              >
                <option value="" disabled>Select Workspace</option>
                {workspaces.filter((ws) => ws._id === selectedWorkspaceId).map((ws) => (
                  <option key={ws._id} value={ws._id}>{ws.name}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>Project
              <select
                name="project"
                required
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
              >
                <option value="" disabled>Select Project</option>
                {projects.map((proj) => (
                  <option key={proj._id} value={proj._id}>{proj.name} ({proj.workspace?.name || 'Workspace'})</option>
                ))}
              </select>
            </label>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <label>Date and Time
              <input name="scheduledAt" type="datetime-local" required min={new Date().toISOString().slice(0, 16)} />
            </label>
            <label>Duration (minutes)
              <input name="durationMinutes" type="number" min="15" max="480" defaultValue="60" />
            </label>
          </div>

          {meetingScope === 'project' && members.length > 0 && (
            <label>Specific Attendees (optional)
              <select name="attendees" multiple size="3">
                {members.filter((m) => m._id !== user?._id).map((m) => (
                  <option key={m._id} value={m._id}>{m.fullName} ({m.role?.replace('_', ' ')})</option>
                ))}
              </select>
            </label>
          )}

          <label>Agenda & Discussion Topics
            <textarea name="agenda" placeholder="Topics to cover during this meeting..." rows="3" />
          </label>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button className="primary-button" type="submit">Schedule Meeting</button>
            <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* METRICS SUMMARY */}
      <div className="meeting-summary">
        <div className="meeting-summary-card">
          <CalendarDays size={20} />
          <div>
            <strong>{upcomingMeetings.length}</strong>
            <span>Upcoming Meetings</span>
          </div>
        </div>

        <div className="meeting-summary-card">
          <Clock3 size={20} />
          <div>
            <strong>{(minutesToday / 60).toFixed(1)}h</strong>
            <span>Meeting Time Today</span>
          </div>
        </div>

        <div className="meeting-summary-card">
          <Users size={20} />
          <div>
            <strong>{totalParticipants}</strong>
            <span>Total Participants</span>
          </div>
        </div>
      </div>

      {/* FILTER TABS */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '22px' }}>
        <button
          className={scopeFilter === 'all' ? 'primary-button' : 'secondary-button'}
          onClick={() => setScopeFilter('all')}
          style={{ padding: '8px 16px', fontSize: '13px' }}
        >
          All Meetings ({meetings.length})
        </button>
        <button
          className={scopeFilter === 'workspace' ? 'primary-button' : 'secondary-button'}
          onClick={() => setScopeFilter('workspace')}
          style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Building2 size={15} /> Workspace Meetings ({meetings.filter((m) => !m.project).length})
        </button>
        <button
          className={scopeFilter === 'project' ? 'primary-button' : 'secondary-button'}
          onClick={() => setScopeFilter('project')}
          style={{ padding: '8px 16px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <FolderKanban size={15} /> Project Syncs ({meetings.filter((m) => !!m.project).length})
        </button>
      </div>

      {/* UPCOMING MEETINGS */}
      <section className="meetings-section">
        <div className="section-heading">
          <div>
            <h2>Upcoming & Active Meetings</h2>
            <p>
              {scopeFilter === 'workspace'
                ? 'Showing workspace-wide all-hands meetings (all workspace members can attend)'
                : scopeFilter === 'project'
                ? 'Showing project-specific team meetings'
                : 'All scheduled sessions'}
            </p>
          </div>
        </div>

        {upcomingMeetings.length === 0 ? (
          <div className="empty-state">
            <Video size={28} />
            <p>No upcoming meetings in this view.</p>
          </div>
        ) : (
          <div className="upcoming-meetings">
            {upcomingMeetings.map((meeting) => {
              const isWorkspaceWide = !meeting.project;

              return (
                <div className="meeting-card" key={meeting._id || meeting.title}>
                  <div className="meeting-date">
                    <CalendarDays size={18} />
                    <strong>{new Date(meeting.scheduledAt).toLocaleDateString()}</strong>
                  </div>

                  <div className="meeting-main">
                    <div className="meeting-icon" style={{ background: isWorkspaceWide ? '#faede6' : '#edf1eb', color: isWorkspaceWide ? '#d9764e' : '#183d35' }}>
                      <Video size={20} />
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h3 style={{ margin: 0 }}>{meeting.title}</h3>
                        {isWorkspaceWide ? (
                          <span style={{ fontSize: '11px', background: '#faede6', color: '#d9764e', padding: '2px 8px', borderRadius: '12px', fontWeight: '700', border: '1px solid #f6b27e', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Building2 size={12} /> Workspace All-Hands
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', background: '#edf1eb', color: '#183d35', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', border: '1px solid #d7dfd6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <FolderKanban size={12} /> Project: {meeting.project?.name}
                          </span>
                        )}
                      </div>

                      <p style={{ margin: '4px 0 8px', fontSize: '13px', color: '#5f6e67' }}>
                        {isWorkspaceWide
                          ? `Workspace: ${meeting.workspace?.name || 'Workspace'} · Open to all members`
                          : `Project: ${meeting.project?.name || 'Project'} · Dedicated to project team`}
                      </p>

                      {meeting.agenda && (
                        <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#202a26', background: '#fbfaf6', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e5ece4' }}>
                          <strong>Agenda:</strong> {meeting.agenda}
                        </p>
                      )}

                      <div className="meeting-details">
                        <span>
                          <Clock3 size={13} />
                          {new Date(meeting.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {meeting.durationMinutes} min
                        </span>
                        <span>
                          <Users size={13} />
                          {(meeting.attendees || []).length} Attendees
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="meeting-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                    <span className={`meeting-status ${meeting.status === 'live' ? 'starting' : ''}`}>
                      {meeting.status === 'live' ? <><Radio size={12} /> LIVE</> : meeting.status}
                    </span>

                    <button
                      className="primary-button"
                      onClick={() => setActiveMeetingRoom(meeting)}
                      style={{ fontSize: '12px', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Video size={14} /> Join Meeting Room
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* PAST MEETINGS */}
      <section className="meetings-section">
        <div className="section-heading">
          <div>
            <h2>Recent Completed Meetings</h2>
            <p>Archive of past discussions and minutes</p>
          </div>
        </div>

        <div className="past-meetings">
          {pastMeetings.map((meeting) => (
            <div className="past-meeting-row" key={meeting._id || meeting.title}>
              <div className="past-meeting-icon">
                <Video size={17} />
              </div>

              <div className="past-meeting-name">
                <strong>{meeting.title}</strong>
                <span>
                  {!meeting.project ? `🌐 Workspace: ${meeting.workspace?.name || 'Workspace'}` : `📁 Project: ${meeting.project?.name}`}
                </span>
              </div>

              <span>{new Date(meeting.scheduledAt).toLocaleDateString()}</span>
              <span>{meeting.durationMinutes} min</span>
              <span>
                <Users size={13} />
                {(meeting.attendees || []).length}
              </span>
              <span className="meeting-status">{meeting.status}</span>
            </div>
          ))}
        </div>
      </section>

      {/* LIVE INTERACTIVE MEETING ROOM MODAL */}
      {activeMeetingRoom && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(24, 61, 53, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
          }}
        >
          <div
            style={{
              width: 'min(900px, 95vw)',
              background: '#183d35',
              color: '#ffffff',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#d9764e', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700' }}>
                    <Radio size={12} /> LIVE SESSION
                  </span>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{activeMeetingRoom.title}</h3>
                </div>
                <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#c5d4ce' }}>
                  {!activeMeetingRoom.project
                    ? `Workspace All-Hands (${activeMeetingRoom.workspace?.name || 'Workspace'})`
                    : `Project Sync (${activeMeetingRoom.project?.name})`}
                </p>
              </div>

              <button
                onClick={() => setActiveMeetingRoom(null)}
                style={{ background: 'transparent', border: 'none', color: '#ffffff', cursor: 'pointer' }}
                aria-label="Close room modal"
              >
                <X size={22} />
              </button>
            </div>

            {/* Video Stage / Avatar Grid */}
            <div style={{ padding: '24px', background: '#112924', minHeight: '340px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
              {/* Current User Tile */}
              <div style={{ background: '#183d35', border: '2px solid #d9764e', borderRadius: '10px', height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                {isVideoOn ? (
                  <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#d9764e', color: 'white', display: 'grid', placeItems: 'center', fontSize: '28px', fontWeight: 'bold' }}>
                    {user?.fullName?.charAt(0) || 'U'}
                  </div>
                ) : (
                  <div style={{ color: '#84968e', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <VideoOff size={32} />
                    <span style={{ fontSize: '12px' }}>Camera is off</span>
                  </div>
                )}
                <div style={{ position: 'absolute', bottom: '10px', left: '12px', right: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
                  <span>{user?.fullName} (You)</span>
                  {isMicOn ? <Mic size={14} color="#86efac" /> : <MicOff size={14} color="#f87171" />}
                </div>
              </div>

              {/* Other Attendees Tiles */}
              {(activeMeetingRoom.attendees || []).filter((a) => (a._id || a) !== user?._id).slice(0, 3).map((attendee, index) => {
                const name = attendee.fullName || `Participant ${index + 1}`;
                return (
                  <div key={attendee._id || index} style={{ background: '#183d35', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#24574c', color: '#fbfaf6', display: 'grid', placeItems: 'center', fontSize: '28px', fontWeight: 'bold' }}>
                      {name.charAt(0)}
                    </div>
                    <div style={{ position: 'absolute', bottom: '10px', left: '12px', right: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: '4px' }}>
                      <span>{name}</span>
                      <Mic size={14} color="#86efac" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* In-Call Controls Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: '#183d35', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setIsMicOn(!isMicOn)}
                  style={{ background: isMicOn ? '#24574c' : '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '42px', height: '42px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                  title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
                >
                  {isMicOn ? <Mic size={18} /> : <MicOff size={18} />}
                </button>

                <button
                  onClick={() => setIsVideoOn(!isVideoOn)}
                  style={{ background: isVideoOn ? '#24574c' : '#ef4444', color: 'white', border: 'none', borderRadius: '50%', width: '42px', height: '42px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                  title={isVideoOn ? 'Turn Video Off' : 'Turn Video On'}
                >
                  {isVideoOn ? <Video size={18} /> : <VideoOff size={18} />}
                </button>

                <button
                  onClick={() => setIsSharing(!isSharing)}
                  style={{ background: isSharing ? '#d9764e' : '#24574c', color: 'white', border: 'none', borderRadius: '50%', width: '42px', height: '42px', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
                  title={isSharing ? 'Stop Screen Sharing' : 'Share Screen'}
                >
                  <Share2 size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {['admin', 'project_manager'].includes(workspaceRole) && (
                  <button
                    onClick={() => endMeeting(activeMeetingRoom._id)}
                    style={{ background: '#991b1b', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    End Meeting for All
                  </button>
                )}
                <button
                  onClick={() => setActiveMeetingRoom(null)}
                  style={{ background: '#ef4444', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <PhoneOff size={16} /> Leave Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Meetings;