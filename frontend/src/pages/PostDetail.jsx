import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPost, deletePost, followUser, unfollowUser } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import {
  HiArrowLeft,
  HiPencil,
  HiTrash,
  HiTag,
  HiUserPlus,
  HiUserMinus,
} from 'react-icons/hi2';
import CommentSection from '../components/CommentSection';
import ConfirmModal from '../components/ConfirmModal';
import toast from 'react-hot-toast';

function PostDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    fetchPost();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPost = async () => {
    try {
      const res = await getPost(id);
      setPost(res.data);
    } catch (err) {
      toast.error('Post not found 😢');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deletePost(id);
      toast.success('Post deleted! 🗑️');
      navigate('/');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to delete post';
      toast.error(msg);
    }
  };

  const handleFollow = async () => {
    if (!post || followLoading) return;
    setFollowLoading(true);
    const author = post.user?.username || 'user';
    try {
      if (following) {
        await unfollowUser(post.user_id);
        setFollowing(false);
        toast.success(`Unfollowed @${author}`);
      } else {
        await followUser(post.user_id);
        setFollowing(true);
        toast.success(`Following @${author}! 🎉`);
      }
    } catch (err) {
      if (err.response?.status === 409) {
        setFollowing(true);
        toast('Already following @' + author, { icon: 'ℹ️' });
      } else {
        toast.error(err.response?.data?.error || 'Action failed');
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

  if (!post) return null;

  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const wasEdited = post.updated_at && post.updated_at !== post.created_at;
  const isOwner = currentUser && currentUser.id === post.user_id;
  const isOwnPost = isOwner;
  const isAdmin = currentUser?.role?.name === 'admin' || currentUser?.role?.name === 'moderator';
  const canEditOrDelete = isOwner || isAdmin;
  const tags = post.tags || [];
  const author = post.user?.username || 'unknown';

  return (
    <div className="post-detail-container" style={{ animation: 'fadeUp 0.4s ease' }}>
      {/* ── Top Bar: Back Button Left & Edit/Delete Right ── */}
      <div className="post-detail-top-bar">
        <Link to="/" className="post-detail-back-btn">
          <HiArrowLeft size={16} /> Back to feed
        </Link>

        {canEditOrDelete && (
          <div className="post-detail-top-actions">
            <Link to={`/edit/${post.id}`} className="btn btn-secondary btn-sm">
              <HiPencil size={15} /> Edit
            </Link>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowDeleteModal(true)}
            >
              <HiTrash size={15} /> Delete
            </button>
          </div>
        )}
      </div>

      {/* ── Main Post Hero Card ── */}
      <div className="post-detail-hero-card">
        {/* Author Header Row */}
        <div className="post-hero-author-row">
          <Link to={`/users/${post.user_id}`} className="post-hero-avatar">
            {author[0]?.toUpperCase() || '?'}
          </Link>

          <div className="post-hero-author-info">
            <div className="post-hero-author-name-group">
              <Link to={`/users/${post.user_id}`} className="post-hero-author-name">
                @{author}
              </Link>
              {!isOwnPost && currentUser && (
                <button
                  className={`follow-btn-inline ${following ? 'following' : ''}`}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? (
                    <span className="btn-spinner btn-spinner-sm" />
                  ) : following ? (
                    <><HiUserMinus size={12} /> Unfollow</>
                  ) : (
                    <><HiUserPlus size={12} /> Follow</>
                  )}
                </button>
              )}
            </div>
            <div className="post-hero-meta-time">
              <span>{timeAgo}</span>
              {wasEdited && <span className="edited-tag">(edited)</span>}
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="post-hero-title">
          <span className="post-hero-emoji">🐹</span> {post.title}
        </h1>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="post-hero-tags">
            {tags.map((tag) => (
              <span key={tag} className="tag-chip">
                <HiTag size={11} /> {tag}
              </span>
            ))}
          </div>
        )}

        {/* Post Content */}
        <div className="post-hero-content">
          {post.content}
        </div>
      </div>

      {/* ── Comments Section ── */}
      <CommentSection
        postId={post.id}
        postAuthorId={post.user_id}
        postAuthorUsername={author}
        isFollowing={following}
        isOwnPost={isOwnPost}
        onFollowAuthor={handleFollow}
        followLoading={followLoading}
        comments={post.comments || []}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete this post?"
          message="This action is permanent. All comments on this post will be removed."
          emoji="💀"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}

export default PostDetail;
