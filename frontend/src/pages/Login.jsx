import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { HiArrowRightOnRectangle, HiEnvelope, HiLockClosed } from 'react-icons/hi2';
import toast from 'react-hot-toast';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // Navigate as soon as auth state confirms the user is in
  // (avoids the React batching race condition with immediate navigate())
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast.error('Please fill in all fields');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      toast.success('Welcome back! 🐹');
      // navigation is handled by the useEffect above
    } catch (err) {
      const msg = err.response?.data?.error || 'Invalid credentials';
      toast.error(msg);
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🐹</div>
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your GoFeed account</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="login-email">
              <HiEnvelope size={15} /> Email
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">
              <HiLockClosed size={15} /> Password
            </label>
            <input
              id="login-password"
              type="password"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button
            id="login-submit"
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="btn-spinner" /> Signing in…
              </>
            ) : (
              <>
                <HiArrowRightOnRectangle size={18} /> Sign In
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="auth-link">
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Login;
