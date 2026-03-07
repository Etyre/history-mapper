import type { CausalImpact, AttachmentPoint, Span, Action } from '../../types';
import React, { useState } from 'react';

function AnnotationInput({ value, onCommit }: { value: string; onCommit: (val: string) => void }) {
  const [draft, setDraft] = useState(value);
  // Sync draft when external value changes (e.g. undo/redo)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setDraft(value);
    setPrevValue(value);
  }
  return (
    <input
      type="text"
      value={draft}
      placeholder="Annotation"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
      className="annotation-input"
    />
  );
}

function attachmentSelectValue(att: AttachmentPoint): string {
  return typeof att === 'number' ? 'year' : att;
}

function attachmentYearValue(att: AttachmentPoint): string {
  return typeof att === 'number' ? String(att) : '';
}

interface Props {
  spanId: string;
  causalImpacts: CausalImpact[];
  allSpans: Span[];
  dispatch: React.Dispatch<Action>;
}

export function CausalImpactEditor({ spanId, causalImpacts, allSpans, dispatch }: Props) {
  const otherSpans = allSpans.filter((s) => s.id !== spanId);

  const updateAttachment = (impactId: string, field: 'sourceAttachment' | 'targetAttachment', value: AttachmentPoint) => {
    dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId, impactId, updates: { [field]: value } });
  };

  return (
    <div className="causal-impacts">
      <div className="sub-section-header">
        <span>Causal Impacts</span>
        <button onClick={() => dispatch({ type: 'ADD_CAUSAL_IMPACT', spanId })}>+ Add</button>
      </div>
      {causalImpacts.map((ci) => (
        <div key={ci.id} className="causal-impact-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
            <select
              value={ci.targetSpanId}
              onChange={(e) =>
                dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId, impactId: ci.id, updates: { targetSpanId: e.target.value } })
              }
            >
              <option value="">-- Target --</option>
              {otherSpans.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
            <select
              value={attachmentSelectValue(ci.sourceAttachment)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'year') {
                  updateAttachment(ci.id, 'sourceAttachment', new Date().getFullYear());
                } else {
                  updateAttachment(ci.id, 'sourceAttachment', val as 'start' | 'middle' | 'end');
                }
              }}
            >
              <option value="start">From: start</option>
              <option value="middle">From: middle</option>
              <option value="end">From: end</option>
              <option value="year">From: year</option>
            </select>
            {typeof ci.sourceAttachment === 'number' && (
              <input
                type="text"
                value={attachmentYearValue(ci.sourceAttachment)}
                className="year-input"
                style={{ width: '50px' }}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  if (!isNaN(num) && e.target.value.trim() !== '') {
                    updateAttachment(ci.id, 'sourceAttachment', num);
                  }
                }}
              />
            )}
            <select
              value={attachmentSelectValue(ci.targetAttachment)}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'year') {
                  updateAttachment(ci.id, 'targetAttachment', new Date().getFullYear());
                } else {
                  updateAttachment(ci.id, 'targetAttachment', val as 'start' | 'middle' | 'end');
                }
              }}
            >
              <option value="start">To: start</option>
              <option value="middle">To: middle</option>
              <option value="end">To: end</option>
              <option value="year">To: year</option>
            </select>
            {typeof ci.targetAttachment === 'number' && (
              <input
                type="text"
                value={attachmentYearValue(ci.targetAttachment)}
                className="year-input"
                style={{ width: '50px' }}
                onChange={(e) => {
                  const num = Number(e.target.value);
                  if (!isNaN(num) && e.target.value.trim() !== '') {
                    updateAttachment(ci.id, 'targetAttachment', num);
                  }
                }}
              />
            )}
            <button className="remove-btn" onClick={() => dispatch({ type: 'REMOVE_CAUSAL_IMPACT', spanId, impactId: ci.id })}>
              ×
            </button>
          </div>
          <AnnotationInput
            value={ci.annotation}
            onCommit={(val) =>
              dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId, impactId: ci.id, updates: { annotation: val } })
            }
          />
        </div>
      ))}
    </div>
  );
}
