'use strict';

const XLSX = require('xlsx');

/**
 * Legacy snapshot: embedded JSON (no longer written by the portal).
 *
 * @param {object} project
 * @returns {object[]}
 */
function rowsFromFirewallJson(project) {
  if (!project || !project.firewallJson) {
    return [];
  }
  try {
    const parsed = typeof project.firewallJson === 'string'
      ? JSON.parse(project.firewallJson)
      : project.firewallJson;

    return parsed.requests || parsed.rows || (Array.isArray(parsed) ? parsed : []);
  } catch (_) {
    return [];
  }
}

/**
 * Parse IdaC "System Connections" workbook (portal-linked .xlsx as base64).
 * Column layout must match `FirewallIdacXlsx.js` buildDataRowXml (0-based indices).
 *
 * @param {string} base64
 * @returns {object[]}
 */
function rowsFromIdacBase64(base64) {
  if (!base64 || typeof base64 !== 'string') {
    return [];
  }

  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch (_) {
    return [];
  }

  if (!buf.length) {
    return [];
  }

  let wb;
  try {
    wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
  } catch (err) {
    console.warn('[firewallRows] Could not read IdaC xlsx:', err.message);
    return [];
  }

  const names = wb.SheetNames || [];
  let sheetName = names.find((n) => /system\s*connections/i.test(String(n)));
  if (!sheetName && names.length >= 2) {
    sheetName = names[1];
  }
  if (!sheetName && names.length) {
    sheetName = names[0];
  }
  if (!sheetName) {
    return [];
  }

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    return [];
  }

  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const out = [];

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || !r.length) {
      continue;
    }

    const srcLabel = String(r[1] || '').trim();
    const dstLabel = String(r[5] || '').trim();
    const srcId = String(r[19] != null ? r[19] : '').trim();
    const dstId = String(r[20] != null ? r[20] : '').trim();

    if (!srcLabel && !dstLabel && !srcId && !dstId) {
      continue;
    }
    if (i > 220) {
      break;
    }

    out.push({
      sourceComponentId:   srcId || null,
      destComponentId:     dstId || null,
      sourceComponentLabel: srcLabel || null,
      destComponentLabel:   dstLabel || null,
      sourceCategory:      r[2] || null,
      destCategory:        r[6] || null,
      sourceZoneLabel:     r[3] || null,
      destZoneLabel:       r[7] || null,
      direction:           r[9] || null,
      protocol:            r[10] || null,
      ports:               r[11] || null,
    });
  }

  return out;
}

/**
 * Rows for JIRA / LLM correlation: IdaC xlsx first, then legacy JSON.
 *
 * @param {object|null} project
 * @returns {object[]}
 */
function getFirewallRows(project) {
  if (!project) {
    return [];
  }
  const fromXlsx = rowsFromIdacBase64(project.firewallIdacXlsxBase64);
  if (fromXlsx.length) {
    return fromXlsx;
  }
  return rowsFromFirewallJson(project);
}

module.exports = {
  getFirewallRows,
  rowsFromIdacBase64,
  rowsFromFirewallJson,
};
