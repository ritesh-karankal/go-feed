import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { activateUser } from '../api';
import { HiCheckCircle, HiXCircle } from 'react-icons/hi2';

function ConfirmAccount() {
  const { token } = useParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  // Guard against React StrictMode double-invoking effects in dev:
  // the backend deletes the token after the first call, so a second call would 404.
  const hasActivated = useRef(false);

  useEffect(() => {
    if (hasActivated.current) return;
    hasActivated.current = true;

    const doActivate = async () => {
      try {
        await activateUser(token);
        setStatus('success');
      } catch (err) {
        setErrorMsg(
          err.response?.data?.error || 'Activation failed. The link may have expired.'
        );
        setStatus('error');
      }
    };
    doActivate();
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="loading">
            <div className="loading-spinner" />
          </div>
          <p className="auth-subtitle" style={{ textAlign: 'center', marginTop: '1rem' }}>
            Activating your account…
          </p>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="auth-page">
        <div className="auth-card auth-success-card">
          <div className="auth-success-icon" style={{ color: 'var(--accent-green)' }}>
            <HiCheckCircle size={64} />
          </div>
          <h1 className="auth-title">You&apos;re activated!</h1>
          <p className="auth-subtitle">
            Your GoFeed account is ready. Sign in to start exploring the feed.
          </p>
          <Link to="/login" className="btn btn-primary auth-submit" style={{ marginTop: '1.5rem' }}>
            Sign In Now →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card auth-success-card">
        <div className="auth-success-icon" style={{ color: '#f87171' }}>
          <HiXCircle size={64} />
        </div>
        <h1 className="auth-title">Activation Failed</h1>
        <p className="auth-subtitle">{errorMsg}</p>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', justifyContent: 'center' }}>
          <Link to="/login" className="btn btn-secondary">
            Login
          </Link>
          <Link to="/register" className="btn btn-primary">
            Register again
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ConfirmAccount;
