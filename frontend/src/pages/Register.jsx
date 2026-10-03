import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import api from '../services/api';

function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/users/register', { fullName, email, password });
      await login(email, password);
      navigate('/dashboard');
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
        'Registration failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell register-shell">
        <section className="auth-brand-panel register-brand-panel">
          <div className="auth-logo">
            <span>CW</span>
          </div>

          <span className="auth-kicker">JOIN THE WORKSPACE</span>
          <h1>Start building<br />with your team.</h1>
          <p>
            Create your developer account and get access to your projects,
            tasks, submissions, meetings and team communication.
          </p>

          <div className="register-benefits">
            <div><CheckCircle2 size={18} /> Assigned projects and tasks</div>
            <div><CheckCircle2 size={18} /> Submit work for review</div>
            <div><CheckCircle2 size={18} /> Collaborate with your team</div>
            <div><CheckCircle2 size={18} /> Secure role-based access</div>
          </div>

          <div className="auth-brand-footer">
            Your account starts with the Developer role.
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-container">
            <div className="auth-mobile-logo">
              <span>CW</span>
              <strong>Collaborative Workspace</strong>
            </div>

            <span className="auth-form-kicker">CREATE ACCOUNT</span>
            <h2>Join your development team</h2>
            <p className="auth-subtitle">
              Create your account in less than a minute.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-input-group">
                <label htmlFor="register-name">Full name</label>
                <div className="auth-input-wrap">
                  <UserRound size={18} />
                  <input
                    id="register-name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your full name"
                    autoComplete="name"
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label htmlFor="register-email">Email address</label>
                <div className="auth-input-wrap">
                  <Mail size={18} />
                  <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div className="auth-input-group">
                <label htmlFor="register-password">Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole size={18} />
                  <input
                    id="register-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    minLength={6}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((value) => !value)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <button className="auth-submit" type="submit" disabled={loading}>
                {loading ? 'Creating account...' : 'Create developer account'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <p className="auth-login-link">
              Already have an account? <Link to="/login">Sign in</Link>
            </p>

            <div className="role-info-card">
              <BriefcaseBusiness size={18} />
              <div>
                <strong>Role assignment</strong>
                <span>New public registrations are Developers. Admins can assign Project Manager or Admin roles from User Management.</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Register;
