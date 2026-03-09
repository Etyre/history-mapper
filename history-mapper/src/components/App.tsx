import { useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { reducer, initialState } from '../reducer';
import type { AppState, Action } from '../types';
import { DataPanel } from './DataPanel/DataPanel';
import { Visualization } from './Visualization/Visualization';
import { exportStandaloneHtml } from './Visualization/exportHtml';

async function loadFromDisk(): Promise<AppState> {
  try {
    const res = await fetch('/api/data');
    if (res.ok) {
      const data = await res.json();
      if (data.spans && Array.isArray(data.spans)) {
        return data;
      }
    }
  } catch {
    // server not available
  }
  return initialState;
}

async function saveToDisk(state: AppState): Promise<void> {
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state, null, 2),
    });
  } catch {
    // server not available, silently fail
  }
}

interface UndoState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

type UndoAction = Action | { type: 'UNDO' } | { type: 'REDO' };

const MAX_HISTORY = 100;

function undoReducer(undoState: UndoState, action: UndoAction): UndoState {
  if (action.type === 'UNDO') {
    if (undoState.past.length === 0) return undoState;
    const previous = undoState.past[undoState.past.length - 1];
    return {
      past: undoState.past.slice(0, -1),
      present: previous,
      future: [undoState.present, ...undoState.future],
    };
  }

  if (action.type === 'REDO') {
    if (undoState.future.length === 0) return undoState;
    const next = undoState.future[0];
    return {
      past: [...undoState.past, undoState.present],
      present: next,
      future: undoState.future.slice(1),
    };
  }

  const newPresent = reducer(undoState.present, action);
  if (newPresent === undoState.present) return undoState;

  // LOAD_STATE shouldn't be undoable (it's the initial load)
  if (action.type === 'LOAD_STATE') {
    return { past: [], present: newPresent, future: [] };
  }

  const newPast = [...undoState.past, undoState.present];
  if (newPast.length > MAX_HISTORY) newPast.shift();

  return {
    past: newPast,
    present: newPresent,
    future: [],
  };
}

export default function App() {
  const [undoState, undoDispatch] = useReducer(undoReducer, {
    past: [],
    present: initialState,
    future: [],
  });
  const state = undoState.present;
  const loaded = useRef(false);
  const [layoutKey, setLayoutKey] = useState(0);
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null);
  const [selectionSeq, setSelectionSeq] = useState(0);

  const dispatch = useCallback((action: Action) => {
    undoDispatch(action);
  }, []);

  // Load from disk on mount
  useEffect(() => {
    loadFromDisk().then((saved) => {
      if (saved.spans.length > 0) {
        undoDispatch({ type: 'LOAD_STATE', state: saved });
      }
      loaded.current = true;
    });
  }, []);

  // Save to disk on every state change (after initial load)
  const lastSavedJson = useRef<string>('');
  useEffect(() => {
    if (loaded.current) {
      const json = JSON.stringify(state);
      lastSavedJson.current = json;
      saveToDisk(state);
    }
  }, [state]);

  // Poll for external file changes (e.g. from Claude editing data.json)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!loaded.current) return;
      try {
        const res = await fetch('/api/data');
        if (!res.ok) return;
        const json = await res.text();
        if (json !== lastSavedJson.current) {
          const data = JSON.parse(json);
          if (data.spans && Array.isArray(data.spans)) {
            lastSavedJson.current = json;
            undoDispatch({ type: 'LOAD_STATE', state: data });
          }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Ctrl+Z / Ctrl+Shift+Z keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          undoDispatch({ type: 'REDO' });
        } else {
          undoDispatch({ type: 'UNDO' });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>History Mapper</h1>
        <div className="header-actions">
          <button onClick={() => setLayoutKey((k) => k + 1)}>Re-layout</button>
          <button onClick={() => exportStandaloneHtml(state)}>Export Standalone HTML</button>
        </div>
      </header>
      <div className="app-body">
        <DataPanel state={state} dispatch={dispatch} selectedSpanId={selectedSpanId} onSpanSelect={(id) => {
          setSelectedSpanId(id);
          setSelectionSeq((s) => s + 1);
        }} />
        <Visualization spans={state.spans} layoutKey={layoutKey} onSpanClick={setSelectedSpanId} selectedSpanId={selectedSpanId} selectionSeq={selectionSeq} />
      </div>
    </div>
  );
}
