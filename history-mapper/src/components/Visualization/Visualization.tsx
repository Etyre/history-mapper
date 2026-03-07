import type { Span } from '../../types';
import { renderTimeline } from './renderTimeline';
import { getYearExtent } from '../../utils/yearScale';
import { NUM_COLUMNS, COL_WIDTH } from './layout';
import { useRef, useEffect, useState } from 'react';

const MIN_PX_PER_YEAR = 25;
const AXIS_MARGIN = 45;
const LABEL_MARGIN = 120;
const MIN_SVG_WIDTH = NUM_COLUMNS * COL_WIDTH + AXIS_MARGIN + LABEL_MARGIN;

interface Props {
  spans: Span[];
  layoutKey?: number;
  onSpanClick?: (spanId: string) => void;
}

export function Visualization({ spans, layoutKey, onSpanClick }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgHeight, setSvgHeight] = useState(800);
  const onSpanClickRef = useRef(onSpanClick);
  onSpanClickRef.current = onSpanClick;

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
      renderTimeline(svgRef.current, spans, tooltipRef.current, (spanId) => {
        onSpanClickRef.current?.(spanId);
      }, layoutKey);
    }
  }, [spans, svgHeight, layoutKey]);

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

  return (
    <div className="visualization" ref={containerRef}>
      <svg ref={svgRef} style={{ minWidth: MIN_SVG_WIDTH }} width="100%" height={svgHeight} />
      <div ref={tooltipRef} className="tooltip" />
    </div>
  );
}
