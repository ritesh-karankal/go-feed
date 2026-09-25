import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createPost } from '../api';
import { HiArrowLeft } from 'react-icons/hi2';
import TagInput from '../components/TagInput';
import toast from 'react-hot-toast';

function CreatePost() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      toast.error('Title and content are required!');
      return;
    }

    setSubmitting(true);
    try {
      const res = await createPost({
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      toast.success('Post created! 🚀');
      navigate(`/post/${res.data.id}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to create post';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-page">
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to="/" className="post-detail-back-btn">
          <HiArrowLeft size={16} /> Back to feed
        </Link>
      </div>
      <h1>Create a New Post ✍️</h1>

      <form className="form-card" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="create-title">Title</label>
          <input
            id="create-title"
            type="text"
            placeholder="Something fire goes here..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="create-content">Content</label>
          <textarea
            id="create-content"
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
            id="create-submit"
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Posting…' : 'Post it 🚀'}
          </button>
          <Link to="/" className="btn btn-secondary">
            Nvm, cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default CreatePost;
