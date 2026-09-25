import { HiHashtag, HiFire, HiInformationCircle } from 'react-icons/hi2';

const TOPICS = [
  { tag: 'go', count: '142 posts' },
  { tag: 'tech', count: '98 posts' },
  { tag: 'coding', count: '85 posts' },
  { tag: 'tutorial', count: '64 posts' },
  { tag: 'tips', count: '41 posts' },
  { tag: 'life', count: '32 posts' },
];

function TrendingTopicsWidget({ activeTags, onSelectTag }) {
  return (
    <div className="trending-widget-card">
      <div className="trending-widget-header">
        <h3><HiFire size={16} /> Trending Topics</h3>
        <span className="trending-widget-badge">Hot</span>
      </div>

      <div className="trending-topics-list">
        {TOPICS.map((item) => {
          const isActive = activeTags?.includes(item.tag);
          return (
            <div
              key={item.tag}
              className={`trending-topic-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTag(item.tag)}
            >
              <div className="trending-topic-icon">
                <HiHashtag size={14} />
              </div>
              <div className="trending-topic-info">
                <span className="trending-topic-name">#{item.tag}</span>
                <span className="trending-topic-count">{item.count}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-footer-info">
        <p><HiInformationCircle size={13} /> GoFeed Community &copy; 2026</p>
        <div className="sidebar-footer-links">
          <span>About</span> &bull; <span>Guidelines</span> &bull; <span>Privacy</span>
        </div>
      </div>
    </div>
  );
}

export default TrendingTopicsWidget;
