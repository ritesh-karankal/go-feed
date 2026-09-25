import { useState } from 'react';
import { HiXMark } from 'react-icons/hi2';
import { HiPlus } from 'react-icons/hi';

function TagInput({ tags = [], onChange }) {
  const [input, setInput] = useState('');

  const addTag = (raw) => {
    const tag = raw.trim().toLowerCase().replace(/\s+/g, '-');
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
    setInput('');
  };

  const removeTag = (tag) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="tag-input-wrapper">
      <div className="tag-input-chips">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip tag-chip-removable">
            #{tag}
            <button
              type="button"
              className="tag-chip-remove"
              onClick={() => removeTag(tag)}
              aria-label={`Remove tag ${tag}`}
            >
              <HiXMark size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          className="tag-input-field"
          placeholder={tags.length === 0 ? 'Add tags (press Enter or comma)…' : '+ tag'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input.trim() && addTag(input)}
        />
      </div>
      {input.trim() && (
        <button
          type="button"
          className="btn btn-ghost btn-sm tag-add-btn"
          onClick={() => addTag(input)}
        >
          <HiPlus size={14} /> Add
        </button>
      )}
    </div>
  );
}

export default TagInput;
