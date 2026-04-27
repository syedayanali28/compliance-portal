/**
 * Parses CSP Architecture 2.drawio into an ordered build sequence:
 * vertices first (parents before children), then edges (after both endpoints exist).
 */
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

function parseDiagram(drawioPath) {
  const xml = fs.readFileSync(drawioPath, 'utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    parseAttributeValue: false,
    trimValues: true,
  });
  const tree = parser.parse(xml);

  const cells = [];
  function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const tag = Object.keys(node).find((k) => k !== ':@');
      if (!tag) continue;
      const attrs = node[':@'] || {};
      if (tag === 'mxCell') {
        cells.push({ kind: 'mxCell', attrs, children: node[tag] || [] });
      } else if (tag === 'object') {
        const inner = (node[tag] || []).find(
          (n) => Object.keys(n).find((k) => k !== ':@') === 'mxCell'
        );
        const innerAttrs = inner ? inner[':@'] || {} : {};
        const innerChildren = inner ? inner.mxCell || [] : [];
        cells.push({
          kind: 'object',
          attrs: { ...attrs, ...innerAttrs },
          children: innerChildren,
        });
      } else {
        walk(node[tag]);
      }
    }
  }
  walk(tree);

  const built = cells
    .map((c) => {
      const a = c.attrs;
      const id = a['@_id'];
      const parent = a['@_parent'];
      if (!id || !parent) return null;
      const isEdge = a['@_edge'] === '1';
      const isVertex = a['@_vertex'] === '1';
      const geo = (c.children || []).find(
        (n) => Object.keys(n).find((k) => k !== ':@') === 'mxGeometry'
      );
      let geometry = null;
      let points = [];
      if (geo) {
        const ga = geo[':@'] || {};
        geometry = {
          x: ga['@_x'] ? parseFloat(ga['@_x']) : 0,
          y: ga['@_y'] ? parseFloat(ga['@_y']) : 0,
          width: ga['@_width'] ? parseFloat(ga['@_width']) : 0,
          height: ga['@_height'] ? parseFloat(ga['@_height']) : 0,
          relative: ga['@_relative'] === '1',
        };
        const arr = (geo.mxGeometry || []).find(
          (n) => Object.keys(n).find((k) => k !== ':@') === 'Array'
        );
        if (arr) {
          for (const p of arr.Array || []) {
            const tag = Object.keys(p).find((k) => k !== ':@');
            if (tag === 'mxPoint') {
              const pa = p[':@'] || {};
              points.push({
                x: parseFloat(pa['@_x'] || '0'),
                y: parseFloat(pa['@_y'] || '0'),
              });
            }
          }
        }
      }
      return {
        id,
        parent,
        isEdge,
        isVertex,
        edge: isEdge,
        vertex: isVertex,
        connectable: a['@_connectable'],
        source: a['@_source'] || null,
        target: a['@_target'] || null,
        style: a['@_style'] || '',
        value: a['@_value'] || a['@_label'] || '',
        label: a['@_label'] || null,
        archZoneId: a['@_archZoneId'] || null,
        archComponentId: a['@_archComponentId'] || null,
        archCategory: a['@_archCategory'] || null,
        archContainerType: a['@_archContainerType'] || null,
        placeholders: a['@_placeholders'] || null,
        geometry,
        points,
      };
    })
    .filter(Boolean);

  // Topologically order vertices (parents before children) then edges.
  const byId = new Map(built.map((c) => [c.id, c]));
  const placed = new Set();
  const order = [];

  // Always make sure root containers go first; '1' is the page root.
  function placeVertex(c) {
    if (placed.has(c.id)) return;
    if (c.parent !== '1' && byId.has(c.parent)) {
      placeVertex(byId.get(c.parent));
    }
    if (c.isVertex || (!c.isEdge && c.parent)) {
      order.push(c);
      placed.add(c.id);
    }
  }
  for (const c of built) {
    if (c.isVertex || (!c.isEdge && (c.archZoneId || c.archComponentId))) placeVertex(c);
  }
  // any leftover non-edges (e.g., edge labels are vertices but parented to edges; defer them)
  for (const c of built) {
    if (!c.isEdge && !placed.has(c.id) && !byId.has(c.parent)) {
      order.push(c);
      placed.add(c.id);
    }
  }
  // Edges last, in original order, but only if both endpoints exist.
  for (const c of built) {
    if (c.isEdge && !placed.has(c.id)) {
      order.push(c);
      placed.add(c.id);
    }
  }
  // Then edge-label vertices (parent is an edge).
  for (const c of built) {
    if (!placed.has(c.id)) {
      order.push(c);
      placed.add(c.id);
    }
  }

  return order;
}

if (require.main === module) {
  const seq = parseDiagram(path.resolve(__dirname, '..', '..', 'CSP Architecture 2.drawio'));
  console.log(`Parsed ${seq.length} cells`);
  console.log(JSON.stringify(seq.slice(0, 3), null, 2));
}

module.exports = { parseDiagram };
