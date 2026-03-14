import * as d3 from 'd3';
import type { Span } from '../../types';
import { SPAN_COLORS } from '../../utils/colors';
import { createYearScale } from '../../utils/yearScale';
import { layoutSpans, COL_WIDTH, type LayoutSpan } from './layout';

export interface RenderResult {
  cleanup?: () => void;
  selectSpan: (spanId: string) => void;
}

export function computeLayout(spans: Span[], height: number, seed?: number): LayoutSpan[] {
  return layoutSpans(spans, height, seed);
}

export function renderTimeline(
  svgEl: SVGSVGElement,
  spans: Span[],
  tooltipEl: HTMLDivElement,
  onSpanClick?: (spanId: string) => void,
  containerEl?: HTMLElement | null,
  precomputedLayout?: LayoutSpan[]
): RenderResult | void {
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  // Will be assigned after arrow overlay is built; safe because click handlers run later
  let toggleArrowHighlight: (spanId: string) => void = () => {};

  const width = svgEl.clientWidth;
  const height = svgEl.clientHeight;

  if (spans.length === 0) {
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#888')
      .text('Add spans to see the timeline');
    return { selectSpan: () => {} };
  }

  const yScale = createYearScale(spans, height);

  // Use precomputed layout, or compute fresh if not provided
  const layoutResult = precomputedLayout ?? layoutSpans(spans, height);

  // Map span id to layout for arrow drawing
  const layoutMap = new Map<string, LayoutSpan>();
  for (const ls of layoutResult) layoutMap.set(ls.span.id, ls);

  // Build continuation chain map: span ID → all span IDs in the same chain
  const chainOf = new Map<string, Set<string>>();
  {
    // Build forward links
    const fwd = new Map<string, string>();
    const rev = new Map<string, string>();
    for (const s of spans) {
      if (s.continuesAs) {
        fwd.set(s.id, s.continuesAs);
        rev.set(s.continuesAs, s.id);
      }
    }
    // Find chain heads (spans with no predecessor)
    const visited = new Set<string>();
    for (const s of spans) {
      if (visited.has(s.id)) continue;
      if (rev.has(s.id)) continue; // not a head
      // Walk the chain
      const chain = new Set<string>();
      let cur: string | undefined = s.id;
      while (cur && !visited.has(cur)) {
        visited.add(cur);
        chain.add(cur);
        cur = fwd.get(cur);
      }
      if (chain.size > 1) {
        for (const id of chain) chainOf.set(id, chain);
      }
    }
  }

  // Get all span IDs that should activate together (chain members or just the single span)
  function getChainIds(spanId: string): string[] {
    const chain = chainOf.get(spanId);
    return chain ? Array.from(chain) : [spanId];
  }

  const centerX = width / 2;

  // Year axis
  const domainVals = yScale.domain() as [number, number];
  const yearMin = Math.min(domainVals[0], domainVals[1]);
  const yearMax = Math.max(domainVals[0], domainVals[1]);

  // Gridlines every 2 years
  const gridlines: number[] = [];
  const firstGrid = Math.ceil(yearMin / 2) * 2;
  for (let y = firstGrid; y <= yearMax; y += 2) {
    gridlines.push(y);
  }

  // Labels every 10 years
  const labelStep = 10;

  const axisG = svg.append('g').attr('class', 'year-axis');
  axisG
    .selectAll('line')
    .data(gridlines)
    .join('line')
    .attr('x1', 30)
    .attr('x2', width - 10)
    .attr('y1', (d) => yScale(d))
    .attr('y2', (d) => yScale(d))
    .attr('stroke', '#2f2f48')
    .attr('stroke-width', 1);

  axisG
    .selectAll('text')
    .data(gridlines.filter((y) => y % labelStep === 0))
    .join('text')
    .attr('x', 5)
    .attr('y', (d) => yScale(d) + 4)
    .attr('fill', '#999')
    .attr('font-size', 11)
    .text((d) => String(d));

  // Arrow markers
  const defs = svg.append('defs');
  defs
    .append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '0 0 10 7')
    .attr('refX', 10)
    .attr('refY', 3.5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('polygon')
    .attr('points', '0 0, 10 3.5, 0 7')
    .attr('fill', '#aaa');

  defs
    .append('marker')
    .attr('id', 'arrowhead-highlight')
    .attr('viewBox', '0 0 10 7')
    .attr('refX', 10)
    .attr('refY', 3.5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('polygon')
    .attr('points', '0 0, 10 3.5, 0 7')
    .attr('fill', '#f0c040');

  // Reverse arrowhead markers (for bidirectional arrows, pointing backward)
  defs
    .append('marker')
    .attr('id', 'arrowhead-reverse')
    .attr('viewBox', '0 0 10 7')
    .attr('refX', 0)
    .attr('refY', 3.5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('polygon')
    .attr('points', '10 0, 0 3.5, 10 7')
    .attr('fill', '#aaa');

  defs
    .append('marker')
    .attr('id', 'arrowhead-reverse-highlight')
    .attr('viewBox', '0 0 10 7')
    .attr('refX', 0)
    .attr('refY', 3.5)
    .attr('markerWidth', 6)
    .attr('markerHeight', 5)
    .attr('orient', 'auto')
    .append('polygon')
    .attr('points', '10 0, 0 3.5, 10 7')
    .attr('fill', '#f0c040');

  // Arrows (causal impacts)
  // Collect all arrows for rendering
  interface ArrowInfo {
    ls: LayoutSpan;
    target: LayoutSpan;
    ci: typeof layoutResult[0]['span']['causalImpacts'][0];
  }
  const allArrows: ArrowInfo[] = [];

  for (const ls of layoutResult) {
    for (const ci of ls.span.causalImpacts) {
      const target = layoutMap.get(ci.targetSpanId);
      if (!target) continue;
      allArrows.push({ ls, target, ci });
    }
  }

  // For "middle" attachments, the arrow should lie along the line from the span's center
  // to the other endpoint, but the visible arrow starts/ends where that line intersects
  // the span's edge (left or right side).
  // Given a span's screen-space bounds and a target point, find where the line from
  // the span's center to the target intersects the span's left or right edge.
  function middleEdgePoint(
    spanLeft: number, spanTop: number, spanWidth: number, spanHeight: number,
    otherX: number, otherY: number
  ): { x: number; y: number } {
    const cx = spanLeft + spanWidth / 2;
    const cy = spanTop + spanHeight / 2;
    const dx = otherX - cx;
    const dy = otherY - cy;

    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      return { x: cx, y: cy };
    }

    // Try intersecting with left/right edge
    let bestT = Infinity;
    if (Math.abs(dx) > 0.001) {
      const edgeX = dx > 0 ? spanLeft + spanWidth : spanLeft;
      const t = (edgeX - cx) / dx;
      if (t > 0) {
        const y = cy + dy * t;
        if (y >= spanTop && y <= spanTop + spanHeight) {
          bestT = t;
        }
      }
    }

    // Try intersecting with top/bottom edge
    if (Math.abs(dy) > 0.001) {
      const edgeY = dy > 0 ? spanTop + spanHeight : spanTop;
      const t = (edgeY - cy) / dy;
      if (t > 0 && t < bestT) {
        bestT = t;
      }
    }

    if (bestT === Infinity) bestT = 0;
    return { x: cx + dx * bestT, y: cy + dy * bestT };
  }

  // Render arrows
  const arrowHoverData: { curvePath: string; annotation: string; srcSpanId: string; tgtSpanId: string; bidirectional?: boolean }[] = [];
  const arrowsG = svg.append('g').attr('class', 'arrows');

  for (const arrow of allArrows) {
    const { ls, target, ci } = arrow;

    const srcCenterX = centerX + ls.x;
    const tgtCenterX = centerX + target.x;

    const srcIsVertical = ci.sourceAttachment === 'end' || ci.sourceAttachment === 'start';
    const tgtIsVertical = ci.targetAttachment === 'end' || ci.targetAttachment === 'start';
    const srcIsMiddle = ci.sourceAttachment === 'middle';
    const tgtIsMiddle = ci.targetAttachment === 'middle';

    // For non-middle attachments, compute fixed positions
    const fixedSrcY = typeof ci.sourceAttachment === 'number' ? yScale(ci.sourceAttachment)
      : ci.sourceAttachment === 'end' ? ls.y : ci.sourceAttachment === 'start' ? ls.y + ls.height : null;
    const fixedTgtY = typeof ci.targetAttachment === 'number' ? yScale(ci.targetAttachment)
      : ci.targetAttachment === 'end' ? target.y : ci.targetAttachment === 'start' ? target.y + target.height : null;

    let srcAnchorX: number, srcY: number, tgtAnchorX: number, tgtY: number;

    // Screen-space left edges
    const srcLeft = srcCenterX - ls.width / 2;
    const tgtLeft = tgtCenterX - target.width / 2;

    if (srcIsMiddle && tgtIsMiddle) {
      // Both middle: line from center to center, clipped at edges
      const srcEdge = middleEdgePoint(srcLeft, ls.y, ls.width, ls.height, tgtCenterX, target.y + target.height / 2);
      const tgtEdge = middleEdgePoint(tgtLeft, target.y, target.width, target.height, srcCenterX, ls.y + ls.height / 2);
      srcAnchorX = srcEdge.x; srcY = srcEdge.y;
      tgtAnchorX = tgtEdge.x; tgtY = tgtEdge.y;
    } else if (srcIsMiddle) {
      // Source is middle: line from source center toward target endpoint, clipped at source edge
      const tgtEndX = tgtIsVertical ? tgtCenterX : tgtCenterX + (srcCenterX > tgtCenterX ? target.width / 2 : -target.width / 2);
      tgtY = fixedTgtY!;
      tgtAnchorX = tgtEndX;
      const srcEdge = middleEdgePoint(srcLeft, ls.y, ls.width, ls.height, tgtAnchorX, tgtY);
      srcAnchorX = srcEdge.x; srcY = srcEdge.y;
    } else if (tgtIsMiddle) {
      // Target is middle: line from target center toward source endpoint, clipped at target edge
      const srcEndX = srcIsVertical ? srcCenterX : srcCenterX + (tgtCenterX > srcCenterX ? ls.width / 2 : -ls.width / 2);
      srcY = fixedSrcY!;
      srcAnchorX = srcEndX;
      const tgtEdge = middleEdgePoint(tgtLeft, target.y, target.width, target.height, srcAnchorX, srcY);
      tgtAnchorX = tgtEdge.x; tgtY = tgtEdge.y;
    } else {
      // Neither is middle
      srcY = fixedSrcY!;
      tgtY = fixedTgtY!;
      srcAnchorX = srcIsVertical ? srcCenterX : srcCenterX + (tgtCenterX > srcCenterX ? ls.width / 2 : -ls.width / 2);
      tgtAnchorX = tgtIsVertical ? tgtCenterX : tgtCenterX + (srcCenterX > tgtCenterX ? target.width / 2 : -target.width / 2);
    }

    const curvePath = `M${srcAnchorX},${srcY} L${tgtAnchorX},${tgtY}`;

    // Arrow rendered behind spans
    const basePath = arrowsG
      .append('path')
      .attr('d', curvePath)
      .attr('fill', 'none')
      .attr('stroke', '#aaa')
      .attr('stroke-width', 2.5)
      .attr('marker-end', 'url(#arrowhead)')
      .attr('class', 'arrow-path');
    if (ci.bidirectional) {
      basePath.attr('marker-start', 'url(#arrowhead-reverse)');
    }

    // Store data for hover overlay (rendered on top of everything later)
    arrowHoverData.push({ curvePath, annotation: ci.annotation, srcSpanId: ls.span.id, tgtSpanId: ci.targetSpanId, bidirectional: ci.bidirectional });
  }

  // Span rectangles
  const subEventLabelData: { ls: LayoutSpan; tickLen: number }[] = [];
  const spansG = svg.append('g').attr('class', 'spans');
  for (const ls of layoutResult) {
    const g = spansG.append('g').attr('transform', `translate(${centerX + ls.x - ls.width / 2}, ${ls.y})`);

    // Ongoing indicator
    const isOngoing = ls.span.endYear === 'ongoing';
    const color = SPAN_COLORS[ls.span.spanType];
    const r = 4; // corner radius

    if (isOngoing) {
      // Gradient fade at top (straight edge, fades out)
      // The overflow portion (above current year line) should fade; the rest is solid
      const overflowPx = 15; // matches ONGOING_OVERFLOW_PX in layout
      const fadeFraction = ls.height > 0 ? overflowPx / ls.height : 0;

      const gradId = `ongoing-grad-${ls.span.id}`;
      const defs = svg.select('defs');
      const grad = defs.append('linearGradient')
        .attr('id', gradId)
        .attr('x1', 0).attr('y1', 0)
        .attr('x2', 0).attr('y2', 1);
      grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0);
      grad.append('stop').attr('offset', `${fadeFraction * 100}%`).attr('stop-color', color).attr('stop-opacity', 0.85);
      grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0.85);

      // Path: straight top edge, rounded bottom corners
      const w = ls.width;
      const h = ls.height;
      g.append('path')
        .attr('d', `M0,0 L${w},0 L${w},${h - r} Q${w},${h} ${w - r},${h} L${r},${h} Q0,${h} 0,${h - r} Z`)
        .attr('fill', `url(#${gradId})`)
        .attr('stroke', '#333')
        .attr('stroke-width', 1);

      // Hide the top stroke (it's the fade edge, shouldn't have a hard line)
      g.append('line')
        .attr('x1', 0).attr('x2', ls.width)
        .attr('y1', 0).attr('y2', 0)
        .attr('stroke', '#1a1a2e')
        .attr('stroke-width', 2);
    } else {
      g.append('rect')
        .attr('width', ls.width)
        .attr('height', ls.height)
        .attr('rx', r)
        .attr('fill', color)
        .attr('opacity', 0.85)
        .attr('stroke', '#333')
        .attr('stroke-width', 1);
    }

    // Click to select span and highlight connected arrows
    g.attr('cursor', 'pointer')
      .on('click', () => {
        toggleArrowHighlight(ls.span.id);
        if (onSpanClick) onSpanClick(ls.span.id);
      });

    // Title (word-wrapped)
    const fontSize = 15;
    const maxCharsPerLine = Math.floor(ls.width / (fontSize * 0.6));
    const words = ls.span.title.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    function addChunk(chunk: string, separator: string) {
      const candidate = currentLine ? currentLine + separator + chunk : chunk;
      if (currentLine && candidate.length > maxCharsPerLine) {
        lines.push(currentLine);
        currentLine = chunk;
      } else {
        currentLine = candidate;
      }
    }

    for (const word of words) {
      // Split on hyphens, keeping the hyphen attached to the left part
      const parts = word.split(/(?<=-)/).filter(Boolean);
      if (parts.length > 1) {
        for (let i = 0; i < parts.length; i++) {
          addChunk(parts[i], i === 0 ? ' ' : '');
        }
      } else {
        addChunk(word, ' ');
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = fontSize + 3;
    const totalTextHeight = lines.length * lineHeight;
    const textStartY = Math.max(lineHeight, (ls.height - totalTextHeight) / 2 + lineHeight);

    const textEl = g.append('text')
      .attr('x', ls.width / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', fontSize)
      .attr('font-weight', 'bold');

    let titleTruncated = false;
    for (let i = 0; i < lines.length; i++) {
      const lineY = textStartY + i * lineHeight;
      if (lineY > ls.height - 2) { titleTruncated = true; break; }
      textEl.append('tspan')
        .attr('x', ls.width / 2)
        .attr('y', lineY)
        .text(lines[i]);
    }

    // Show full title on hover if truncated
    if (titleTruncated) {
      g.on('mouseenter.title', (event: MouseEvent) => {
        tooltipEl.textContent = ls.span.title;
        tooltipEl.style.display = 'block';
        tooltipEl.style.left = event.clientX + 10 + 'px';
        tooltipEl.style.top = event.clientY + 10 + 'px';
      });
      g.on('mousemove.title', (event: MouseEvent) => {
        tooltipEl.style.left = event.clientX + 10 + 'px';
        tooltipEl.style.top = event.clientY + 10 + 'px';
      });
      g.on('mouseleave.title', () => {
        tooltipEl.style.display = 'none';
      });
    }

    // Sub-event tick marks (extending out the right side)
    const tickLen = 8;
    for (const se of ls.span.subEvents) {
      const seY = yScale(se.date) - ls.y;
      if (seY < 0 || seY > ls.height) continue;

      g.append('line')
        .attr('x1', ls.width)
        .attr('x2', ls.width + tickLen)
        .attr('y1', seY)
        .attr('y2', seY)
        .attr('stroke', '#f0c040')
        .attr('stroke-width', 2)
        .attr('opacity', 0.9);
    }

    // Store sub-event label data for the overlay layer (rendered on top of all spans)
    if (ls.span.subEvents.length > 0) {
      subEventLabelData.push({ ls, tickLen });
    }
  }

  // Sub-event label overlay (rendered on top of all spans)
  const labelOverlay = svg.append('g').attr('class', 'sub-event-overlay');

  // Map span ID to its label group for chain-aware show/hide
  type GSel = d3.Selection<SVGGElement, unknown, null, undefined>;
  const labelGroupsBySpan = new Map<string, GSel>();

  for (const { ls, tickLen } of subEventLabelData) {
    const labelBoxPadX = 6;
    const labelBoxPadY = 3;
    const labelFontSize = 10;
    const boxX = centerX + ls.x + ls.width / 2 + tickLen + 4;

    // Create a group for this span's labels, hidden by default
    const labelsG = labelOverlay.append('g')
      .attr('opacity', 0);
    labelGroupsBySpan.set(ls.span.id, labelsG);

    for (const se of ls.span.subEvents) {
      const seY = yScale(se.date) - ls.y;
      if (seY < 0 || seY > ls.height) continue;

      const label = se.label ? `${se.date}: ${se.label}` : String(se.date);
      const absY = ls.y + seY;

      // Word-wrap label if wider than 4 columns
      const charWidth = labelFontSize * 0.6;
      const maxLabelWidth = COL_WIDTH * 4;
      const maxChars = Math.floor(maxLabelWidth / charWidth);
      const words = label.split(/\s+/);
      const lines: string[] = [];
      let curLine = '';
      for (const word of words) {
        if (curLine && (curLine + ' ' + word).length > maxChars) {
          lines.push(curLine);
          curLine = word;
        } else {
          curLine = curLine ? curLine + ' ' + word : word;
        }
      }
      if (curLine) lines.push(curLine);

      const lineHeight = labelFontSize + 3;
      const longestLine = Math.max(...lines.map((l) => l.length));
      const textWidth = longestLine * charWidth;
      const totalTextHeight = lines.length * lineHeight;
      const boxHeight = totalTextHeight + labelBoxPadY * 2;
      const boxTop = absY - boxHeight / 2;

      // Wrap each label in its own group so it can be raised on hover
      const labelG = labelsG.append('g')
        .attr('cursor', 'default');

      // Background box
      labelG.append('rect')
        .attr('x', boxX - labelBoxPadX)
        .attr('y', boxTop)
        .attr('width', textWidth + labelBoxPadX * 2)
        .attr('height', boxHeight)
        .attr('rx', 3)
        .attr('fill', '#2a2a3a')
        .attr('stroke', 'rgba(255,255,255,0.2)')
        .attr('stroke-width', 1);

      // Label text (multi-line), vertically centered in box
      const textEl = labelG.append('text')
        .attr('fill', '#ddd')
        .attr('font-size', labelFontSize);
      for (let i = 0; i < lines.length; i++) {
        textEl.append('tspan')
          .attr('x', boxX)
          .attr('y', boxTop + labelBoxPadY + (i + 0.5) * lineHeight + labelFontSize * 0.35)
          .text(lines[i]);
      }

      // Raise to top of parent on hover
      labelG
        .on('mouseenter', () => { labelG.raise(); });
    }
  }

  // Helper: show/hide labels for all spans in a chain
  function showChainLabels(spanId: string, show: boolean) {
    for (const id of getChainIds(spanId)) {
      const g = labelGroupsBySpan.get(id);
      if (g) g.attr('opacity', show ? 1 : 0);
    }
  }

  // Track pinned state per chain (keyed by any member span ID)
  const pinnedChains = new Set<string>();
  function getChainKey(spanId: string): string {
    const chain = chainOf.get(spanId);
    return chain ? Array.from(chain).sort()[0] : spanId;
  }

  // Add hover targets for each span that has sub-events (or is in a chain with sub-events)
  // We need hover targets for ALL spans, not just those with sub-events, if they're in a chain
  const spansNeedingHoverTargets = new Set<string>();
  for (const { ls } of subEventLabelData) {
    for (const id of getChainIds(ls.span.id)) {
      spansNeedingHoverTargets.add(id);
    }
  }

  for (const ls of layoutResult) {
    if (!spansNeedingHoverTargets.has(ls.span.id)) continue;

    const hoverTarget = spansG.append('rect')
      .attr('x', centerX + ls.x - ls.width / 2)
      .attr('y', ls.y)
      .attr('width', ls.width)
      .attr('height', ls.height)
      .attr('fill', 'transparent')
      .attr('cursor', 'pointer');

    const spanId = ls.span.id;
    hoverTarget
      .on('mouseenter', () => { showChainLabels(spanId, true); })
      .on('mouseleave', () => {
        const key = getChainKey(spanId);
        if (!pinnedChains.has(key)) showChainLabels(spanId, false);
      })
      .on('click', () => {
        const key = getChainKey(spanId);
        if (pinnedChains.has(key)) {
          pinnedChains.delete(key);
          showChainLabels(spanId, false);
        } else {
          pinnedChains.add(key);
          showChainLabels(spanId, true);
        }
        toggleArrowHighlight(spanId);
        if (onSpanClick) onSpanClick(spanId);
      });
  }

  // Render markdown links in annotation text
  function renderMarkdown(text: string): string {
    return text.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );
  }

  // Arrow hover overlay — rendered on top of everything
  const arrowOverlayG = svg.append('g').attr('class', 'arrow-overlay');

  // Track overlay paths by connected span IDs for click-to-highlight
  type PathSel = d3.Selection<SVGPathElement, unknown, null, undefined>;
  const overlayPathsBySpan = new Map<string, PathSel[]>();

  // Track pinned arrow annotation state
  let pinnedArrowHitTarget: SVGPathElement | null = null;
  let pinnedArrowOverlay: PathSel | null = null;

  function unpinArrowAnnotation() {
    if (pinnedArrowOverlay && !pinnedArrowOverlay.classed('span-pinned')) {
      pinnedArrowOverlay.attr('opacity', 0);
    }
    pinnedArrowHitTarget = null;
    pinnedArrowOverlay = null;
    tooltipEl.style.display = 'none';
    tooltipEl.classList.remove('pinned');
  }

  for (const { curvePath, annotation, srcSpanId, tgtSpanId, bidirectional } of arrowHoverData) {
    // Highlighted copy (hidden by default)
    const overlayPath = arrowOverlayG
      .append('path')
      .attr('d', curvePath)
      .attr('fill', 'none')
      .attr('stroke', '#f0c040')
      .attr('stroke-width', 3)
      .attr('marker-end', 'url(#arrowhead-highlight)')
      .attr('opacity', 0)
      .attr('pointer-events', 'none');
    if (bidirectional) {
      overlayPath.attr('marker-start', 'url(#arrowhead-reverse-highlight)');
    }

    // Register this overlay path for both source and target spans
    for (const spanId of [srcSpanId, tgtSpanId]) {
      if (!overlayPathsBySpan.has(spanId)) overlayPathsBySpan.set(spanId, []);
      overlayPathsBySpan.get(spanId)!.push(overlayPath);
    }

    // Invisible wide hover target on top
    const hitTarget = arrowOverlayG
      .append('path')
      .attr('d', curvePath)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent) => {
        overlayPath.attr('opacity', 1);
        if (annotation && pinnedArrowHitTarget !== hitTarget.node()) {
          tooltipEl.innerHTML = renderMarkdown(annotation);
          tooltipEl.style.display = 'block';
          tooltipEl.style.left = event.clientX + 10 + 'px';
          tooltipEl.style.top = event.clientY + 10 + 'px';
        }
      })
      .on('mousemove', (event: MouseEvent) => {
        if (annotation && pinnedArrowHitTarget !== hitTarget.node()) {
          tooltipEl.style.left = event.clientX + 10 + 'px';
          tooltipEl.style.top = event.clientY + 10 + 'px';
        }
      })
      .on('mouseleave', () => {
        // Only hide if not pinned by a span click or arrow click
        if (!overlayPath.classed('span-pinned') && pinnedArrowHitTarget !== hitTarget.node()) {
          overlayPath.attr('opacity', 0);
        }
        if (pinnedArrowHitTarget !== hitTarget.node()) {
          tooltipEl.style.display = 'none';
        }
      })
      .on('click', (event: MouseEvent) => {
        event.stopPropagation();
        if (!annotation) return;

        if (pinnedArrowHitTarget === hitTarget.node()) {
          // Clicking the same arrow again — unpin
          unpinArrowAnnotation();
        } else {
          // Unpin previous, pin this one
          unpinArrowAnnotation();
          pinnedArrowHitTarget = hitTarget.node() as SVGPathElement;
          pinnedArrowOverlay = overlayPath;
          overlayPath.attr('opacity', 1);
          tooltipEl.innerHTML = renderMarkdown(annotation);
          tooltipEl.style.display = 'block';
          tooltipEl.classList.add('pinned');
          tooltipEl.style.left = event.clientX + 10 + 'px';
          tooltipEl.style.top = event.clientY + 10 + 'px';
        }
      });
  }

  // Dismiss pinned arrow annotation on outside click (SVG or document)
  const dismissHandler = (event: MouseEvent) => {
    if (!pinnedArrowHitTarget) return;
    // Don't dismiss if clicking inside the tooltip (user may be clicking a link)
    if (tooltipEl.contains(event.target as Node)) return;
    unpinArrowAnnotation();
  };
  document.addEventListener('click', dismissHandler);

  // Span click arrow highlighting
  let highlightedSpanId: string | null = null;

  function highlightArrowsForSpan(spanId: string | null) {
    // Unpin all previously span-pinned arrows
    arrowOverlayG.selectAll('path.span-pinned')
      .classed('span-pinned', false)
      .attr('opacity', 0);

    if (spanId) {
      const ids = getChainIds(spanId);
      for (const id of ids) {
        const paths = overlayPathsBySpan.get(id) ?? [];
        for (const p of paths) {
          p.classed('span-pinned', true).attr('opacity', 1);
        }
      }
    }
  }

  // Wire up the toggle function for span click handlers
  toggleArrowHighlight = (spanId: string) => {
    if (highlightedSpanId === spanId) {
      highlightedSpanId = null;
      highlightArrowsForSpan(null);
    } else {
      highlightedSpanId = spanId;
      highlightArrowsForSpan(spanId);
    }
  };

  // selectSpan: highlight arrows and scroll into view (for external callers)
  const selectSpan = (spanId: string) => {
    // Always highlight (non-toggle: clear old, set new)
    highlightedSpanId = spanId;
    highlightArrowsForSpan(spanId);

    // Scroll the span rect into view within the container
    if (containerEl) {
      const ls = layoutMap.get(spanId);
      if (ls) {
        const spanMidY = ls.y + ls.height / 2;
        const containerHeight = containerEl.clientHeight;
        const scrollTarget = spanMidY - containerHeight / 2;
        containerEl.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
    }
  };

  // Return cleanup function and selectSpan
  return {
    cleanup: () => {
      document.removeEventListener('click', dismissHandler);
    },
    selectSpan,
  };
}
