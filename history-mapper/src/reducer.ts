import type { AppState, Action, Span } from './types';

function generateId(): string {
  return crypto.randomUUID();
}

function newSpan(): Span {
  return {
    id: generateId(),
    title: 'New Span',
    startYear: 2000,
    endYear: 2010,
    spanType: 'Politics',
    subEvents: [],
    causalImpacts: [],
  };
}

export const initialState: AppState = {
  spans: [],
};

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'ADD_SPAN':
      return { ...state, spans: [newSpan(), ...state.spans] };

    case 'REMOVE_SPAN':
      return {
        ...state,
        spans: state.spans
          .filter((s) => s.id !== action.id)
          .map((s) => ({
            ...s,
            causalImpacts: s.causalImpacts.filter((ci) => ci.targetSpanId !== action.id),
            continuesAs: s.continuesAs === action.id ? undefined : s.continuesAs,
          })),
      };

    case 'UPDATE_SPAN':
      return {
        ...state,
        spans: state.spans.map((s) => (s.id === action.id ? { ...s, ...action.updates } : s)),
      };

    case 'ADD_SUB_EVENT':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? { ...s, subEvents: [...s.subEvents, { id: generateId(), date: s.startYear, label: '' }] }
            : s
        ),
      };

    case 'REMOVE_SUB_EVENT':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? { ...s, subEvents: s.subEvents.filter((se) => se.id !== action.subEventId) }
            : s
        ),
      };

    case 'UPDATE_SUB_EVENT':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? {
                ...s,
                subEvents: s.subEvents.map((se) =>
                  se.id === action.subEventId ? { ...se, ...action.updates } : se
                ),
              }
            : s
        ),
      };

    case 'ADD_CAUSAL_IMPACT':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? {
                ...s,
                causalImpacts: [
                  ...s.causalImpacts,
                  { id: generateId(), targetSpanId: '', sourceAttachment: 'middle', targetAttachment: 'middle', annotation: '' },
                ],
              }
            : s
        ),
      };

    case 'REMOVE_CAUSAL_IMPACT':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? { ...s, causalImpacts: s.causalImpacts.filter((ci) => ci.id !== action.impactId) }
            : s
        ),
      };

    case 'UPDATE_CAUSAL_IMPACT':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? {
                ...s,
                causalImpacts: s.causalImpacts.map((ci) =>
                  ci.id === action.impactId ? { ...ci, ...action.updates } : ci
                ),
              }
            : s
        ),
      };

    case 'SET_CONTINUES_AS':
      return {
        ...state,
        spans: state.spans.map((s) =>
          s.id === action.spanId
            ? { ...s, continuesAs: action.continuesAsId ?? undefined }
            : s
        ),
      };

    case 'REORDER_BY_START_DATE':
      return {
        ...state,
        spans: [...state.spans].sort((a, b) =>
          action.direction === 'asc' ? a.startYear - b.startYear : b.startYear - a.startYear
        ),
      };

    case 'LOAD_STATE': {
      // Backfill missing IDs on sub-events and causal impacts
      const spans = action.state.spans.map((s) => ({
        ...s,
        subEvents: s.subEvents.map((se) => se.id ? se : { ...se, id: generateId() }),
        causalImpacts: s.causalImpacts.map((ci) => ci.id ? ci : { ...ci, id: generateId() }),
      }));
      return { ...action.state, spans };
    }

    default:
      return state;
  }
}
