import { useState, useEffect } from 'react';
import {
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Save,
  Tag,
  Calendar,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Profile() {
  const { user } = useAuth();

  const [profileData, setProfileData] = useState({
    fullName: '',
    email: '',
    skills: '',
    role: '',
    createdAt: '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [profileLoading, setProfileLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState({ type: '', text: '' });
  const [passwordMessage, setPasswordMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await api.get('/users/me');
        const currentUser = response.data.user || user;
        if (currentUser) {
          setProfileData({
            fullName: currentUser.fullName || '',
            email: currentUser.email || '',
            skills: Array.isArray(currentUser.skills) ? currentUser.skills.join(', ') : '',
            role: currentUser.role || 'developer',
            createdAt: currentUser.createdAt || '',
          });
        }
      } catch {
        if (user) {
          setProfileData({
            fullName: user.fullName || '',
            email: user.email || '',
            skills: Array.isArray(user.skills) ? user.skills.join(', ') : '',
            role: user.role || 'developer',
            createdAt: user.createdAt || '',
          });
        }
      }
    };

    fetchProfile();
  }, [user]);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage({ type: '', text: '' });

    try {
      const skillsArray = profileData.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const response = await api.patch('/users/me', {
        fullName: profileData.fullName,
        email: profileData.email,
        skills: skillsArray,
      });

      setProfileMessage({
        type: 'success',
        text: response.data.message || 'Profile updated successfully.',
      });
    } catch (err) {
      setProfileMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update profile.',
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMessage({ type: '', text: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordMessage({
        type: 'error',
        text: 'New passwords do not match.',
      });
      return;
    }

    if (passwordData.newPassword.length < 8) {
      setPasswordMessage({
        type: 'error',
        text: 'New password must be at least 8 characters long.',
      });
      return;
    }

    setPasswordLoading(true);

    try {
      const response = await api.patch('/users/me/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });

      setPasswordMessage({
        type: 'success',
        text: response.data.message || 'Password changed successfully.',
      });

      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
    } catch (err) {
      setPasswordMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to change password.',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="profile-page">
      <div className="page-header">
        <div>
          <h1>Profile &amp; Settings</h1>
          <p>Manage your account information, skills, and security credentials.</p>
        </div>
      </div>

      <div className="dashboard-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '1.5rem', marginTop: '1.5rem' }}>
        {/* Profile Card */}
        <div className="dashboard-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary, #3b82f6), #1d4ed8)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
              }}
            >
              {profileData.fullName ? profileData.fullName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 600 }}>{profileData.fullName || 'User Profile'}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.35rem' }}>
                <span
                  className="meeting-status starting"
                  style={{ textTransform: 'capitalize', fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
                >
                  <Shield size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {profileData.role?.replace('_', ' ') || 'Member'}
                </span>
                {profileData.createdAt && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94a3b8)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} />
                    Joined {new Date(profileData.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>

          {profileMessage.text && (
            <div
              className={profileMessage.type === 'success' ? 'submission-status approved' : 'auth-error'}
              style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {profileMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{profileMessage.text}</span>
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="entity-form" style={{ margin: 0, padding: 0, background: 'transparent' }}>
            <label>
              Full Name
              <input
                type="text"
                value={profileData.fullName}
                onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                required
                maxLength={80}
              />
            </label>

            <label>
              Email Address
              <input
                type="email"
                value={profileData.email}
                onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                required
              />
            </label>

            <label>
              Skills (comma-separated)
              <input
                type="text"
                placeholder="React, Node.js, TypeScript, Python"
                value={profileData.skills}
                onChange={(e) => setProfileData({ ...profileData, skills: e.target.value })}
              />
            </label>

            {profileData.skills && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                {profileData.skills
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((skill, index) => (
                    <span
                      key={index}
                      style={{
                        fontSize: '0.75rem',
                        padding: '0.25rem 0.6rem',
                        borderRadius: '6px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        color: 'var(--primary, #3b82f6)',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <Tag size={11} />
                      {skill}
                    </span>
                  ))}
              </div>
            )}

            <button type="submit" className="primary-button" disabled={profileLoading} style={{ marginTop: '0.5rem' }}>
              <Save size={16} />
              {profileLoading ? 'Saving...' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Change Password Card */}
        <div className="dashboard-card" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div className="user-summary-icon" style={{ width: '42px', height: '42px' }}>
              <KeyRound size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Security &amp; Password</h2>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted, #94a3b8)' }}>Ensure your account stays secure</p>
            </div>
          </div>

          {passwordMessage.text && (
            <div
              className={passwordMessage.type === 'success' ? 'submission-status approved' : 'auth-error'}
              style={{ padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {passwordMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{passwordMessage.text}</span>
            </div>
          )}

          <form onSubmit={handlePasswordSubmit} className="entity-form" style={{ margin: 0, padding: 0, background: 'transparent' }}>
            <label>
              Current Password
              <input
                type="password"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                required
                autoComplete="current-password"
              />
            </label>

            <label>
              New Password
              <input
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <label>
              Confirm New Password
              <input
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>

            <button type="submit" className="primary-button" disabled={passwordLoading} style={{ marginTop: '0.5rem' }}>
              <KeyRound size={16} />
              {passwordLoading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;
