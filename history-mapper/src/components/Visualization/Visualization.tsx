import type { Span } from '../../types';
import { renderTimeline, computeLayout, type RenderResult } from './renderTimeline';
import { getYearExtent, createYearScale } from '../../utils/yearScale';
import { NUM_COLUMNS, COL_WIDTH, SPAN_WIDTH, type LayoutSpan } from './layout';
import { useRef, useEffect, useState } from 'react';

const CURRENT_YEAR = new Date().getFullYear();
const ONGOING_OVERFLOW_PX = 15;

function xToColumn(x: number): number {
  return Math.round(x / COL_WIDTH + (NUM_COLUMNS - 1) / 2);
}

function columnToX(col: number): number {
  return (col - (NUM_COLUMNS - 1) / 2) * COL_WIDTH;
}

interface PlacedSpan {
  top: number;
  bottom: number;
  column: number;
}

function verticalOverlap(a: { top: number; bottom: number }, b: { top: number; bottom: number }): boolean {
  return a.top < b.bottom && b.top < a.bottom;
}

/**
 * Find the first column (0..maxCol) where this span fits without overlapping
 * any occupied span. Returns -1 if none found.
 */
function findFreeColumn(top: number, bottom: number, colOcc: PlacedSpan[][], maxCol: number): number {
  for (let c = 0; c <= maxCol; c++) {
    let fits = true;
    for (const occ of colOcc[c] ?? []) {
      if (verticalOverlap({ top, bottom }, occ)) { fits = false; break; }
    }
    if (fits) return c;
  }
  return -1;
}

/**
 * Incrementally update layout: keep column assignments from previous layout,
 * recompute y/height from current spans, and find valid columns for new or
 * displaced spans.
 */
function updateLayoutWithCurrentSpans(
  prevLayout: LayoutSpan[],
  currentSpans: Span[],
  height: number
): LayoutSpan[] {
  const yScale = createYearScale(currentSpans, height);

  // Map span ID → previous column
  const prevColById = new Map<string, number>();
  for (const ls of prevLayout) {
    prevColById.set(ls.span.id, xToColumn(ls.x));
  }

  // Compute pixel extents for all current spans
  interface SpanInfo {
    span: Span;
    top: number;
    bottom: number;
    height: number;
  }
  const spanInfos: SpanInfo[] = currentSpans.map(span => {
    const endYear = span.endYear === 'ongoing' ? CURRENT_YEAR : span.endYear;
    const topPx = yScale(endYear);
    const bottomPx = yScale(span.startYear);
    const h = Math.max(bottomPx - topPx, 4);
    const adjustedTop = span.endYear === 'ongoing' ? topPx - ONGOING_OVERFLOW_PX : topPx;
    const adjustedHeight = span.endYear === 'ongoing' ? h + ONGOING_OVERFLOW_PX : h;
    return { span, top: adjustedTop, bottom: adjustedTop + adjustedHeight, height: adjustedHeight };
  });

  // Phase 1: Place spans that have a previous column and still fit there
  const colOcc: PlacedSpan[][] = [];
  const ensureCol = (c: number) => { while (colOcc.length <= c) colOcc.push([]); };

  const placed = new Map<string, number>(); // span ID → column
  const needsPlacement: number[] = []; // indices into spanInfos

  for (let i = 0; i < spanInfos.length; i++) {
    const info = spanInfos[i];
    const prevCol = prevColById.get(info.span.id);
    if (prevCol !== undefined) {
      ensureCol(prevCol);
      let fits = true;
      for (const occ of colOcc[prevCol]) {
        if (verticalOverlap(info, occ)) { fits = false; break; }
      }
      if (fits) {
        colOcc[prevCol].push({ top: info.top, bottom: info.bottom, column: prevCol });
        placed.set(info.span.id, prevCol);
        continue;
      }
    }
    needsPlacement.push(i);
  }

  // Phase 2: Place remaining spans (new or displaced) in first available column
  for (const idx of needsPlacement) {
    const info = spanInfos[idx];
    const maxCol = Math.max(colOcc.length, NUM_COLUMNS) - 1;
    let col = findFreeColumn(info.top, info.bottom, colOcc, maxCol);
    if (col === -1) {
      // No room — add a new column
      col = colOcc.length;
    }
    ensureCol(col);
    colOcc[col].push({ top: info.top, bottom: info.bottom, column: col });
    placed.set(info.span.id, col);
  }

  // Build result
  return spanInfos.map(info => ({
    span: info.span,
    x: columnToX(placed.get(info.span.id)!),
    y: info.top,
    width: SPAN_WIDTH,
    height: info.height,
  }));
}

const LAYOUT_CACHE_KEY = 'history-mapper-layout-columns';

