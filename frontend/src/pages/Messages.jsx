import {
  Search,
  Send,
  MoreVertical,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Messages() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const rooms = useMemo(() => [
    ...workspaces.map((workspace) => ({ id: `workspace:${workspace._id}`, type: 'workspace', workspaceId: workspace._id, name: workspace.name })),
    ...projects.map((project) => ({ id: `project:${project._id}`, type: 'project', workspaceId: project.workspace?._id || project.workspace, projectId: project._id, name: project.name })),
  ], [workspaces, projects]);
  const activeRoom = rooms.find((room) => room.id === selectedRoomId) || rooms[0];

  useEffect(() => {
    Promise.all([api.get('/workspaces'), api.get('/projects')])
      .then(([workspaceResponse, projectResponse]) => {
        setWorkspaces(workspaceResponse.data || []);
        setProjects(projectResponse.data || []);
      })
      .catch((requestError) => setError(requestError.response?.data?.message || 'Messages could not be initialized.'));
  }, []);

  useEffect(() => {
    if (!activeRoom) return undefined;
    let active = true;
    const loadMessages = async () => {
      try {
        const response = await api.get('/messages', { params: activeRoom.projectId ? { projectId: activeRoom.projectId } : {} });
        const roomMessages = (response.data || []).filter((message) => {
          const messageWorkspaceId = message.workspace?._id || message.workspace;
          const messageProjectId = message.project?._id || message.project;
          return activeRoom.projectId
            ? messageProjectId === activeRoom.projectId
            : !messageProjectId && messageWorkspaceId === activeRoom.workspaceId;
        });
        if (active) setMessages(roomMessages);
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || 'Messages could not be loaded.');
      }
    };
    loadMessages();
    const intervalId = window.setInterval(loadMessages, 4000);
    return () => { active = false; window.clearInterval(intervalId); };
  }, [activeRoom]);

  const sendMessage = async (event) => {
    event.preventDefault();
    if (!activeRoom || !messageText.trim()) return;
    try {
      await api.post('/messages', {
        workspace: activeRoom.workspaceId,
        project: activeRoom.projectId,
        content: messageText.trim(),
      });
      setMessageText('');
      setError('');
      const response = await api.get('/messages', { params: activeRoom.projectId ? { projectId: activeRoom.projectId } : {} });
      setMessages((response.data || []).filter((message) => {
        const messageWorkspaceId = message.workspace?._id || message.workspace;
        const messageProjectId = message.project?._id || message.project;
        return activeRoom.projectId ? messageProjectId === activeRoom.projectId : !messageProjectId && messageWorkspaceId === activeRoom.workspaceId;
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Message could not be sent.');
    }
  };

  return (
    <div className="messages-page">

      <div className="page-header">
        <div>
          <h1>Messages</h1>
          <p>Communicate and collaborate with your team.</p>
        </div>
      </div>

      <div className="chat-container">

        {/* CONVERSATIONS */}

        <aside className="conversation-panel">

          <div className="conversation-header">
            <h3>Channels</h3>
            <button>
              <MoreVertical size={18} />
            </button>
          </div>

          <div className="chat-search">
            <Search size={16} />
            <input placeholder="Search channels..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>

          <div className="conversation-list">

            {rooms.filter((room) => room.name.toLowerCase().includes(search.toLowerCase())).map((room) => (

              <button className={`conversation-item ${room.id === selectedRoomId ? 'active-conversation' : ''}`} key={room.id} onClick={() => setSelectedRoomId(room.id)}>

                <div className="chat-avatar">
                  {room.name.charAt(0).toUpperCase()}
                </div>

                <div className="conversation-content">

                  <div className="conversation-top">
                    <strong>{room.name}</strong>
                    <small>{room.type}</small>
                  </div>

                  <div className="conversation-bottom">
                    <span>{room.id === selectedRoomId ? messages.at(-1)?.content || 'No messages yet' : 'Open channel'}</span>
                  </div>

                </div>

              </button>

            ))}

          </div>

        </aside>

        {/* CHAT AREA */}

        <section className="chat-area">

          <div className="chat-header">

            <div className="chat-user">

              <div className="chat-avatar large">
                {activeRoom?.name?.charAt(0).toUpperCase() || '?'}
              </div>

              <div>
                <strong>{activeRoom?.name || 'Select a channel'}</strong>
                <span>{activeRoom?.type || 'No workspace access'}</span>
              </div>

            </div>

            <div className="chat-actions">
              <button>
                <MoreVertical size={19} />
              </button>
            </div>

          </div>

          <div className="message-list">

            <div className="chat-date">
              Today
            </div>

            {error && <p className="auth-error" role="alert">{error}</p>}
            {messages.length === 0 && <p className="empty-state">No messages in this channel yet.</p>}
            {messages.map((message) => (

              <div
                key={message._id}
                className={`message ${(message.sender?._id || message.sender) === user?._id ? 'my-message' : ''}`}
              >

                {(message.sender?._id || message.sender) !== user?._id && (
                  <div className="message-avatar">
                    {message.sender?.fullName?.charAt(0) || '?'}
                  </div>
                )}

                <div className="message-content">

                  <div className="message-bubble">
                    {message.content}
                  </div>

                  <small>{message.sender?.fullName || 'Member'} · {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>

                </div>

              </div>

            ))}

          </div>

          <form className="message-input-area" onSubmit={sendMessage}>
            <input
              placeholder="Type a message..."
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              disabled={!activeRoom}
            />
            <button className="send-button" type="submit" disabled={!activeRoom || !messageText.trim()} aria-label="Send message">
              <Send size={18} />
            </button>
          </form>

        </section>

      </div>

    </div>
  );
}

export default Messages;