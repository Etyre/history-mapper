import * as d3 from 'd3';
import type { Span } from '../types';

const CURRENT_YEAR = new Date().getFullYear();

export function getYearExtent(spans: Span[]): [number, number] {
  if (spans.length === 0) return [1900, CURRENT_YEAR];
  let min = Infinity;
  let max = -Infinity;
  for (const s of spans) {
    if (s.startYear < min) min = s.startYear;
    const end = s.endYear === 'ongoing' ? CURRENT_YEAR : s.endYear;
    if (end > max) max = end;
  }
  return [min - 5, Math.min(max + 5, CURRENT_YEAR)];
}

export function createYearScale(spans: Span[], height: number): d3.ScaleLinear<number, number> {
  const [minYear, maxYear] = getYearExtent(spans);
  return d3.scaleLinear().domain([maxYear, minYear]).range([30, height - 20]);
}
