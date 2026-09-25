import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { login as apiLogin, register as apiRegister, getUser } from '../api';

const AuthContext = createContext(null);

// Decode JWT payload without a library
function decodeJWT(token) {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('gofeed_token'));
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('gofeed_token');
    localStorage.removeItem('gofeed_user');
    setToken(null);
    setCurrentUser(null);
  }, []);

  // Load user profile from the backend using a JWT
  const loadUser = useCallback(async (jwtToken) => {
    setLoading(true);

    const claims = decodeJWT(jwtToken);
    if (!claims || !claims.sub) {
      // Bad/expired/malformed token — clear it so we don't spinner forever
      clearAuth();
      setLoading(false);
      return;
    }

    const userID = Math.round(claims.sub);
    try {
      const res = await getUser(userID);
      setCurrentUser(res.data);
      localStorage.setItem('gofeed_user', JSON.stringify(res.data));
    } catch {
      clearAuth();
    } finally {
      setLoading(false);
    }
  }, [clearAuth]);

  // On mount: validate any stored token
  useEffect(() => {
    const stored = localStorage.getItem('gofeed_token');
    if (stored) {
      loadUser(stored);
    } else {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const res = await apiLogin({ email, password });
    const jwt = res.data;
    if (typeof jwt !== 'string') throw new Error('Unexpected token format from server');
    localStorage.setItem('gofeed_token', jwt);
    setToken(jwt);
    await loadUser(jwt);
    return jwt;
  };

  const register = async (username, email, password) => {
    const res = await apiRegister({ username, email, password });
    return res.data; // UserWithToken: { id, username, email, ..., token: "plain-activation-token" }
  };

  const logout = () => {
    clearAuth();
    setLoading(false);
  };

  const isAuthenticated = !!token && !!currentUser;

  return (
    <AuthContext.Provider value={{ token, currentUser, isAuthenticated, loading, login, register, logout, loadUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
