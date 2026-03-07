export type SpanType = 'Economics' | 'Technology' | 'Politics' | 'Culture' | 'Subculture';

export interface SubEvent {
  id: string;
  date: number; // year
  label: string;
}

export type AttachmentPoint = 'start' | 'middle' | 'end' | number;

export interface CausalImpact {
  id: string;
  targetSpanId: string;
  sourceAttachment: AttachmentPoint;
  targetAttachment: AttachmentPoint;
  annotation: string;
}

export interface Span {
  id: string;
  title: string;
  startYear: number;
  endYear: number | 'ongoing';
  spanType: SpanType;
  subEvents: SubEvent[];
  causalImpacts: CausalImpact[];
}

export type AppState = {
  spans: Span[];
};

export type Action =
  | { type: 'ADD_SPAN' }
  | { type: 'REMOVE_SPAN'; id: string }
  | { type: 'UPDATE_SPAN'; id: string; updates: Partial<Omit<Span, 'id'>> }
  | { type: 'ADD_SUB_EVENT'; spanId: string }
  | { type: 'REMOVE_SUB_EVENT'; spanId: string; subEventId: string }
  | { type: 'UPDATE_SUB_EVENT'; spanId: string; subEventId: string; updates: Partial<Omit<SubEvent, 'id'>> }
  | { type: 'ADD_CAUSAL_IMPACT'; spanId: string }
  | { type: 'REMOVE_CAUSAL_IMPACT'; spanId: string; impactId: string }
  | { type: 'UPDATE_CAUSAL_IMPACT'; spanId: string; impactId: string; updates: Partial<Omit<CausalImpact, 'id'>> }
  | { type: 'REORDER_BY_START_DATE'; direction: 'asc' | 'desc' }
  | { type: 'LOAD_STATE'; state: AppState };
