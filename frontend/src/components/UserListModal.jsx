import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUserFollowers, getUserFollowing } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { HiXMark, HiMagnifyingGlass, HiShieldCheck } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const ROLE_COLORS = {
  admin: 'var(--accent-pink)',
  moderator: 'var(--accent-cyan)',
  user: 'var(--accent-purple)',
};

function UserListModal({ isOpen, onClose, title, userId, type }) {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen || !userId) return;
    const fetchUsers = async () => {
      setLoading(true);
      try {
        const res = type === 'following'
          ? await getUserFollowing(userId)
          : await getUserFollowers(userId);
        setUsers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        toast.error(`Failed to load ${type}`);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [isOpen, userId, type]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleUserClick = (targetUserId) => {
    onClose();
    if (currentUser && currentUser.id === targetUserId) {
      navigate('/profile');
    } else {
      navigate(`/users/${targetUserId}`);
    }
  };

  return (
    <div className="user-list-modal-overlay" onClick={onClose}>
      <div className="user-list-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="user-list-modal-header">
          <h3>{title || (type === 'following' ? 'Following' : 'Followers')}</h3>
          <button className="user-list-modal-close" onClick={onClose}>
            <HiXMark size={20} />
          </button>
        </div>

        {/* Search Input */}
        <div className="user-list-modal-search">
          <HiMagnifyingGlass size={16} />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* User List Body */}
        <div className="user-list-modal-body">
          {loading ? (
            <div className="loading" style={{ padding: '2rem 0' }}>
              <div className="loading-spinner" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="user-list-empty">
              {search ? 'No matching users found' : `No ${type} yet`}
            </div>
          ) : (
            <div className="user-list-items">
              {filteredUsers.map((u) => {
                const roleColor = ROLE_COLORS[u.role?.name] || 'var(--accent-purple)';
                const isSelf = currentUser && currentUser.id === u.id;
                return (
                  <div
                    key={u.id}
                    className="user-list-item"
                    onClick={() => handleUserClick(u.id)}
                  >
                    <div className="user-list-avatar">
                      {u.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="user-list-info">
                      <div className="user-list-name-row">
                        <span className="user-list-username">@{u.username}</span>
                        {isSelf && <span className="user-list-self-tag">You</span>}
                      </div>
                      {u.role?.name && (
                        <span className="user-list-role" style={{ color: roleColor }}>
                          <HiShieldCheck size={12} /> {u.role.name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserListModal;
