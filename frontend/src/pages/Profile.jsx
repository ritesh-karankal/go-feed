import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getUserPosts, getUserFollowCounts } from '../api';
import UserListModal from '../components/UserListModal';
import { formatDistanceToNow } from 'date-fns';
import {
  HiUser, HiEnvelope, HiShieldCheck, HiCalendarDays,
  HiDocumentText, HiChatBubbleLeft, HiTag, HiPencil,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';

const ROLE_COLORS = {
  admin: 'var(--accent-pink)',
  moderator: 'var(--accent-cyan)',
  user: 'var(--accent-purple)',
};

function Profile() {
  const { currentUser } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [counts, setCounts] = useState({ followers_count: 0, following_count: 0 });
  const [modalState, setModalState] = useState({ isOpen: false, type: 'followers' });

  useEffect(() => {
    if (!currentUser?.id) return;
    const fetchProfileData = async () => {
      try {
        const [postsRes, countsRes] = await Promise.all([
          getUserPosts(currentUser.id),
          getUserFollowCounts(currentUser.id),
        ]);
        setPosts(Array.isArray(postsRes.data) ? postsRes.data : []);
        if (countsRes.data) {
          setCounts({
            followers_count: countsRes.data.followers_count ?? 0,
            following_count: countsRes.data.following_count ?? 0,
          });
        }
      } catch {
        toast.error('Failed to load profile details');
      } finally {
        setLoadingPosts(false);
      }
    };
    fetchProfileData();
  }, [currentUser?.id]);

  if (!currentUser) return null;

  const joinedAgo = currentUser.created_at
    ? formatDistanceToNow(new Date(currentUser.created_at), { addSuffix: true })
    : '';
  const roleColor = ROLE_COLORS[currentUser.role?.name] || 'var(--accent-purple)';

  return (
    <div className="profile-page" style={{ animation: 'fadeUp 0.4s ease' }}>
      {/* ── Profile Header Card ── */}
      <div className="profile-header-card">
        <div className="profile-avatar-lg">
          {currentUser.username?.[0]?.toUpperCase() || '?'}
        </div>

        <div className="profile-header-info">
          <h1 className="profile-username">@{currentUser.username}</h1>

          <div className="profile-header-meta">
            <span className="profile-meta-item">
              <HiEnvelope size={14} /> {currentUser.email}
            </span>
            {currentUser.role?.name && (
              <span className="profile-meta-item" style={{ color: roleColor }}>
                <HiShieldCheck size={14} /> {currentUser.role.name}
              </span>
            )}
            {joinedAgo && (
              <span className="profile-meta-item">
                <HiCalendarDays size={14} /> Joined {joinedAgo}
              </span>
            )}
          </div>

          <div className="profile-stats">
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
      </div>

      {/* ── Followers/Following Modal ── */}
      <UserListModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ ...modalState, isOpen: false })}
        userId={currentUser.id}
        type={modalState.type}
      />

      {/* ── Posts Section ── */}
      <div className="profile-posts-section">
        <div className="profile-posts-header">
          <h2><HiDocumentText size={20} /> Your Posts</h2>
          <Link to="/create" className="btn btn-primary btn-sm">
            + New Post
          </Link>
        </div>

        {loadingPosts ? (
          <div className="loading" style={{ padding: '3rem 0' }}>
            <div className="loading-spinner" />
          </div>
        ) : posts.length === 0 ? (
          <div className="empty-state" style={{ padding: '3rem 0' }}>
            <div className="empty-emoji">✍️</div>
            <h3>No posts yet</h3>
            <p>Share your thoughts with the GoFeed community!</p>
            <Link to="/create" className="btn btn-primary">
              Write your first post
            </Link>
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
                    <Link to={`/edit/${post.id}`} className="btn btn-ghost btn-sm btn-icon" title="Edit">
                      <HiPencil size={15} />
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

export default Profile;
