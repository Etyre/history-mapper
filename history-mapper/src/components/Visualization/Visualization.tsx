import type { Span } from '../../types';
import { renderTimeline, type RenderResult } from './renderTimeline';
import { getYearExtent } from '../../utils/yearScale';
import { NUM_COLUMNS, COL_WIDTH } from './layout';
import { useRef, useEffect, useState } from 'react';

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

  // Calculate SVG height: enough to fit all spans at a readable density
  useEffect(() => {
    const containerHeight = containerRef.current?.clientHeight ?? 600;
    const [minYear, maxYear] = getYearExtent(spans);
    const yearRange = maxYear - minYear;
    const contentHeight = yearRange * MIN_PX_PER_YEAR + 50;
    setSvgHeight(Math.max(containerHeight, contentHeight));
  }, [spans]);

  useEffect(() => {
    if (svgRef.current && tooltipRef.current) {
      const result = renderTimeline(svgRef.current, spans, tooltipRef.current, (spanId) => {
        onSpanClickRef.current?.(spanId);
      }, layoutKey, containerRef.current);
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
