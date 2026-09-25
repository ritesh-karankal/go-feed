import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getFeed } from '../api';
import PostCard from '../components/PostCard';
import SuggestedUsers from '../components/SuggestedUsers';
import SidebarProfileCard from '../components/SidebarProfileCard';
import TrendingTopicsWidget from '../components/TrendingTopicsWidget';
import {
  HiPlus,
  HiMagnifyingGlass,
  HiArrowUp,
  HiArrowDown,
  HiXMark,
  HiSparkles,
  HiUsers,
} from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const POPULAR_TAGS = ['go', 'tech', 'tutorial', 'life', 'news', 'coding', 'rant', 'tips'];

function Home() {
  const { currentUser } = useAuth();
  const [feedType, setFeedType] = useState('explore'); // 'explore' | 'following'
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sort, setSort] = useState('desc');
  const [activeTags, setActiveTags] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const fetchFeed = useCallback(
    async (reset = true) => {
      setLoading(true);
      const currentOffset = reset ? 0 : offset;
      try {
        const res = await getFeed({
          search,
          tags: activeTags,
          sort,
          filter: feedType,
          limit: LIMIT,
          offset: currentOffset,
        });
        const data = Array.isArray(res.data) ? res.data : [];
        if (reset) {
          setPosts(data);
        } else {
          setPosts((prev) => [...prev, ...data]);
        }
        setOffset(currentOffset + LIMIT);
        setHasMore(data.length === LIMIT);
      } catch (err) {
        toast.error('Failed to load feed');
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [search, sort, activeTags, feedType, offset] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Refetch when filters or feedType change
  useEffect(() => {
    setOffset(0);
    setHasMore(true);
    fetchFeed(true);
  }, [search, sort, activeTags, feedType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearch('');
  };

  const toggleTag = (tag) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleSort = () => setSort((s) => (s === 'desc' ? 'asc' : 'desc'));

  return (
    <div className="home-layout">
      {/* ── Two-Column Layout (Left Sidebar + Right Main Feed) ── */}
      <div className="feed-grid-layout">
        {/* Left Sidebar Column (320px) */}
        <aside className="feed-left-sidebar">
          <SidebarProfileCard />
          <SuggestedUsers
            onFollowSuccess={() => {
              if (feedType === 'following') {
                fetchFeed(true);
              }
            }}
          />
          <TrendingTopicsWidget activeTags={activeTags} onSelectTag={toggleTag} />
        </aside>

        {/* Right Main Feed Column (1fr) */}
        <main className="feed-main-content">
          {/* Header */}
          <div className="home-header">
            <p>
              A blog platform for the main characters. Share your thoughts, vibes, and hot takes.
            </p>
            <div className="vibe-tags">
              <span className="vibe-tag">✨ no cap content</span>
              <span className="vibe-tag">🔥 hot takes</span>
              <span className="vibe-tag">💎 real ones only</span>
            </div>
          </div>

          {/* Feed Toggle Tabs (Explore vs Following) */}
          <div className="feed-toggle-container">
            <div className="feed-toggle-tabs">
              <button
                className={`feed-tab ${feedType === 'explore' ? 'active' : ''}`}
                onClick={() => setFeedType('explore')}
              >
                <HiSparkles size={18} /> Explore Feed
              </button>
              <button
                className={`feed-tab ${feedType === 'following' ? 'active' : ''}`}
                onClick={() => setFeedType('following')}
              >
                <HiUsers size={18} /> Following Feed
              </button>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="feed-controls">
            {/* Search */}
            <form className="search-bar" onSubmit={handleSearch}>
              <HiMagnifyingGlass size={18} className="search-icon" />
              <input
                id="feed-search"
                type="text"
                placeholder="Search posts…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
              {searchInput && (
                <button type="button" className="search-clear" onClick={clearSearch}>
                  <HiXMark size={16} />
                </button>
              )}
              <button type="submit" className="btn btn-sm btn-secondary">
                Search
              </button>
            </form>

            {/* Sort row */}
            <div className="feed-controls-row">
              <button
                id="feed-sort-toggle"
                className="btn btn-secondary btn-sm"
                onClick={toggleSort}
                title={sort === 'desc' ? 'Showing newest first' : 'Showing oldest first'}
              >
                {sort === 'desc' ? <HiArrowDown size={16} /> : <HiArrowUp size={16} />}
                {sort === 'desc' ? 'Newest' : 'Oldest'}
              </button>
            </div>

            {/* Tag filters */}
            <div className="tag-filter-row">
              {POPULAR_TAGS.map((tag) => (
                <button
                  key={tag}
                  className={`tag-filter-btn ${activeTags.includes(tag) ? 'active' : ''}`}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              ))}
              {activeTags.length > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setActiveTags([])}
                >
                  <HiXMark size={14} /> Clear
                </button>
              )}
            </div>
          </div>

          {/* Active search indicator */}
          {search && (
            <div className="search-active-badge">
              Showing results for &ldquo;<strong>{search}</strong>&rdquo;
              <button className="btn btn-ghost btn-sm" onClick={clearSearch}>
                <HiXMark size={14} /> Clear
              </button>
            </div>
          )}

          {/* Posts Grid */}
          {loading && posts.length === 0 ? (
            <div className="loading">
              <div className="loading-spinner" />
            </div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <div className="empty-emoji">📝</div>
              <h3>
                {feedType === 'following'
                  ? 'No posts from people you follow'
                  : 'No posts yet, bestie'}
              </h3>
              <p>
                {feedType === 'following'
                  ? 'Follow creators from the left sidebar to populate your feed here!'
                  : activeTags.length > 0 || search
                  ? 'No posts match your filters.'
                  : 'Be the first to share your thoughts on this journey'}
              </p>
              {feedType === 'following' ? (
                <button
                  className="btn btn-primary"
                  onClick={() => setFeedType('explore')}
                >
                  <HiSparkles size={18} /> Explore Community Posts
                </button>
              ) : (
                <Link to="/create" className="btn btn-primary">
                  <HiPlus size={18} /> Write something
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="posts-grid">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>

              {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                  <button
                    id="feed-load-more"
                    className="btn btn-secondary"
                    onClick={() => fetchFeed(false)}
                    disabled={loading}
                  >
                    {loading ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default Home;
