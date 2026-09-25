import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserPosts, getUserFollowCounts } from '../api';
import UserListModal from './UserListModal';
import { HiPlus, HiShieldCheck, HiUser } from 'react-icons/hi2';

const ROLE_COLORS = {
  admin: 'var(--accent-pink)',
  moderator: 'var(--accent-cyan)',
  user: 'var(--accent-purple)',
};

function SidebarProfileCard() {
  const { currentUser } = useAuth();
  const [postCount, setPostCount] = useState(0);
  const [counts, setCounts] = useState({ followers_count: 0, following_count: 0 });
  const [modalState, setModalState] = useState({ isOpen: false, type: 'followers' });

  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchUserData = async () => {
      try {
        const [postsRes, countsRes] = await Promise.all([
          getUserPosts(currentUser.id),
          getUserFollowCounts(currentUser.id),
        ]);
        setPostCount(Array.isArray(postsRes.data) ? postsRes.data.length : 0);
        if (countsRes.data) {
          setCounts({
            followers_count: countsRes.data.followers_count ?? 0,
            following_count: countsRes.data.following_count ?? 0,
          });
        }
      } catch {
        // ignore error silently
      }
    };
    fetchUserData();
  }, [currentUser?.id]);

  if (!currentUser) return null;

  const roleColor = ROLE_COLORS[currentUser.role?.name] || 'var(--accent-purple)';

  return (
    <div className="sidebar-profile-card">
      <div className="sidebar-profile-top">
        <Link to="/profile" className="sidebar-profile-avatar">
          {currentUser.username?.[0]?.toUpperCase() || '?'}
        </Link>
        <div className="sidebar-profile-info">
          <Link to="/profile" className="sidebar-profile-username">
            @{currentUser.username}
          </Link>
          {currentUser.role?.name && (
            <span className="sidebar-profile-role" style={{ color: roleColor }}>
              <HiShieldCheck size={12} /> {currentUser.role.name}
            </span>
          )}
        </div>
      </div>

      <div className="sidebar-profile-stats">
        <div className="sidebar-stat">
          <span className="sidebar-stat-val">{postCount}</span>
          <span className="sidebar-stat-lbl">Posts</span>
        </div>
        <div
          className="sidebar-stat sidebar-stat-btn"
          onClick={() => setModalState({ isOpen: true, type: 'followers' })}
        >
          <span className="sidebar-stat-val">{counts.followers_count}</span>
          <span className="sidebar-stat-lbl">Followers</span>
        </div>
        <div
          className="sidebar-stat sidebar-stat-btn"
          onClick={() => setModalState({ isOpen: true, type: 'following' })}
        >
          <span className="sidebar-stat-val">{counts.following_count}</span>
          <span className="sidebar-stat-lbl">Following</span>
        </div>
      </div>

      <div className="sidebar-profile-actions">
        <Link to="/create" className="btn btn-primary btn-sm btn-full">
          <HiPlus size={15} /> New Post
        </Link>
        <Link to="/profile" className="btn btn-ghost btn-sm btn-full">
          <HiUser size={15} /> My Profile
        </Link>
      </div>

      <UserListModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        userId={currentUser.id}
        type={modalState.type}
      />
    </div>
  );
}

export default SidebarProfileCard;
