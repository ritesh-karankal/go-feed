import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import PostDetail from './pages/PostDetail';
import CreatePost from './pages/CreatePost';
import EditPost from './pages/EditPost';
import Login from './pages/Login';
import Register from './pages/Register';
import ConfirmAccount from './pages/ConfirmAccount';
import UserProfile from './pages/UserProfile';
import Profile from './pages/Profile';
import { HiPlus } from 'react-icons/hi2';

// FAB is shown on feed and profile pages only
function FloatingCreateButton() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const showFab = isAuthenticated && (pathname === '/' || pathname === '/profile');
  if (!showFab) return null;
  return (
    <Link to="/create" id="fab-create" className="fab" title="Create a new post">
      <HiPlus size={26} />
    </Link>
  );
}

function App() {
  return (
    <AuthProvider>
      <div className="app">
        <div className="gradient-bg" />
        <Navbar />
        <main className="main-content">
          <Routes>
            {/* ── Public routes ── */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/confirm/:token" element={<ConfirmAccount />} />

            {/* ── Protected routes ── */}
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/post/:id" element={<ProtectedRoute><PostDetail /></ProtectedRoute>} />
            <Route path="/create" element={<ProtectedRoute><CreatePost /></ProtectedRoute>} />
            <Route path="/edit/:id" element={<ProtectedRoute><EditPost /></ProtectedRoute>} />
            <Route path="/users/:id" element={<ProtectedRoute><UserProfile /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

            {/* ── Fallback ── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Floating Action Button */}
        <FloatingCreateButton />
      </div>
    </AuthProvider>
  );
}

export default App;
