import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { HiUserPlus, HiUser, HiEnvelope, HiLockClosed, HiCheckCircle } from 'react-icons/hi2';
import toast from 'react-hot-toast';

function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const { register } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    if (password.length < 3) {
      toast.error('Password must be at least 3 characters');
      return;
    }
    setLoading(true);
    try {
      await register(username.trim(), email.trim(), password);
      setRegistered(true);
    } catch (err) {
      const msg = err.response?.data?.error || 'Registration failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (registered) {
    return (
      <div className="auth-page">
        <div className="auth-card auth-success-card">
          <div className="auth-success-icon">
            <HiCheckCircle size={64} />
          </div>
          <h1 className="auth-title">Check your inbox!</h1>
          <p className="auth-subtitle">
            We sent an activation link to <strong>{email}</strong>.
            <br />
            Click the link in the email to activate your account, then come back to login.
          </p>
          <Link to="/login" className="btn btn-primary auth-submit" style={{ marginTop: '1.5rem' }}>
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🐹</div>
        <h1 className="auth-title">Join GoFeed</h1>
        <p className="auth-subtitle">Create your account and start sharing</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="reg-username">
              <HiUser size={15} /> Username
            </label>
            <input
              id="reg-username"
              type="text"
              placeholder="your_username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={100}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">
              <HiEnvelope size={15} /> Email
            </label>
            <input
              id="reg-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">
              <HiLockClosed size={15} /> Password
            </label>
            <input
              id="reg-password"
              type="password"
              placeholder="Min. 3 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={3}
              required
            />
          </div>

          <button
            id="reg-submit"
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="btn-spinner" /> Creating account…
              </>
            ) : (
              <>
                <HiUserPlus size={18} /> Create Account
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" className="auth-link">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Register;
