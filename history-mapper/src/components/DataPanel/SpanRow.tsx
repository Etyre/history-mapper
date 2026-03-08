import type { Span, SpanType, Action } from '../../types';
import { SPAN_COLORS } from '../../utils/colors';
import { SubEventEditor } from './SubEventEditor';
import { CausalImpactEditor } from './CausalImpactEditor';
import React, { useState, useEffect, useRef } from 'react';

const SPAN_TYPES: SpanType[] = ['Economics', 'Technology', 'Politics', 'Culture', 'Subculture', 'Demographics'];

interface Props {
  span: Span;
  allSpans: Span[];
  dispatch: React.Dispatch<Action>;
  forceExpanded?: boolean;
}

export function SpanRow({ span, allSpans, dispatch, forceExpanded }: Props) {
  const [expanded, setExpanded] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (forceExpanded) {
      setExpanded(true);
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [forceExpanded]);
  const [startYearDraft, setStartYearDraft] = useState<string | null>(null);
  const [endYearDraft, setEndYearDraft] = useState<string | null>(null);

  const update = (updates: Partial<Omit<Span, 'id'>>) => {
    dispatch({ type: 'UPDATE_SPAN', id: span.id, updates });
  };

  const commitStartYear = (val: string) => {
    const num = Number(val.trim());
    if (!isNaN(num) && val.trim() !== '') {
      update({ startYear: num });
    }
    setStartYearDraft(null);
  };

  const startYearDisplay = startYearDraft !== null ? startYearDraft : String(span.startYear);

  const commitEndYear = (val: string) => {
    const trimmed = val.trim().toLowerCase();
    if (trimmed === 'ongoing') {
      update({ endYear: 'ongoing' });
    } else {
      const num = Number(trimmed);
      if (!isNaN(num) && trimmed !== '') {
        update({ endYear: num });
      }
    }
    setEndYearDraft(null);
  };

  const endYearDisplay = endYearDraft !== null
    ? endYearDraft
    : span.endYear === 'ongoing' ? 'ongoing' : String(span.endYear);

  return (
    <div ref={rowRef} className="span-row" style={{ borderLeft: `4px solid ${SPAN_COLORS[span.spanType]}` }}>
      <div className="span-row-main">
        <input
          type="text"
          value={span.title}
          onChange={(e) => update({ title: e.target.value })}
          className="title-input"
        />
        <input
          type="text"
          value={startYearDisplay}
          onChange={(e) => setStartYearDraft(e.target.value)}
          onBlur={(e) => commitStartYear(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitStartYear((e.target as HTMLInputElement).value); }}
          className="year-input"
        />
        <span className="year-separator">–</span>
        <input
          type="text"
          value={endYearDisplay}
          onChange={(e) => setEndYearDraft(e.target.value)}
          onBlur={(e) => commitEndYear(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEndYear((e.target as HTMLInputElement).value); }}
          className="year-input"
          title='Enter a year or "ongoing"'
        />
        <select
          value={span.spanType}
          onChange={(e) => update({ spanType: e.target.value as SpanType })}
          className="type-select"
        >
          {SPAN_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button className="expand-btn" onClick={() => {
          if (expanded) {
            // Sort sub-events by date when collapsing
            const sorted = [...span.subEvents].sort((a, b) => a.date - b.date);
            update({ subEvents: sorted });
          }
          setExpanded(!expanded);
        }}>
          {expanded ? '▾' : '▸'}
        </button>
      </div>
      {expanded && (
        <div className="span-row-details">
          <SubEventEditor spanId={span.id} subEvents={span.subEvents} dispatch={dispatch} />
          <CausalImpactEditor spanId={span.id} causalImpacts={span.causalImpacts} allSpans={allSpans} dispatch={dispatch} />
          {span.endYear !== 'ongoing' && (() => {
            const candidates = allSpans.filter((s) => s.id !== span.id && s.startYear === span.endYear);
            return candidates.length > 0 ? (
              <div className="sub-section-header" style={{ marginTop: 8 }}>
                <span>Continues as</span>
                <select
                  value={span.continuesAs ?? ''}
                  onChange={(e) => dispatch({ type: 'SET_CONTINUES_AS', spanId: span.id, continuesAsId: e.target.value || null })}
                  style={{ fontSize: 12 }}
                >
                  <option value="">-- None --</option>
                  {candidates.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}</option>
                  ))}
                </select>
              </div>
            ) : null;
          })()}
          <button className="delete-span-btn" onClick={() => {
            if (window.confirm(`Delete "${span.title}"?`)) {
              dispatch({ type: 'REMOVE_SPAN', id: span.id });
            }
          }}>
            Delete span
          </button>
        </div>
      )}
    </div>
  );
}
