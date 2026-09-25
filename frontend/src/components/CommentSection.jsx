import { useState, useEffect } from 'react';
import { createComment } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { HiPaperAirplane, HiChatBubbleLeftRight, HiLockClosed, HiUserPlus } from 'react-icons/hi2';
import toast from 'react-hot-toast';

function CommentSection({
  postId,
  postAuthorId,
  postAuthorUsername,
  isFollowing,
  isOwnPost,
  onFollowAuthor,
  followLoading,
  comments = [],
}) {
  const { currentUser } = useAuth();
  const [commentsList, setCommentsList] = useState(comments);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCommentsList(comments || []);
  }, [comments]);

  const isAdmin = currentUser?.role?.name === 'admin' || currentUser?.role?.name === 'moderator';
  const canComment = isOwnPost || isAdmin || isFollowing;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    setSubmitting(true);
    try {
      const res = await createComment(postId, { content: content.trim() });
      const newComment = res.data || {
        id: Date.now(),
        content: content.trim(),
        created_at: new Date().toISOString(),
        user: { username: currentUser?.username || 'you' },
      };

      setCommentsList((prev) => [newComment, ...prev]);
      setContent('');
      toast.success('Comment posted! 💬');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to post comment';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="comments-section">
      <h2 className="comments-header">
        <HiChatBubbleLeftRight size={20} /> Comments ({commentsList.length})
      </h2>

      {/* Commenting Permission Gate */}
      {currentUser && (
        canComment ? (
          <form className="comment-form" onSubmit={handleSubmit}>
            <div className="comment-form-avatar">
              {currentUser.username?.[0]?.toUpperCase() || '?'}
            </div>
            <div className="comment-form-input-group">
              <textarea
                className="comment-textarea"
                placeholder={`Comment as @${currentUser.username}...`}
                rows={2}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
              <div className="comment-form-footer">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={submitting || !content.trim()}
                >
                  {submitting ? (
                    <span className="btn-spinner-sm" />
                  ) : (
                    <>
                      <HiPaperAirplane size={14} /> Post Comment
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="comment-locked-banner">
            <div className="comment-locked-icon">
              <HiLockClosed size={18} />
            </div>
            <div className="comment-locked-info">
              <span>Only followers of <strong>@{postAuthorUsername}</strong> can comment on this post.</span>
            </div>
            {onFollowAuthor && (
              <button
                className="btn btn-primary btn-sm"
                onClick={onFollowAuthor}
                disabled={followLoading}
              >
                {followLoading ? (
                  <span className="btn-spinner-sm" />
                ) : (
                  <>
                    <HiUserPlus size={14} /> Follow @{postAuthorUsername}
                  </>
                )}
              </button>
            )}
          </div>
        )
      )}

      {/* Comments List */}
      <div className="comments-list">
        {commentsList.length === 0 ? (
          <div className="comments-empty-state">
            <div className="empty-emoji">💭</div>
            <p>No comments yet. Be the first to share your thoughts!</p>
          </div>
        ) : (
          commentsList.map((comment) => (
            <div key={comment.id} className="comment-item">
              <div className="comment-avatar">
                {comment.user?.username?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="comment-body">
                <div className="comment-item-header">
                  <span className="comment-author">
                    @{comment.user?.username || 'unknown'}
                  </span>
                  <span className="comment-date">
                    {comment.created_at
                      ? formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })
                      : ''}
                  </span>
                </div>
                <p className="comment-content">{comment.content}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default CommentSection;
