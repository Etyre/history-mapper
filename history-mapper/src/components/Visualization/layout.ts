import type { Span } from '../../types';
import { createYearScale } from '../../utils/yearScale';

export interface LayoutSpan {
  span: Span;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SPAN_WIDTH = 80;
const COL_PADDING = 16;
export const COL_WIDTH = SPAN_WIDTH + COL_PADDING;
export const NUM_COLUMNS = 15;
const CURRENT_YEAR = new Date().getFullYear();
const ONGOING_OVERFLOW_PX = 15;

interface LayoutItem {
  span: Span;
  index: number;
  top: number;
  bottom: number;
  height: number;
  column: number;
}

// Check if two vertical ranges overlap (with 1-year buffer in pixels)
const OVERLAP_BUFFER_PX = 25; // ~1 year at MIN_PX_PER_YEAR

function verticalOverlap(a: LayoutItem, b: LayoutItem): boolean {
  return a.top < b.bottom + OVERLAP_BUFFER_PX && b.top < a.bottom + OVERLAP_BUFFER_PX;
}

// Count how many placed spans an arrow from colA to colB would cross,
// considering only spans whose vertical extent overlaps the arrow's vertical range
function countCrossings(
  colA: number,
  colB: number,
  arrowTop: number,
  arrowBottom: number,
  placed: LayoutItem[]
): number {
  if (colA === colB) return 0;
  const minCol = Math.min(colA, colB);
  const maxCol = Math.max(colA, colB);
  let crossings = 0;
  for (const p of placed) {
    if (p.column !== -1 && p.column > minCol && p.column < maxCol) {
      // Check vertical overlap with arrow
      if (p.top < arrowBottom && arrowTop < p.bottom) {
        crossings++;
      }
    }
  }
  return crossings;
}

export function layoutSpans(spans: Span[], svgHeight: number, seed: number = 0): LayoutSpan[] {
  if (spans.length === 0) return [];

  const yScale = createYearScale(spans, svgHeight);

  // Compute pixel extents for each span
  const items: LayoutItem[] = spans.map((s, i) => {
    const startPx = yScale(s.startYear);
    const endPx = yScale(s.endYear === 'ongoing' ? CURRENT_YEAR : s.endYear);
    const isOngoing = s.endYear === 'ongoing';
    const topPx = Math.min(startPx, endPx) - (isOngoing ? ONGOING_OVERFLOW_PX : 0);
    const h = Math.max(Math.abs(endPx - startPx) + (isOngoing ? ONGOING_OVERFLOW_PX : 0), 10);
    return { span: s, index: i, top: topPx, bottom: topPx + h, height: h, column: -1 };
  });

  // Collect all edges (arrows) as pairs of item indices
  const edges: { src: LayoutItem; tgt: LayoutItem }[] = [];
  for (const item of items) {
    for (const ci of item.span.causalImpacts) {
      const target = items.find((it) => it.span.id === ci.targetSpanId);
      if (target) {
        edges.push({ src: item, tgt: target });
      }
    }
  }

  // Count actual arrow-through-span crossings for the current column assignments
  function countTotalCrossings(): number {
    let crossings = 0;
    for (const e of edges) {
      const minCol = Math.min(e.src.column, e.tgt.column);
      const maxCol = Math.max(e.src.column, e.tgt.column);
      const arrowTop = Math.min(e.src.top, e.tgt.top);
      const arrowBottom = Math.max(e.src.bottom, e.tgt.bottom);
      for (const item of items) {
        if (item.index !== e.src.index && item.index !== e.tgt.index &&
            item.column > minCol && item.column < maxCol &&
            item.top < arrowBottom && arrowTop < item.bottom) {
          crossings++;
        }
      }
    }
    return crossings;
  }

  // Compute spacing score: reward minimum distance to nearest vertically-overlapping neighbor
  function spacingScore(): number {
    let score = 0;
    for (let i = 0; i < items.length; i++) {
      let minDist = NUM_COLUMNS;
      let hasNeighbor = false;
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        if (verticalOverlap(items[i], items[j])) {
          hasNeighbor = true;
          const dist = Math.abs(items[i].column - items[j].column);
          if (dist < minDist) minDist = dist;
        }
      }
      if (hasNeighbor) score += minDist;
    }
    return score;
  }

  // Combined score: minimize crossings, maximize spacing
  function globalScore(): number {
    return countTotalCrossings() * 100 - spacingScore() * 1;
  }

  // Place items greedily given an ordering
  function greedyPlace(order: LayoutItem[]): void {
    const colOcc: LayoutItem[][] = Array.from({ length: NUM_COLUMNS }, () => []);
    for (const item of items) item.column = -1;

    for (const item of order) {
      let bestCol = 0;
      let bestScore = Infinity;

      for (let c = 0; c < NUM_COLUMNS; c++) {
        // Check if column is free
        let canFit = true;
        for (const occ of colOcc[c]) {
          if (verticalOverlap(item, occ)) { canFit = false; break; }
        }
        if (!canFit) continue;

        item.column = c;
        const score = globalScore();
        if (score < bestScore) {
          bestScore = score;
          bestCol = c;
        }
      }

      item.column = bestCol;
      colOcc[bestCol].push(item);
    }
  }

