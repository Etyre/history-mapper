import type { AppState } from '../../types';
import { SPAN_COLORS } from '../../utils/colors';

export function exportStandaloneHtml(state: AppState) {
  const dataJson = JSON.stringify(state);
  const colorsJson = JSON.stringify(SPAN_COLORS);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>History Mapper Timeline</title>
<script src="https://d3js.org/d3.v7.min.js"><\/script>
<style>
  body { margin: 0; background: #1a1a2e; display: flex; justify-content: center; }
  svg { background: #1a1a2e; }
  .tooltip {
    display: none; position: absolute; background: #333; color: #fff;
    padding: 6px 10px; border-radius: 4px; font-size: 13px; pointer-events: auto;
    max-width: 300px; z-index: 10;
  }
  .tooltip a { color: #6db3f2; }
</style>
</head>
<body>
<svg id="timeline" width="900" height="2000"></svg>
<div class="tooltip" id="tooltip"></div>
<script>
(function() {
  const data = ${dataJson};
  const COLORS = ${colorsJson};
  const CURRENT_YEAR = new Date().getFullYear();
  const SPAN_WIDTH = 80;
  const svg = d3.select('#timeline');
  const tooltip = document.getElementById('tooltip');
  const width = 900;
  const height = 2000;

  // Year scale
  let minY = Infinity, maxY = -Infinity;
  for (const s of data.spans) {
    if (s.startYear < minY) minY = s.startYear;
    const end = s.endYear === 'ongoing' ? CURRENT_YEAR : s.endYear;
    if (end > maxY) maxY = end;
  }
  minY -= 5; maxY += 5;
  const yScale = d3.scaleLinear().domain([maxY, minY]).range([30, height - 20]);

  // Force layout
  const nodes = data.spans.map(s => {
    const sy = yScale(s.startYear);
    const ey = yScale(s.endYear === 'ongoing' ? CURRENT_YEAR : s.endYear);
    const h = Math.max(ey - sy, 10);
    return { span: s, x: 0, y: sy, fy: sy + h/2, h };
  });

  const sim = d3.forceSimulation(nodes)
    .force('x', d3.forceX(0).strength(0.05))
    .force('collide', d3.forceCollide().radius(d => d.h/2 + SPAN_WIDTH/2 + 5).strength(0.7))
    .stop();
  for (let i = 0; i < 300; i++) sim.tick();

  let lMinX = Infinity, lMaxX = -Infinity;
  for (const n of nodes) {
    if (n.x - SPAN_WIDTH/2 < lMinX) lMinX = n.x - SPAN_WIDTH/2;
    if (n.x + SPAN_WIDTH/2 > lMaxX) lMaxX = n.x + SPAN_WIDTH/2;
  }
  const offset = -(lMinX + lMaxX) / 2;
  const layoutMap = new Map();
  for (const n of nodes) {
    const sy = yScale(n.span.startYear);
    const ey = yScale(n.span.endYear === 'ongoing' ? CURRENT_YEAR : n.span.endYear);
    const ls = { span: n.span, x: n.x + offset, y: sy, width: SPAN_WIDTH, height: Math.max(ey - sy, 10) };
    layoutMap.set(n.span.id, ls);
  }

  const centerX = width / 2;

  // Year axis
  const tickStep = Math.max(1, Math.round((maxY - minY) / 20));
  for (let y = Math.ceil(minY/tickStep)*tickStep; y <= maxY; y += tickStep) {
    svg.append('line').attr('x1',30).attr('x2',width-10).attr('y1',yScale(y)).attr('y2',yScale(y)).attr('stroke','#444');
    svg.append('text').attr('x',5).attr('y',yScale(y)+4).attr('fill','#888').attr('font-size',11).text(y);
  }

  // Arrow markers
  const exportDefs = svg.append('defs');
  exportDefs.append('marker').attr('id','ah').attr('viewBox','0 0 10 7')
    .attr('refX',10).attr('refY',3.5).attr('markerWidth',8).attr('markerHeight',6).attr('orient','auto')
    .append('polygon').attr('points','0 0,10 3.5,0 7').attr('fill','#888');
  exportDefs.append('marker').attr('id','ah-rev').attr('viewBox','0 0 10 7')
    .attr('refX',0).attr('refY',3.5).attr('markerWidth',8).attr('markerHeight',6).attr('orient','auto')
    .append('polygon').attr('points','10 0,0 3.5,10 7').attr('fill','#888');

  // Arrows
  for (const ls of layoutMap.values()) {
    for (const ci of ls.span.causalImpacts) {
      const tgt = layoutMap.get(ci.targetSpanId);
      if (!tgt) continue;
      const sx = centerX + ls.x, sy = ci.sourceAttachment === 'end' ? ls.y + ls.height : ls.y + ls.height/2;
      const tx = centerX + tgt.x, ty = ci.targetAttachment === 'start' ? tgt.y : tgt.y + tgt.height/2;
      const sex = sx + (tx > sx ? ls.width/2 : -ls.width/2);
      const tex = tx + (sx > tx ? tgt.width/2 : -tgt.width/2);
      const my = (sy + ty) / 2;
      const p = svg.append('path')
        .attr('d', 'M'+sex+','+sy+' C'+(sex+(tex-sex)*0.5)+','+my+' '+(tex-(tex-sex)*0.5)+','+my+' '+tex+','+ty)
        .attr('fill','none').attr('stroke','#888').attr('stroke-width',1.5).attr('marker-end','url(#ah)');
      if (ci.bidirectional) {
        p.attr('marker-start','url(#ah-rev)');
      }
      if (ci.annotation) {
        const rendered = ci.annotation.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        p.attr('stroke-width',3).attr('cursor','pointer')
          .on('mouseenter', e => { tooltip.innerHTML = rendered; tooltip.style.display='block'; tooltip.style.left=e.pageX+10+'px'; tooltip.style.top=e.pageY+10+'px'; })
          .on('mousemove', e => { tooltip.style.left=e.pageX+10+'px'; tooltip.style.top=e.pageY+10+'px'; })
          .on('mouseleave', () => { tooltip.style.display='none'; });
      }
    }
  }

  // Spans
  for (const ls of layoutMap.values()) {
    const g = svg.append('g').attr('transform', 'translate('+(centerX+ls.x-ls.width/2)+','+ls.y+')');
    g.append('rect').attr('width',ls.width).attr('height',ls.height).attr('rx',4)
      .attr('fill',COLORS[ls.span.spanType]||'#888').attr('opacity',0.85).attr('stroke','#ccc').attr('stroke-width',1);
    if (ls.span.endYear === 'ongoing') {
      g.append('line').attr('x1',0).attr('x2',ls.width).attr('y1',ls.height).attr('y2',ls.height)
        .attr('stroke','#ccc').attr('stroke-width',2).attr('stroke-dasharray','4,3');
    }
    const title = ls.span.title.length > 12 ? ls.span.title.slice(0,11)+'…' : ls.span.title;
    g.append('text').attr('x',ls.width/2).attr('y',Math.min(ls.height/2,16)).attr('text-anchor','middle')
      .attr('fill','#fff').attr('font-size',11).attr('font-weight','bold').text(title);

    for (const se of ls.span.subEvents) {
      const seY = yScale(se.date) - ls.y;
      if (seY < 0 || seY > ls.height) continue;
      g.append('line').attr('x1',0).attr('x2',ls.width).attr('y1',seY).attr('y2',seY)
        .attr('stroke','#fff').attr('stroke-width',1).attr('stroke-dasharray','2,2').attr('opacity',0.6);
      g.append('line').attr('x1',0).attr('x2',ls.width).attr('y1',seY).attr('y2',seY)
        .attr('stroke','transparent').attr('stroke-width',8).attr('cursor','pointer')
        .on('mouseenter', e => { tooltip.textContent = se.label ? se.date+': '+se.label : ''+se.date; tooltip.style.display='block'; tooltip.style.left=e.pageX+10+'px'; tooltip.style.top=e.pageY-20+'px'; })
        .on('mouseleave', () => { tooltip.style.display='none'; });
    }
  }
})();
<\/script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'history-mapper-timeline.html';
  a.click();
  URL.revokeObjectURL(url);
}
