import {
  Plus,
  Video,
  CalendarDays,
  Clock3,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Meetings() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const loadMeetings = async () => {
    try {
      const response = await api.get('/meetings');
      setMeetings(response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Meetings could not be loaded.');
    }
  };

  useEffect(() => {
    const requests = [api.get('/meetings'), api.get('/workspaces'), api.get('/projects')];
    if (['admin', 'project_manager'].includes(user?.role)) requests.push(api.get('/users'));
    Promise.all(requests)
      .then(([meetingResponse, workspaceResponse, projectResponse, userResponse]) => {
        setMeetings(meetingResponse.data || []);
        setWorkspaces(workspaceResponse.data || []);
        setProjects(projectResponse.data || []);
        setMembers(userResponse?.data || []);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Meeting data could not be loaded.'));
  }, [user?.role]);

  const scheduleMeeting = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const project = projects.find((item) => item._id === formData.get('project'));
    const workspace = project?.workspace?._id || project?.workspace || formData.get('workspace');
    try {
      await api.post('/meetings', {
        title: formData.get('title'),
        workspace,
        project: project?._id || undefined,
        attendees: formData.getAll('attendees'),
        scheduledAt: new Date(formData.get('scheduledAt')).toISOString(),
        durationMinutes: Number(formData.get('durationMinutes')),
        agenda: formData.get('agenda'),
      });
      setShowForm(false);
      setSelectedProject('');
      await loadMeetings();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Meeting could not be scheduled.');
    }
  };

  const now = new Date();
  const upcomingMeetings = meetings.filter((meeting) => new Date(meeting.scheduledAt) >= now && meeting.status !== 'cancelled');
  const pastMeetings = meetings.filter((meeting) => new Date(meeting.scheduledAt) < now || meeting.status === 'completed');
  const minutesToday = upcomingMeetings.filter((meeting) => new Date(meeting.scheduledAt).toDateString() === now.toDateString()).reduce((sum, meeting) => sum + (meeting.durationMinutes || 0), 0);
  const totalParticipants = new Set(upcomingMeetings.flatMap((meeting) => (meeting.attendees || []).map((attendee) => attendee._id || attendee))).size;

  return (
    <div>

      {/* HEADER */}

      <div className="page-header">
        <div>
          <h1>Meetings</h1>
          <p>Schedule and manage your team's meetings.</p>
        </div>

        {['admin', 'project_manager'].includes(user?.role) && <button className="primary-button" onClick={() => setShowForm((visible) => !visible)}>
          <Plus size={17} />
          Schedule Meeting
        </button>}
      </div>

      {error && <p className="auth-error" role="alert">{error}</p>}
      {showForm && <form className="entity-form" onSubmit={scheduleMeeting}>
        <h3>Schedule a meeting</h3>
        <label>Title<input name="title" required /></label>
        <label>Project (optional)<select name="project" value={selectedProject} onChange={(event) => setSelectedProject(event.target.value)}><option value="">Workspace meeting</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select></label>
        {!selectedProject && <label>Workspace<select name="workspace" required defaultValue=""><option value="" disabled>Select workspace</option>{workspaces.map((workspace) => <option key={workspace._id} value={workspace._id}>{workspace.name}</option>)}</select></label>}
        <label>Date and time<input name="scheduledAt" type="datetime-local" required min={new Date().toISOString().slice(0, 16)} /></label>
        <label>Duration in minutes<input name="durationMinutes" type="number" min="15" max="480" defaultValue="60" /></label>
        <label>Attendees<select name="attendees" multiple size="4">{members.filter((member) => member._id !== user?._id).map((member) => <option key={member._id} value={member._id}>{member.fullName}</option>)}</select></label>
        <label>Agenda<textarea name="agenda" rows="3" /></label>
        <button className="primary-button" type="submit">Save meeting</button>
      </form>}

      {/* SUMMARY */}

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

      {/* UPCOMING */}

      <section className="meetings-section">

        <div className="section-heading">
          <div>
            <h2>Upcoming Meetings</h2>
            <p>Your scheduled team meetings</p>
          </div>
        </div>

        <div className="upcoming-meetings">

          {upcomingMeetings.map((meeting) => (

            <div className="meeting-card" key={meeting.title}>

              <div className="meeting-date">
                <CalendarDays size={18} />
                <strong>{new Date(meeting.scheduledAt).toLocaleDateString()}</strong>
              </div>

              <div className="meeting-main">

                <div className="meeting-icon">
                  <Video size={20} />
                </div>

                <div>
                  <h3>{meeting.title}</h3>
                  <p>{meeting.project?.name || meeting.workspace?.name || 'Workspace meeting'}</p>

                  <div className="meeting-details">

                    <span>
                      <Clock3 size={13} />
                      {new Date(meeting.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {meeting.durationMinutes} min
                    </span>

                    <span>
                      <Users size={13} />
                      {(meeting.attendees || []).length} Participants
                    </span>

                    <span className="meeting-type">
                      {meeting.meetingType || 'video'}
                    </span>

                  </div>
                </div>

              </div>

              <div className="meeting-right">

                <span
                  className={`meeting-status ${meeting.status === 'live' ? 'starting' : ''}`}
                >
                  {meeting.status}
                </span>

              </div>

            </div>

          ))}

        </div>

      </section>

      {/* PAST MEETINGS */}

      <section className="meetings-section">

        <div className="section-heading">
          <div>
            <h2>Recent Meetings</h2>
            <p>Previously completed meetings</p>
          </div>

        </div>

        <div className="past-meetings">

          {pastMeetings.map((meeting) => (

            <div className="past-meeting-row" key={meeting.title}>

              <div className="past-meeting-icon">
                <Video size={17} />
              </div>

              <div className="past-meeting-name">
                <strong>{meeting.title}</strong>
                <span>{meeting.project?.name || meeting.workspace?.name || 'Workspace meeting'}</span>
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

    </div>
  );
}

export default Meetings;