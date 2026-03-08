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
export const NUM_COLUMNS = 30;
const CURRENT_YEAR = new Date().getFullYear();
const ONGOING_OVERFLOW_PX = 15;

interface LayoutItem {
  // For super-spans, `span` is the first span in the chain (used only for index tracking)
  span: Span;
  index: number;
  top: number;
  bottom: number;
  height: number;
  column: number;
  // Member span indices (for super-spans); empty for independent spans
  memberIndices: number[];
}

// Check if two vertical ranges overlap (with 1-year buffer in pixels)
const OVERLAP_BUFFER_PX = 25; // ~1 year at MIN_PX_PER_YEAR

function verticalOverlap(a: LayoutItem, b: LayoutItem): boolean {
  return a.top < b.bottom + OVERLAP_BUFFER_PX && b.top < a.bottom + OVERLAP_BUFFER_PX;
}

// Build continuation chains from spans' continuesAs links.
// Returns arrays of span indices, each representing a chain in order.
function buildChains(spans: Span[]): number[][] {
  // Map span ID to index
  const idToIndex = new Map<string, number>();
  for (let i = 0; i < spans.length; i++) idToIndex.set(spans[i].id, i);

  // Find which spans are pointed to (i.e. are successors)
  const successorSet = new Set<number>();
  const continuesAsIndex = new Map<number, number>(); // index -> successor index
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i];
    if (s.continuesAs) {
      const tgtIdx = idToIndex.get(s.continuesAs);
      if (tgtIdx !== undefined) {
        continuesAsIndex.set(i, tgtIdx);
        successorSet.add(tgtIdx);
      }
    }
  }

  // Chain heads are spans that have a continuesAs but are not themselves a successor
  const visited = new Set<number>();
  const chains: number[][] = [];

  for (let i = 0; i < spans.length; i++) {
    if (visited.has(i)) continue;
    if (!continuesAsIndex.has(i) && !successorSet.has(i)) continue; // independent span
    if (successorSet.has(i)) continue; // not a chain head

    // Walk the chain from head
    const chain: number[] = [];
    let current: number | undefined = i;
    while (current !== undefined && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      current = continuesAsIndex.get(current);
    }
    if (chain.length > 1) {
      chains.push(chain);
    }
  }

  return chains;
}

export function layoutSpans(spans: Span[], svgHeight: number, seed: number = 0): LayoutSpan[] {
  if (spans.length === 0) return [];

  const yScale = createYearScale(spans, svgHeight);

  // Compute pixel extents for each span
  interface SpanExtent {
    span: Span;
    index: number;
    top: number;
    bottom: number;
    height: number;
  }
  const extents: SpanExtent[] = spans.map((s, i) => {
    const startPx = yScale(s.startYear);
    const endPx = yScale(s.endYear === 'ongoing' ? CURRENT_YEAR : s.endYear);
    const isOngoing = s.endYear === 'ongoing';
    const topPx = Math.min(startPx, endPx) - (isOngoing ? ONGOING_OVERFLOW_PX : 0);
    const h = Math.max(Math.abs(endPx - startPx) + (isOngoing ? ONGOING_OVERFLOW_PX : 0), 10);
    return { span: s, index: i, top: topPx, bottom: topPx + h, height: h };
  });

  // Build continuation chains
  const chains = buildChains(spans);
  const inChain = new Set<number>();
  for (const chain of chains) {
    for (const idx of chain) inChain.add(idx);
  }

  // Build layout items: super-spans for chains, individual items for independent spans
  const items: LayoutItem[] = [];
  // Map from original span index to layout item index
  const spanToItemIndex = new Map<number, number>();

  // Add super-spans for chains
  for (const chain of chains) {
    const memberExtents = chain.map((idx) => extents[idx]);
    const top = Math.min(...memberExtents.map((e) => e.top));
    const bottom = Math.max(...memberExtents.map((e) => e.bottom));
    const itemIndex = items.length;
    items.push({
      span: extents[chain[0]].span,
      index: itemIndex,
      top,
      bottom,
      height: bottom - top,
      column: -1,
      memberIndices: chain,
    });
    for (const idx of chain) spanToItemIndex.set(idx, itemIndex);
  }

  // Add independent spans
  for (let i = 0; i < extents.length; i++) {
    if (inChain.has(i)) continue;
    const e = extents[i];
    const itemIndex = items.length;
    items.push({
      span: e.span,
      index: itemIndex,
      top: e.top,
      bottom: e.bottom,
      height: e.height,
      column: -1,
      memberIndices: [i],
    });
    spanToItemIndex.set(i, itemIndex);
  }

  // Collect all edges (arrows) as pairs of item indices (deduplicated for super-spans)
  const edgeSet = new Set<string>();
  const edges: { src: LayoutItem; tgt: LayoutItem }[] = [];
  for (const ext of extents) {
    for (const ci of ext.span.causalImpacts) {
      const tgtSpanIdx = extents.findIndex((e) => e.span.id === ci.targetSpanId);
      if (tgtSpanIdx === -1) continue;
      const srcItemIdx = spanToItemIndex.get(ext.index)!;
      const tgtItemIdx = spanToItemIndex.get(tgtSpanIdx)!;
      if (srcItemIdx === tgtItemIdx) continue; // within same chain
      const key = `${srcItemIdx}-${tgtItemIdx}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      edges.push({ src: items[srcItemIdx], tgt: items[tgtItemIdx] });
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

  // Total arrow length in columns (lower is better)
  function totalArrowLength(): number {
    let total = 0;
    for (const e of edges) {
      total += Math.abs(e.src.column - e.tgt.column);
    }
    return total;
  }

  // Combined score: minimize crossings, balance spacing vs arrow length
  function globalScore(): number {
    return countTotalCrossings() * 100 - spacingScore() * 1 + totalArrowLength() * 1;
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

  // Expand super-spans back to individual LayoutSpan entries
  const result: LayoutSpan[] = [];
  for (const item of items) {
    for (const spanIdx of item.memberIndices) {
      const ext = extents[spanIdx];
      result.push({
        span: ext.span,
        x: (item.column - (NUM_COLUMNS - 1) / 2) * COL_WIDTH,
        y: ext.top,
        width: SPAN_WIDTH,
        height: ext.height,
      });
    }
  }

  return result;
}
