import * as d3 from 'd3';
import type { Span } from '../../types';
import { SPAN_COLORS } from '../../utils/colors';
import { createYearScale } from '../../utils/yearScale';
import { layoutSpans, COL_WIDTH, type LayoutSpan } from './layout';

// Cache layout results based on structural data
let layoutCache: { key: string; result: ReturnType<typeof layoutSpans> } | null = null;

function structuralKey(spans: Span[], height: number, seed?: number): string {
  return JSON.stringify(spans.map(s => ({
    id: s.id,
    startYear: s.startYear,
    endYear: s.endYear,
    spanType: s.spanType,
    ci: s.causalImpacts.map(c => ({ t: c.targetSpanId, sa: c.sourceAttachment, ta: c.targetAttachment })),
  }))) + `|${height}|${seed ?? 0}`;
}

export function renderTimeline(
  svgEl: SVGSVGElement,
  spans: Span[],
  tooltipEl: HTMLDivElement,
  onSpanClick?: (spanId: string) => void,
  layoutSeed?: number
) {
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
    return;
  }

  const yScale = createYearScale(spans, height);

  const cacheKey = structuralKey(spans, height, layoutSeed);
  let layoutResult;
  if (layoutCache && layoutCache.key === cacheKey) {
    layoutResult = layoutCache.result;
  } else {
    layoutResult = layoutSpans(spans, height, layoutSeed);
    layoutCache = { key: cacheKey, result: layoutResult };
  }

  // Map span id to layout for arrow drawing
  const layoutMap = new Map<string, LayoutSpan>();
  for (const ls of layoutResult) layoutMap.set(ls.span.id, ls);

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
    .attr('stroke', '#e0e0e0')
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

  // For "middle" attachments, position the endpoint based on the direction to the other end.
  // Steeper angle up → higher on the span; steeper angle down → lower on the span.
  function middleY(span: LayoutSpan, otherY: number): number {
    const spanMidY = span.y + span.height / 2;
    const dy = otherY - spanMidY;
    // Normalize: how far is the other end relative to half the SVG height
    const maxDy = height / 2;
    // Map to a fraction within the span (0.15 to 0.85 to keep padding from edges)
    const t = Math.max(0.15, Math.min(0.85, 0.5 + (dy / maxDy) * 0.5));
    return span.y + span.height * t;
  }

  // Render arrows
  const arrowHoverData: { curvePath: string; annotation: string; srcSpanId: string; tgtSpanId: string }[] = [];
  const arrowsG = svg.append('g').attr('class', 'arrows');

  for (const arrow of allArrows) {
    const { ls, target, ci } = arrow;

    const srcX = centerX + ls.x;
    const tgtX = centerX + target.x;

    // For non-middle attachments, compute fixed Y; for middle, use the other span's center as reference
    const fixedSrcY = typeof ci.sourceAttachment === 'number' ? yScale(ci.sourceAttachment)
      : ci.sourceAttachment === 'end' ? ls.y : ci.sourceAttachment === 'start' ? ls.y + ls.height : null;
    const fixedTgtY = typeof ci.targetAttachment === 'number' ? yScale(ci.targetAttachment)
      : ci.targetAttachment === 'end' ? target.y : ci.targetAttachment === 'start' ? target.y + target.height : null;

    // For "middle" attachments, position based on direction to the other end
    const srcRefY = fixedTgtY ?? (target.y + target.height / 2);
    const tgtRefY = fixedSrcY ?? (ls.y + ls.height / 2);
    const srcY = fixedSrcY ?? middleY(ls, srcRefY);
    const tgtY = fixedTgtY ?? middleY(target, tgtRefY);

    const srcIsVertical = ci.sourceAttachment === 'end' || ci.sourceAttachment === 'start';
    const tgtIsVertical = ci.targetAttachment === 'end' || ci.targetAttachment === 'start';
    const srcAnchorX = srcIsVertical ? srcX : srcX + (tgtX > srcX ? ls.width / 2 : -ls.width / 2);
    const tgtAnchorX = tgtIsVertical ? tgtX : tgtX + (srcX > tgtX ? target.width / 2 : -target.width / 2);

    const curvePath = `M${srcAnchorX},${srcY} L${tgtAnchorX},${tgtY}`;

    // Arrow rendered behind spans
    arrowsG
      .append('path')
      .attr('d', curvePath)
      .attr('fill', 'none')
      .attr('stroke', '#aaa')
      .attr('stroke-width', 2.5)
      .attr('marker-end', 'url(#arrowhead)')
      .attr('class', 'arrow-path');

    // Store data for hover overlay (rendered on top of everything later)
    arrowHoverData.push({ curvePath, annotation: ci.annotation, srcSpanId: ls.span.id, tgtSpanId: ci.targetSpanId });
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
    const fontSize = 11;
    const maxCharsPerLine = Math.floor(ls.width / (fontSize * 0.6));
    const words = ls.span.title.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    for (const word of words) {
      if (currentLine && (currentLine + ' ' + word).length > maxCharsPerLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
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

  for (const { ls, tickLen } of subEventLabelData) {
    const labelBoxPadX = 6;
    const labelBoxPadY = 3;
    const labelFontSize = 10;
    const boxX = centerX + ls.x + ls.width / 2 + tickLen + 4;

    // Create a group for this span's labels, hidden by default
    const labelsG = labelOverlay.append('g')
      .attr('opacity', 0);

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

    // The span group needs a hover target — add an invisible rect over the span area
    let pinned = false;
    const hoverTarget = spansG.append('rect')
      .attr('x', centerX + ls.x - ls.width / 2)
      .attr('y', ls.y)
      .attr('width', ls.width)
      .attr('height', ls.height)
      .attr('fill', 'transparent')
      .attr('cursor', 'pointer');

    hoverTarget
      .on('mouseenter', () => { labelsG.attr('opacity', 1); })
      .on('mouseleave', () => { if (!pinned) labelsG.attr('opacity', 0); })
      .on('click', () => {
        pinned = !pinned;
        labelsG.attr('opacity', pinned ? 1 : 0);
        toggleArrowHighlight(ls.span.id);
        if (onSpanClick) onSpanClick(ls.span.id);
      });
  }

  // Arrow hover overlay — rendered on top of everything
  const arrowOverlayG = svg.append('g').attr('class', 'arrow-overlay');

  // Track overlay paths by connected span IDs for click-to-highlight
  type PathSel = d3.Selection<SVGPathElement, unknown, null, undefined>;
  const overlayPathsBySpan = new Map<string, PathSel[]>();

  for (const { curvePath, annotation, srcSpanId, tgtSpanId } of arrowHoverData) {
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

    // Register this overlay path for both source and target spans
    for (const spanId of [srcSpanId, tgtSpanId]) {
      if (!overlayPathsBySpan.has(spanId)) overlayPathsBySpan.set(spanId, []);
      overlayPathsBySpan.get(spanId)!.push(overlayPath);
    }

    // Invisible wide hover target on top
    arrowOverlayG
      .append('path')
      .attr('d', curvePath)
      .attr('fill', 'none')
      .attr('stroke', 'transparent')
      .attr('stroke-width', 14)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event: MouseEvent) => {
        overlayPath.attr('opacity', 1);
        if (annotation) {
          tooltipEl.innerHTML = annotation;
          tooltipEl.style.display = 'block';
          tooltipEl.style.left = event.clientX + 10 + 'px';
          tooltipEl.style.top = event.clientY + 10 + 'px';
        }
      })
      .on('mousemove', (event: MouseEvent) => {
        if (annotation) {
          tooltipEl.style.left = event.clientX + 10 + 'px';
          tooltipEl.style.top = event.clientY + 10 + 'px';
        }
      })
      .on('mouseleave', () => {
        // Only hide if not pinned by a span click
        if (!overlayPath.classed('pinned')) {
          overlayPath.attr('opacity', 0);
        }
        tooltipEl.style.display = 'none';
      });
  }

  // Span click arrow highlighting
  let highlightedSpanId: string | null = null;

  function highlightArrowsForSpan(spanId: string | null) {
    // Unpin all previously pinned arrows
    arrowOverlayG.selectAll('path.pinned')
      .classed('pinned', false)
      .attr('opacity', 0);

    if (spanId) {
      const paths = overlayPathsBySpan.get(spanId) ?? [];
      for (const p of paths) {
        p.classed('pinned', true).attr('opacity', 1);
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
}
