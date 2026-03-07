import type { SubEvent, Action } from '../../types';
import React from 'react';

interface Props {
  spanId: string;
  subEvents: SubEvent[];
  dispatch: React.Dispatch<Action>;
}

export function SubEventEditor({ spanId, subEvents, dispatch }: Props) {
  return (
    <div className="sub-events">
      <div className="sub-section-header">
        <span>Sub-events</span>
        <button onClick={() => dispatch({ type: 'ADD_SUB_EVENT', spanId })}>+ Add</button>
      </div>
      {subEvents.map((se) => (
        <div key={se.id} className="sub-event-row">
          <input
            type="number"
            value={se.date}
            onChange={(e) =>
              dispatch({ type: 'UPDATE_SUB_EVENT', spanId, subEventId: se.id, updates: { date: Number(e.target.value) } })
            }
            className="year-input"
          />
          <input
            type="text"
            value={se.label}
            placeholder="Label"
            onChange={(e) =>
              dispatch({ type: 'UPDATE_SUB_EVENT', spanId, subEventId: se.id, updates: { label: e.target.value } })
            }
            className="label-input"
          />
          <button className="remove-btn" onClick={() => dispatch({ type: 'REMOVE_SUB_EVENT', spanId, subEventId: se.id })}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
