import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  CalendarDays,
  Check,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../services/api';

function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [error, setError] = useState('');

  const loadNotifications = async () => {
    try {
      const response = await api.get('/notifications');
      setNotifications(response.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Notifications could not be loaded.');
    }
  };

  useEffect(() => {
    api.get('/notifications')
      .then((response) => setNotifications(response.data || []))
      .catch((requestError) => setError(requestError.response?.data?.message || 'Notifications could not be loaded.'));
  }, []);

  const unreadCount = notifications.filter((notification) => !notification.isRead).length;
  const markRead = async (notificationId) => {
    await api.patch(`/notifications/${notificationId}/read`).catch((requestError) => setError(requestError.response?.data?.message || 'Notification could not be updated.'));
    await loadNotifications();
  };
  const markAllRead = async () => {
    await api.patch('/notifications/read-all').catch((requestError) => setError(requestError.response?.data?.message || 'Notifications could not be updated.'));
    await loadNotifications();
  };

  return (
    <div>

      <div className="page-header">

        <div>
          <h1>Notifications</h1>
          <p>Stay updated with your workspace activity.</p>
        </div>

        <button className="mark-all-button" onClick={markAllRead} disabled={!unreadCount}>
          <Check size={15} />
          Mark all as read
        </button>

      </div>

      <div className="notification-summary">

        <div>
            <strong>{notifications.length}</strong>
          <span>Total Notifications</span>
        </div>

        <div>
            <strong>{unreadCount}</strong>
          <span>Unread</span>
        </div>

        <div>
            <strong>{notifications.length - unreadCount}</strong>
          <span>Read</span>
        </div>

      </div>

      <div className="notifications-card">

        <div className="notification-card-header">
          <div>
            <h3>Recent Notifications</h3>
            <p>Your latest workspace updates</p>
          </div>

          <Bell size={20} />
        </div>

        {error && <p className="auth-error" role="alert">{error}</p>}
        {notifications.length === 0 ? <div className="empty-state"><Bell size={28} /><p>No notifications yet.</p></div> : notifications.map((notification) => {

          const Icon = notification.type === 'task'
            ? CheckCircle2
            : notification.type === 'meeting'
              ? CalendarDays
              : notification.type === 'project'
                ? AlertTriangle
                : notification.type === 'workspace'
                  ? MessageSquare
                  : Bell;

          return (
            <div
              className={`notification-item ${notification.isRead ? 'read' : 'unread'}`}
              key={notification._id}
            >

              <div className={`notification-icon ${notification.type}`}>
                <Icon size={18} />
              </div>

              <div className="notification-content">

                <strong>{notification.title}</strong>

                <p>{notification.message}</p>

                <small>{new Date(notification.createdAt).toLocaleString()}</small>

              </div>

              {!notification.isRead && <button className="notification-more" title="Mark as read" aria-label="Mark as read" onClick={() => markRead(notification._id)}><Check size={16} /></button>}

            </div>
          );
        })}

      </div>

    </div>
  );
}

export default Notifications;