import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  HiArrowRightOnRectangle,
  HiArrowLeftOnRectangle,
  HiUserPlus,
  HiUser,
} from 'react-icons/hi2';

function Navbar() {
  const { isAuthenticated, currentUser, logout, loading } = useAuth();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-logo">
          <span>🐹</span> GoFeed
        </Link>

        <div className="navbar-actions">
          {loading ? null : isAuthenticated ? (
            <>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `navbar-username ${isActive ? 'navbar-username-active' : ''}`
                }
              >
                <HiUser size={15} /> {currentUser?.username}
              </NavLink>
              <button className="btn btn-secondary" onClick={logout} title="Logout">
                <HiArrowRightOnRectangle size={18} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-secondary">
                <HiArrowLeftOnRectangle size={18} />
                Login
              </Link>
              <Link to="/register" className="btn btn-primary">
                <HiUserPlus size={18} />
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
