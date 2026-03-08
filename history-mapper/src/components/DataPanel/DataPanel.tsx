import type { AppState, Action } from '../../types';
import { SpanRow } from './SpanRow';
import { JsonImportExport } from './JsonImportExport';
import React, { useState } from 'react';

interface Props {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  selectedSpanId?: string | null;
}

export function DataPanel({ state, dispatch, selectedSpanId }: Props) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const handleSort = () => {
    dispatch({ type: 'REORDER_BY_START_DATE', direction: sortDir });
    setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
  };

  const filteredSpans = search.trim()
    ? state.spans.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
    : state.spans;

  return (
    <div className="data-panel">
      <div className="data-panel-header">
        <h2>Spans</h2>
        <div className="data-panel-actions">
          <button onClick={() => dispatch({ type: 'ADD_SPAN' })}>+ Add Span</button>
          <button onClick={handleSort}>Sort by Date {sortDir === 'asc' ? '↑' : '↓'}</button>
          <JsonImportExport state={state} dispatch={dispatch} />
        </div>
      </div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filter spans..."
        className="title-input"
        style={{ marginBottom: 8 }}
      />
      <div className="span-list">
        {filteredSpans.map((span) => (
          <SpanRow
            key={span.id}
            span={span}
            allSpans={state.spans}
            dispatch={dispatch}
            forceExpanded={span.id === selectedSpanId}
          />
        ))}
        {state.spans.length === 0 && <p className="empty-message">No spans yet. Click "+ Add Span" to get started.</p>}
      </div>
    </div>
  );
}
