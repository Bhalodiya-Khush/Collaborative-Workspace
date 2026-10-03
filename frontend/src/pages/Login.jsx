import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, BriefcaseBusiness, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../context/useAuth';

function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (requestError) {
      setError(
        requestError.response?.data?.message ||
        'Unable to sign in. Check your credentials and try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <section className="auth-brand-panel">
          <div className="auth-logo">
            <span>CW</span>
          </div>

          <span className="auth-kicker">COLLABORATIVE WORKSPACE</span>
          <h1>Build together.<br />Ship better.</h1>
          <p>
            One secure workspace for project managers and developers to plan,
            build, review and deliver software together.
          </p>

          <div className="auth-role-list">
            <div>
              <ShieldCheck size={18} />
              <span><strong>Admin</strong> — organization control</span>
            </div>
            <div>
              <BriefcaseBusiness size={18} />
              <span><strong>Project Manager</strong> — team & projects</span>
            </div>
            <div>
              <Users size={18} />
              <span><strong>Developer</strong> — tasks & delivery</span>
            </div>
          </div>

          <div className="auth-brand-footer">
            Secure role-based access · Team collaboration · Project tracking
          </div>
        </section>

        <section className="auth-form-panel">
          <div className="auth-form-container">
            <div className="auth-mobile-logo">
              <span>CW</span>
              <strong>Collaborative Workspace</strong>
            </div>

            <span className="auth-form-kicker">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p className="auth-subtitle">
              Enter your account details to continue.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="auth-input-group">
                <label htmlFor="login-email">Email address</label>
                <div className="auth-input-wrap">
                  <Mail size={18} />
                  <input
                    id="login-email"
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
                <label htmlFor="login-password">Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole size={18} />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
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
                {loading ? 'Signing in...' : 'Sign in'}
                {!loading && <ArrowRight size={18} />}
              </button>
            </form>

            <div className="auth-divider"><span>New to the workspace?</span></div>

            <button
              type="button"
              className="auth-register-button"
              onClick={() => navigate('/register')}
            >
              Create a developer account
            </button>

            <p className="auth-security-note">
              Project Manager and Admin roles are assigned by an administrator.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Login;
