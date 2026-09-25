import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getSuggestedUsers, followUser } from '../api';
import { HiUserPlus, HiCheck, HiSparkles, HiShieldCheck } from 'react-icons/hi2';
import toast from 'react-hot-toast';

const ROLE_COLORS = {
  admin: 'var(--accent-pink)',
  moderator: 'var(--accent-cyan)',
  user: 'var(--accent-purple)',
};

function SuggestedUsers({ onFollowSuccess }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [followingMap, setFollowingMap] = useState({});
  const [followLoadingMap, setFollowLoadingMap] = useState({});

  useEffect(() => {
    const fetchSuggested = async () => {
      setLoading(true);
      try {
        const res = await getSuggestedUsers(5);
        setUsers(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        // silently fail or empty list
        setUsers([]);
      } finally {
        setLoading(false);
      }
    };
    fetchSuggested();
  }, []);

  const handleFollow = async (userId, username) => {
    setFollowLoadingMap((prev) => ({ ...prev, [userId]: true }));
    try {
      await followUser(userId);
      setFollowingMap((prev) => ({ ...prev, [userId]: true }));
      toast.success(`Following @${username}! 🎉`);
      if (onFollowSuccess) {
        onFollowSuccess(userId);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setFollowingMap((prev) => ({ ...prev, [userId]: true }));
        toast.error('You already follow this user');
      } else {
        toast.error('Failed to follow user');
      }
    } finally {
      setFollowLoadingMap((prev) => ({ ...prev, [userId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="suggested-users-card">
        <div className="suggested-users-header">
          <h3><HiSparkles size={16} /> Suggested Creators</h3>
        </div>
        <div className="loading" style={{ padding: '1.5rem 0' }}>
          <div className="loading-spinner" />
        </div>
      </div>
    );
  }

  if (users.length === 0) {
    return null; // Don't display empty widget if no suggestions
  }

  return (
    <div className="suggested-users-card">
      <div className="suggested-users-header">
        <h3><HiSparkles size={16} /> Suggested for You</h3>
        <span className="suggested-users-badge">Discover</span>
      </div>

      <div className="suggested-users-list">
        {users.map((u) => {
          const isFollowing = followingMap[u.id];
          const isBtnLoading = followLoadingMap[u.id];
          const roleColor = ROLE_COLORS[u.role?.name] || 'var(--accent-purple)';

          return (
            <div key={u.id} className="suggested-user-item">
              <Link to={`/users/${u.id}`} className="suggested-user-avatar">
                {u.username?.[0]?.toUpperCase() || '?'}
              </Link>

              <div className="suggested-user-info">
                <Link to={`/users/${u.id}`} className="suggested-user-name">
                  @{u.username}
                </Link>
                {u.role?.name && (
                  <span className="suggested-user-role" style={{ color: roleColor }}>
                    <HiShieldCheck size={11} /> {u.role.name}
                  </span>
                )}
              </div>

              <button
                className={`suggested-follow-btn ${isFollowing ? 'following' : ''}`}
                onClick={() => handleFollow(u.id, u.username)}
                disabled={isFollowing || isBtnLoading}
              >
                {isBtnLoading ? (
                  <span className="btn-spinner-sm" />
                ) : isFollowing ? (
                  <>
                    <HiCheck size={13} /> Following
                  </>
                ) : (
                  <>
                    <HiUserPlus size={13} /> Follow
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SuggestedUsers;
