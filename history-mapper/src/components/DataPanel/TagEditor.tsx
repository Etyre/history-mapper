import type { Span, Action } from '../../types';
import React, { useState, useRef, useEffect, useMemo } from 'react';

interface Props {
  spanId: string;
  tags: string[];
  allSpans: Span[];
  dispatch: React.Dispatch<Action>;
}

export function TagEditor({ spanId, tags, allSpans, dispatch }: Props) {
  const [input, setInput] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const span of allSpans) {
      for (const tag of span.tags ?? []) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [allSpans]);

  const filteredTags = allTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(input.toLowerCase())
  );

  const updateTags = (newTags: string[]) => {
    dispatch({ type: 'UPDATE_SPAN', id: spanId, updates: { tags: newTags } });
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      updateTags([...tags, trimmed]);
    }
    setInput('');
    setShowDropdown(false);
  };

  const removeTag = (tag: string) => {
    updateTags(tags.filter((t) => t !== tag));
  };

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="tag-editor" ref={containerRef}>
      <div className="sub-section-header">
        <span>Tags</span>
      </div>
      <div className="tag-chips">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            {tag}
            <button className="tag-chip-remove" onClick={() => removeTag(tag)}>&times;</button>
          </span>
        ))}
      </div>
      <div className="tag-input-wrapper">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
          }}
          placeholder="Add tag..."
          className="tag-input"
        />
        {showDropdown && filteredTags.length > 0 && (
          <div className="tag-dropdown">
            {filteredTags.map((tag) => (
              <div
                key={tag}
                className="tag-dropdown-item"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(tag);
                }}
              >
                {tag}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
