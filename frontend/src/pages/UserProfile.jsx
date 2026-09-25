import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  getUser,
  getUserPosts,
  getUserFollowCounts,
  getFollowStatus,
  followUser,
  unfollowUser,
} from '../api';
import { useAuth } from '../contexts/AuthContext';
import UserListModal from '../components/UserListModal';
import { formatDistanceToNow } from 'date-fns';
import {
  HiArrowLeft,
  HiUserPlus,
  HiUserMinus,
  HiUser,
  HiShieldCheck,
  HiCalendarDays,
  HiDocumentText,
  HiChatBubbleLeft,
  HiTag,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';

const ROLE_COLORS = {
  admin: 'var(--accent-pink)',
  moderator: 'var(--accent-cyan)',
  user: 'var(--accent-purple)',
};

function UserProfile() {
  const { id } = useParams();
  const { currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [counts, setCounts] = useState({ followers_count: 0, following_count: 0 });
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, type: 'followers' });

  const isSelf = currentUser && currentUser.id === parseInt(id, 10);

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const [profileRes, postsRes, countsRes] = await Promise.all([
          getUser(id),
          getUserPosts(id),
          getUserFollowCounts(id),
        ]);

        setProfile(profileRes.data);
        setPosts(Array.isArray(postsRes.data) ? postsRes.data : []);
        if (countsRes.data) {
          setCounts({
            followers_count: countsRes.data.followers_count ?? 0,
            following_count: countsRes.data.following_count ?? 0,
          });
        }

        if (currentUser && !isSelf) {
          try {
            const statusRes = await getFollowStatus(id);
            if (statusRes.data) {
              setFollowing(statusRes.data.is_following ?? false);
            }
          } catch {
            // ignore follow status fetch error
          }
        }
      } catch (err) {
        toast.error('User not found');
      } finally {
        setLoading(false);
      }
    };
    fetchUserData();
  }, [id, currentUser, isSelf]);

  const handleFollow = async () => {
    setFollowLoading(true);
    try {
      if (following) {
        await unfollowUser(id);
        setFollowing(false);
        setCounts((prev) => ({
          ...prev,
          followers_count: Math.max(0, prev.followers_count - 1),
        }));
        toast.success(`Unfollowed @${profile.username}`);
      } else {
        await followUser(id);
        setFollowing(true);
        setCounts((prev) => ({
          ...prev,
          followers_count: prev.followers_count + 1,
        }));
        toast.success(`Following @${profile.username}! 🎉`);
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Action failed';
      if (err.response?.status === 409) {
        toast.error('You already follow this user');
      } else {
        toast.error(msg);
      }
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="empty-state">
        <div className="empty-emoji">👤</div>
        <h3>User not found</h3>
        <Link to="/" className="btn btn-secondary">Back to feed</Link>
      </div>
    );
  }

  const joinedAgo = profile.created_at
    ? formatDistanceToNow(new Date(profile.created_at), { addSuffix: true })
    : '';
  const roleColor = ROLE_COLORS[profile.role?.name] || 'var(--accent-purple)';

  return (
    <div className="user-profile-page" style={{ animation: 'fadeUp 0.4s ease' }}>
      <Link to="/" className="post-detail-back">
        <HiArrowLeft size={16} /> Back to feed
      </Link>

      <div className="profile-card">
        {/* Avatar */}
        <div className="profile-avatar">
          {profile.username?.[0]?.toUpperCase() || '?'}
        </div>

        {/* Info */}
        <div className="profile-info">
          <h1 className="profile-username">@{profile.username}</h1>
          <p className="profile-email">{profile.email}</p>

          <div className="profile-meta">
            {profile.role?.name && (
              <span className="profile-badge" style={{ color: roleColor, borderColor: roleColor }}>
                <HiShieldCheck size={14} /> {profile.role.name}
              </span>
            )}
            {joinedAgo && (
              <span className="profile-badge">
                <HiCalendarDays size={14} /> Joined {joinedAgo}
              </span>
            )}
          </div>

          {/* Instagram-style Stats */}
          <div className="profile-stats" style={{ marginTop: '1.2rem' }}>
            <div className="profile-stat">
              <span className="profile-stat-value">{posts.length}</span>
              <span className="profile-stat-label">Posts</span>
            </div>
            <div
              className="profile-stat profile-stat-clickable"
              onClick={() => setModalState({ isOpen: true, type: 'followers' })}
              title="Click to view followers"
            >
              <span className="profile-stat-value">{counts.followers_count}</span>
              <span className="profile-stat-label">Followers</span>
            </div>
            <div
              className="profile-stat profile-stat-clickable"
              onClick={() => setModalState({ isOpen: true, type: 'following' })}
              title="Click to view following"
            >
              <span className="profile-stat-value">{counts.following_count}</span>
              <span className="profile-stat-label">Following</span>
            </div>
          </div>
        </div>

        {/* Follow button */}
        {!isSelf && currentUser && (
          <button
            id="profile-follow-btn"
            className={`btn ${following ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleFollow}
            disabled={followLoading}
          >
            {followLoading ? (
              <span className="btn-spinner" />
            ) : following ? (
              <>
                <HiUserMinus size={18} /> Unfollow
              </>
            ) : (
              <>
                <HiUserPlus size={18} /> Follow
              </>
            )}
          </button>
        )}

        {isSelf && (
          <div className="profile-self-badge">
            <HiUser size={16} /> That&apos;s you!
          </div>
        )}
      </div>

      {/* Followers / Following Modal */}
      <UserListModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        userId={profile.id}
        type={modalState.type}
      />

      {/* ── User's Posts Section ── */}
      <div className="profile-posts-section" style={{ marginTop: '2.5rem' }}>
        <div className="profile-posts-header">
          <h2><HiDocumentText size={20} /> @{profile.username}&apos;s Posts</h2>
        </div>

        {posts.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 0' }}>
            <div className="empty-emoji">📝</div>
            <h3>No posts yet</h3>
            <p>@{profile.username} hasn&apos;t posted anything yet.</p>
          </div>
        ) : (
          <div className="profile-posts-grid">
            {posts.map((post) => {
              const timeAgo = post.created_at
                ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
                : '';
              const tags = post.tags || [];
              return (
                <div key={post.id} className="profile-post-card">
                  <div className="profile-post-card-top">
                    <Link to={`/post/${post.id}`} className="profile-post-title">
                      {post.title}
                    </Link>
                  </div>

                  <p className="profile-post-preview">{post.content}</p>

                  {tags.length > 0 && (
                    <div className="post-card-tags">
                      {tags.slice(0, 3).map((t) => (
                        <span key={t} className="tag-chip"><HiTag size={10} /> {t}</span>
                      ))}
                    </div>
                  )}

                  <div className="profile-post-meta">
                    <span><HiChatBubbleLeft size={13} /> {post.comments_count ?? 0} comments</span>
                    <span>{timeAgo}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfile;
