import type { CausalImpact, AttachmentPoint, Span, Action } from '../../types';
import React, { useState, useRef } from 'react';

function TargetCombobox({ value, spans, onSelect }: {
  value: string;
  spans: Span[];
  onSelect: (spanId: string) => void;
}) {
  const selected = spans.find((s) => s.id === value);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const display = draft !== null ? draft : (selected?.title ?? '');
  const query = (draft ?? '').trim().toLowerCase();
  const matches = query
    ? spans.filter((s) => s.title.toLowerCase().includes(query))
    : spans;

  const close = () => {
    setDraft(null);
    setOpen(false);
    setHighlight(0);
  };

  const select = (spanId: string) => {
    onSelect(spanId);
    close();
    inputRef.current?.blur();
  };

  return (
    <div className="target-combobox">
      <input
        ref={inputRef}
        type="text"
        value={display}
        placeholder="Target..."
        title={selected?.title}
        onFocus={() => { setDraft(''); setOpen(true); setHighlight(0); }}
        onChange={(e) => { setDraft(e.target.value); setOpen(true); setHighlight(0); }}
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (matches[highlight]) select(matches[highlight].id);
          } else if (e.key === 'Escape') {
            close();
            inputRef.current?.blur();
          }
        }}
      />
      {open && (
        <div className="target-combobox-list">
          {matches.length === 0 && <div className="target-combobox-empty">No matching spans</div>}
          {matches.map((s, i) => (
            <div
              key={s.id}
              className={`target-combobox-item${i === highlight ? ' highlighted' : ''}${s.id === value ? ' selected' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); select(s.id); }}
              onMouseEnter={() => setHighlight(i)}
            >
              {s.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AnnotationInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      placeholder="Annotation"
      onChange={(e) => onChange(e.target.value)}
      className="annotation-input"
    />
  );
}

function attachmentSelectValue(att: AttachmentPoint): string {
  return typeof att === 'number' ? 'year' : att;
}

function AttachmentYearInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft !== null ? draft : String(value);

  const commit = (val: string) => {
    const num = Number(val.trim());
    if (!isNaN(num) && val.trim() !== '') {
      onCommit(num);
    }
    setDraft(null);
  };

  return (
    <input
      type="text"
      value={display}
      className="year-input"
      style={{ width: '50px' }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value); }}
    />
  );
}

interface Props {
  spanId: string;
  causalImpacts: CausalImpact[];
  allSpans: Span[];
  dispatch: React.Dispatch<Action>;
}

function CausalImpactRow({ ci, ownerSpanId, otherSpans, dispatch, incoming }: {
  ci: CausalImpact;
  ownerSpanId: string;
  otherSpans: Span[];
  dispatch: React.Dispatch<Action>;
  incoming?: { fromSpanTitle: string };
}) {
  const updateAttachment = (field: 'sourceAttachment' | 'targetAttachment', value: AttachmentPoint) => {
    dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId: ownerSpanId, impactId: ci.id, updates: { [field]: value } });
  };

  return (
    <div className="causal-impact-row">
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
        {incoming ? (
          <span style={{ fontSize: '11px', color: '#aaa', fontStyle: 'italic' }}>from: {incoming.fromSpanTitle}</span>
        ) : (
          <TargetCombobox
            value={ci.targetSpanId}
            spans={otherSpans}
            onSelect={(targetSpanId) =>
              dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId: ownerSpanId, impactId: ci.id, updates: { targetSpanId } })
            }
          />
        )}
        <select
          value={attachmentSelectValue(ci.sourceAttachment)}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'year') {
              updateAttachment('sourceAttachment', new Date().getFullYear());
            } else {
              updateAttachment('sourceAttachment', val as 'start' | 'middle' | 'end');
            }
          }}
        >
          <option value="start">From: start</option>
          <option value="middle">From: middle</option>
          <option value="end">From: end</option>
          <option value="year">From: year</option>
        </select>
        {typeof ci.sourceAttachment === 'number' && (
          <AttachmentYearInput
            value={ci.sourceAttachment}
            onCommit={(num) => updateAttachment('sourceAttachment', num)}
          />
        )}
        <select
          value={attachmentSelectValue(ci.targetAttachment)}
          onChange={(e) => {
            const val = e.target.value;
            if (val === 'year') {
              updateAttachment('targetAttachment', new Date().getFullYear());
            } else {
              updateAttachment('targetAttachment', val as 'start' | 'middle' | 'end');
            }
          }}
        >
          <option value="start">To: start</option>
          <option value="middle">To: middle</option>
          <option value="end">To: end</option>
          <option value="year">To: year</option>
        </select>
        {typeof ci.targetAttachment === 'number' && (
          <AttachmentYearInput
            value={ci.targetAttachment}
            onCommit={(num) => updateAttachment('targetAttachment', num)}
          />
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '11px' }}>
          <input
            type="checkbox"
            checked={ci.bidirectional ?? false}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId: ownerSpanId, impactId: ci.id, updates: { bidirectional: e.target.checked } })
            }
          />
          Bidir
        </label>
        <button className="remove-btn" onClick={() => dispatch({ type: 'REMOVE_CAUSAL_IMPACT', spanId: ownerSpanId, impactId: ci.id })}>
          ×
        </button>
      </div>
      <AnnotationInput
        value={ci.annotation}
        onChange={(val) =>
          dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId: ownerSpanId, impactId: ci.id, updates: { annotation: val } })
        }
      />
    </div>
  );
}

export function CausalImpactEditor({ spanId, causalImpacts, allSpans, dispatch }: Props) {
  const otherSpans = allSpans.filter((s) => s.id !== spanId);

  // Find incoming bidirectional arrows from other spans targeting this span
  const incomingBidir: { ci: CausalImpact; fromSpan: Span }[] = [];
  for (const s of allSpans) {
    if (s.id === spanId) continue;
    for (const ci of s.causalImpacts) {
      if (ci.bidirectional && ci.targetSpanId === spanId) {
        incomingBidir.push({ ci, fromSpan: s });
      }
    }
  }

  return (
    <div className="causal-impacts">
      <div className="sub-section-header">
        <span>Causal Impacts</span>
        <button onClick={() => dispatch({ type: 'ADD_CAUSAL_IMPACT', spanId })}>+ Add</button>
      </div>
      {causalImpacts.map((ci) => (
        <CausalImpactRow
          key={ci.id}
          ci={ci}
          ownerSpanId={spanId}
          otherSpans={otherSpans}
          dispatch={dispatch}
        />
      ))}
      {incomingBidir.map(({ ci, fromSpan }) => (
        <CausalImpactRow
          key={ci.id}
          ci={ci}
          ownerSpanId={fromSpan.id}
          otherSpans={otherSpans}
          dispatch={dispatch}
          incoming={{ fromSpanTitle: fromSpan.title }}
        />
      ))}
    </div>
  );
}
