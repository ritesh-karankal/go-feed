import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { HiChatBubbleLeft, HiTag, HiUserPlus, HiUserMinus } from 'react-icons/hi2';
import { followUser, unfollowUser } from '../api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

function PostCard({ post }) {
  const { currentUser } = useAuth();
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Feed response uses PostWithMetadata: post.user.username & post.comments_count
  const author = post.user?.username || post.user?.Username || 'unknown';
  const commentsCount = post.comments_count ?? post.CommentsCount ?? 0;
  const timeAgo = post.created_at
    ? formatDistanceToNow(new Date(post.created_at), { addSuffix: true })
    : '';
  const tags = post.tags || [];

  const isOwnPost = currentUser && currentUser.id === post.user_id;

  const handleFollow = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (followLoading) return;
    setFollowLoading(true);
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
        // Already following — reflect that in UI
        setFollowing(true);
        toast('Already following @' + author, { icon: 'ℹ️' });
      } else {
        toast.error(err.response?.data?.error || 'Action failed');
      }
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <Link to={`/post/${post.id}`} className="post-card">
      <div className="post-card-header">
        <div className="post-emoji">🐹</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="post-card-title">{post.title}</h2>
          <div className="post-card-meta">
            <Link
              to={`/users/${post.user_id}`}
              className="author-link"
              onClick={(e) => e.stopPropagation()}
            >
              @{author}
            </Link>
            <span className="dot" />
            <span>{timeAgo}</span>

            {/* Follow button — hidden for own posts */}
            {!isOwnPost && (
              <button
                className={`follow-btn-inline ${following ? 'following' : ''}`}
                onClick={handleFollow}
                disabled={followLoading}
                title={following ? `Unfollow @${author}` : `Follow @${author}`}
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
        </div>
      </div>

      {tags.length > 0 && (
        <div className="post-card-tags">
          {tags.slice(0, 4).map((tag) => (
            <span key={tag} className="tag-chip">
              <HiTag size={11} /> {tag}
            </span>
          ))}
          {tags.length > 4 && (
            <span className="tag-chip tag-chip-more">+{tags.length - 4}</span>
          )}
        </div>
      )}

      <p className="post-card-preview">{post.content}</p>

      <div className="post-card-footer">
        <div className="comment-badge">
          <HiChatBubbleLeft size={16} />
          <span>{commentsCount} comments</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Read more →</span>
      </div>
    </Link>
  );
}

export default PostCard;