  // Refinement: single moves + swaps
  function refine(maxPasses: number): void {
    const colOcc: LayoutItem[][] = Array.from({ length: NUM_COLUMNS }, () => []);
    for (const item of items) {
      colOcc[item.column].push(item);
    }

    for (let pass = 0; pass < maxPasses; pass++) {
      let improved = false;

      // Single moves
      for (const item of items) {
        const oldCol = item.column;
        const scoreBefore = globalScore();

        colOcc[oldCol].splice(colOcc[oldCol].indexOf(item), 1);

        let bestCol = oldCol;
        let bestScore = scoreBefore;

        for (let c = 0; c < NUM_COLUMNS; c++) {
          let canPlace = true;
          for (const occ of colOcc[c]) {
            if (verticalOverlap(item, occ)) { canPlace = false; break; }
          }
          if (!canPlace) continue;

          item.column = c;
          const score = globalScore();
          if (score < bestScore) {
            bestScore = score;
            bestCol = c;
          }
        }

        item.column = bestCol;
        colOcc[bestCol].push(item);
        if (bestCol !== oldCol) improved = true;
      }

      // Swaps
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          const a = items[i];
          const b = items[j];
          if (a.column === b.column) continue;

          const scoreBefore = globalScore();
          const aCol = a.column;
          const bCol = b.column;

          colOcc[aCol].splice(colOcc[aCol].indexOf(a), 1);
          colOcc[bCol].splice(colOcc[bCol].indexOf(b), 1);

          a.column = bCol;
          b.column = aCol;

          let valid = true;
          for (const occ of colOcc[bCol]) {
            if (verticalOverlap(a, occ)) { valid = false; break; }
          }
          if (valid) {
            for (const occ of colOcc[aCol]) {
              if (verticalOverlap(b, occ)) { valid = false; break; }
            }
          }

          if (valid) {
            colOcc[bCol].push(a);
            colOcc[aCol].push(b);
            if (globalScore() < scoreBefore) {
              improved = true;
            } else {
              colOcc[bCol].splice(colOcc[bCol].indexOf(a), 1);
              colOcc[aCol].splice(colOcc[aCol].indexOf(b), 1);
              a.column = aCol;
              b.column = bCol;
              colOcc[aCol].push(a);
              colOcc[bCol].push(b);
            }
          } else {
            a.column = aCol;
            b.column = bCol;
            colOcc[aCol].push(a);
            colOcc[bCol].push(b);
          }
        }
      }

      if (!improved) break;
    }
  }

  // Build BFS placement order (longest first, then descendants)
  const childrenOf = new Map<number, number[]>();
  for (const item of items) childrenOf.set(item.index, []);
  for (const e of edges) {
    childrenOf.get(e.src.index)!.push(e.tgt.index);
  }

  function bfsOrder(seedOrder: LayoutItem[]): LayoutItem[] {
    const vis = new Set<number>();
    const order: LayoutItem[] = [];
    for (const seed of seedOrder) {
      if (vis.has(seed.index)) continue;
      const queue = [seed];
      vis.add(seed.index);
      while (queue.length > 0) {
        const current = queue.shift()!;
        order.push(current);
        const children = (childrenOf.get(current.index) ?? [])
          .filter((idx) => !vis.has(idx));
        for (const childIdx of children) {
          vis.add(childIdx);
          queue.push(items[childIdx]);
        }
      }
    }
    return order;
  }

  // Simple seeded shuffle for deterministic random restarts
  function shuffle(arr: LayoutItem[], seed: number): LayoutItem[] {
    const result = [...arr];
    let s = seed;
    for (let i = result.length - 1; i > 0; i--) {
      s = (s * 1664525 + 1013904223) & 0x7fffffff;
      const j = s % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // Try multiple initial orderings and keep the best result
  const byHeight = [...items].sort((a, b) => b.height - a.height);
  let bestAssignment: number[] = [];
  let bestGlobalScore = Infinity;

  const orderings: LayoutItem[][] = [
    bfsOrder(byHeight),  // original heuristic
  ];
  // Add random restart orderings (seed offset varies with layoutSeed so Re-layout explores new arrangements)
  const seedOffset = seed * 15;
  for (let s = 1; s <= 15; s++) {
    orderings.push(shuffle(items, seedOffset + s));
  }

  // Phase 1: light refinement (1 pass) on all orderings to preserve diversity
  for (const order of orderings) {
    greedyPlace(order);
    refine(1);
    const score = globalScore();
    if (score < bestGlobalScore) {
      bestGlobalScore = score;
      bestAssignment = items.map((it) => it.column);
    }
  }

  // Phase 2: heavy refinement on the best candidate found
  for (let i = 0; i < items.length; i++) {
    items[i].column = bestAssignment[i];
  }
  refine(10);
  const finalScore = globalScore();
  if (finalScore < bestGlobalScore) {
    bestGlobalScore = finalScore;
    bestAssignment = items.map((it) => it.column);
  }

  // Restore best assignment
  for (let i = 0; i < items.length; i++) {
    items[i].column = bestAssignment[i];
  }


  return items.map((item) => ({
    span: item.span,
    x: (item.column - (NUM_COLUMNS - 1) / 2) * COL_WIDTH,
    y: item.top,
    width: SPAN_WIDTH,
    height: item.height,
  }));
}
