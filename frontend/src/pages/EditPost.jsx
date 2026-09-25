import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { getPost, updatePost } from '../api';
import { HiArrowLeft } from 'react-icons/hi2';
import TagInput from '../components/TagInput';
import toast from 'react-hot-toast';

function EditPost() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchPost();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPost = async () => {
    try {
      const res = await getPost(id);
      setTitle(res.data.title);
      setContent(res.data.content);
      setTags(res.data.tags || []);
    } catch {
      toast.error('Post not found 😢');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required!');
      return;
    }

    setSubmitting(true);
    try {
      // PATCH with only the changed fields (all optional per backend's UpdatePostPayload)
      await updatePost(id, {
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      toast.success('Post updated! ✨');
      navigate(`/post/${id}`);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || 'Failed to update post';
      if (status === 409) {
        toast.error('Edit conflict — someone else modified this post. Please reload.');
      } else if (status === 403) {
        toast.error('You are not allowed to edit this post.');
        navigate(`/post/${id}`);
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="form-page">
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to={`/post/${id}`} className="post-detail-back-btn">
          <HiArrowLeft size={16} /> Back to post
        </Link>
      </div>
      <h1>Edit Post ✏️</h1>

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="edit-title">Title</label>
          <input
            id="edit-title"
            type="text"
            placeholder="Something fire goes here..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="edit-content">Content</label>
          <textarea
            id="edit-content"
            placeholder="Spill your thoughts... no character limit, go off 💅"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            required
          />
          <div className="char-count">{content.length}/1000</div>
        </div>

        <div className="form-group">
          <label>Tags</label>
          <TagInput tags={tags} onChange={setTags} />
        </div>

        <div className="form-actions">
          <button
            id="edit-submit"
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save changes 💾'}
          </button>
          <Link to={`/post/${id}`} className="btn btn-secondary">
            Nvm, cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default EditPost;