/** Save column assignments (span ID → column) to localStorage */
function saveColumnCache(layout: LayoutSpan[]) {
  const columns: Record<string, number> = {};
  for (const ls of layout) {
    columns[ls.span.id] = xToColumn(ls.x);
  }
  try { localStorage.setItem(LAYOUT_CACHE_KEY, JSON.stringify(columns)); } catch {}
}

/** Load cached column assignments from localStorage */
function loadColumnCache(): Map<string, number> | null {
  try {
    const raw = localStorage.getItem(LAYOUT_CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, number>;
    return new Map(Object.entries(obj).map(([k, v]) => [k, v]));
  } catch { return null; }
}

const MIN_PX_PER_YEAR = 14;
const AXIS_MARGIN = 45;
const LABEL_MARGIN = 120;
const MIN_SVG_WIDTH = NUM_COLUMNS * COL_WIDTH + AXIS_MARGIN + LABEL_MARGIN;

interface Props {
  spans: Span[];
  layoutKey?: number;
  onSpanClick?: (spanId: string) => void;
  selectedSpanId?: string | null;
  selectionSeq?: number;
}

export function Visualization({ spans, layoutKey, onSpanClick, selectedSpanId, selectionSeq }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHeight, setSvgHeight] = useState(800);
  const onSpanClickRef = useRef(onSpanClick);
  onSpanClickRef.current = onSpanClick;
  const renderResultRef = useRef<RenderResult | null>(null);
  const layoutRef = useRef<LayoutSpan[] | null>(null);

  // Calculate SVG height: enough to fit all spans at a readable density
  useEffect(() => {
    const containerHeight = containerRef.current?.clientHeight ?? 600;
    const [minYear, maxYear] = getYearExtent(spans);
    const yearRange = maxYear - minYear;
    const contentHeight = yearRange * MIN_PX_PER_YEAR + 50;
    setSvgHeight(Math.max(containerHeight, contentHeight));
  }, [spans]);

  // Recompute layout only when layoutKey changes (Re-layout button)
  const prevLayoutKey = useRef(layoutKey);
  useEffect(() => {
    if (prevLayoutKey.current !== layoutKey) {
      prevLayoutKey.current = layoutKey;
      if (spans.length > 0) {
        layoutRef.current = computeLayout(spans, svgHeight, layoutKey);
        saveColumnCache(layoutRef.current);
      }
    }
  }, [layoutKey]);

  useEffect(() => {
    if (svgRef.current && tooltipRef.current) {
      // On first render with data, try to restore from localStorage
      if (!layoutRef.current && spans.length > 0) {
        const cached = loadColumnCache();
        if (cached && cached.size > 0) {
          // Build a synthetic layout from cached columns
          layoutRef.current = spans.map(span => ({
            span,
            x: columnToX(cached.get(span.id) ?? 0),
            y: 0, width: SPAN_WIDTH, height: 0,
          }));
        } else {
          layoutRef.current = computeLayout(spans, svgHeight, layoutKey);
          saveColumnCache(layoutRef.current);
        }
      }

      if (spans.length === 0) {
        layoutRef.current = null;
      }

      // Update span data in layout positions (keep column positions, recalc y from current spans)
      const layout = layoutRef.current
        ? updateLayoutWithCurrentSpans(layoutRef.current, spans, svgHeight)
        : [];

      // Update layoutRef and persist column assignments
      if (layout.length > 0) {
        layoutRef.current = layout;
        saveColumnCache(layout);
      }

      const result = renderTimeline(svgRef.current, spans, tooltipRef.current, (spanId) => {
        onSpanClickRef.current?.(spanId);
      }, containerRef.current, layout);
      renderResultRef.current = result ?? null;
      return result?.cleanup ?? undefined;
    }
  }, [spans, svgHeight, layoutKey]);

  // When selectedSpanId changes (from DataPanel click), highlight and scroll
  useEffect(() => {
    if (selectedSpanId && renderResultRef.current) {
      renderResultRef.current.selectSpan(selectedSpanId);
    }
  }, [selectedSpanId, selectionSeq]);

  // Re-render on resize
  useEffect(() => {
    const handleResize = () => {
      const containerHeight = containerRef.current?.clientHeight ?? 600;
      const [minYear, maxYear] = getYearExtent(spans);
      const yearRange = maxYear - minYear;
      const contentHeight = yearRange * MIN_PX_PER_YEAR + 50;
      setSvgHeight(Math.max(containerHeight, contentHeight));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [spans]);

  const scale = 0.5;
  return (
    <div className="visualization" ref={containerRef}>
      <div style={{ width: MIN_SVG_WIDTH * scale, height: svgHeight * scale, overflow: 'hidden' }}>
        <svg ref={svgRef} width={MIN_SVG_WIDTH} height={svgHeight} style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} />
      </div>
      <div ref={tooltipRef} className="tooltip" />
    </div>
  );
}
