import type { CausalImpact, AttachmentPoint, Span, Action } from '../../types';
import React from 'react';

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

function attachmentYearValue(att: AttachmentPoint): string {
  return typeof att === 'number' ? String(att) : '';
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
          <select
            value={ci.targetSpanId}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_CAUSAL_IMPACT', spanId: ownerSpanId, impactId: ci.id, updates: { targetSpanId: e.target.value } })
            }
          >
            <option value="">-- Target --</option>
            {otherSpans.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
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
          <input
            type="text"
            value={attachmentYearValue(ci.sourceAttachment)}
            className="year-input"
            style={{ width: '50px' }}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (!isNaN(num) && e.target.value.trim() !== '') {
                updateAttachment('sourceAttachment', num);
              }
            }}
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
          <input
            type="text"
            value={attachmentYearValue(ci.targetAttachment)}
            className="year-input"
            style={{ width: '50px' }}
            onChange={(e) => {
              const num = Number(e.target.value);
              if (!isNaN(num) && e.target.value.trim() !== '') {
                updateAttachment('targetAttachment', num);
              }
            }}
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
