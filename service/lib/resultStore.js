'use strict';

const fs   = require('fs');
const path = require('path');

const RESULTS_FILE    = path.join(__dirname, '../data/analysis-results.json');
const PROJECTS_FILE   = path.join(__dirname, '../data/projects-snapshot.json');
/** Rich artefacts (e.g. diagram XML) pushed from the portal for LLM tools — kept separate from the lightweight snapshot. */
const PROJECT_ARTEFACTS_FILE = path.join(__dirname, '../data/project-artefacts.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`[resultStore] Could not read ${filePath}:`, err.message);
    }
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── Analysis Results ──────────────────────────────────────────────────────────

/**
 * Read all analysis results from disk.
 * @returns {Array}
 */
function readResults() {
  return readJson(RESULTS_FILE, []);
}

/**
 * Persist analysis results to disk.
 * New results are merged with existing ones (upsert by jiraKey).
 *
 * @param {Array} newResults
 */
function writeResults(newResults) {
  const existing = readResults();

  const byKey = {};
  for (const r of existing)   { byKey[r.jiraKey] = r; }
  for (const r of newResults) { byKey[r.jiraKey] = r; }

  const merged = Object.values(byKey).sort(
    (a, b) => new Date(b.analysedAt) - new Date(a.analysedAt)
  );

  writeJson(RESULTS_FILE, merged);
  console.log(`[resultStore] Wrote ${merged.length} total results (${newResults.length} new/updated)`);
}

/**
 * Return results filtered by projectId.
 * @param {string} projectId
 * @returns {Array}
 */
function getResultsByProject(projectId) {
  return readResults().filter((r) => r.projectId === projectId);
}

/**
 * Return a single result by JIRA issue key.
 * @param {string} jiraKey
 * @returns {object|null}
 */
function getResultByJiraKey(jiraKey) {
  return readResults().find((r) => r.jiraKey === jiraKey) || null;
}

// ── Projects Snapshot ─────────────────────────────────────────────────────────

/**
 * Read the projects snapshot exported from the portal.
 * @returns {Array}
 */
function readProjectsSnapshot() {
  return readJson(PROJECTS_FILE, []);
}

/**
 * Overwrite the projects snapshot (called by POST /api/projects/sync).
 * @param {Array} projects
 */
function writeProjectsSnapshot(projects) {
  writeJson(PROJECTS_FILE, projects);
  console.log(`[resultStore] Projects snapshot updated (${projects.length} projects)`);
}

// ── Project artefacts (diagrams for LLM, etc.) ─────────────────────────────

/**
 * @returns {Record<string, { diagramXml?: string, diagramFilename?: string }>}
 */
function readProjectArtefacts() {
  return readJson(PROJECT_ARTEFACTS_FILE, {});
}

/**
 * Merge diagram (and future) artefacts keyed by project id.
 * @param {Array<{ id: string, diagramXml?: string|null, diagramFilename?: string|null }>} items
 */
function mergeProjectArtefacts(items) {
  const existing = readProjectArtefacts();
  const next = { ...existing };
  for (const item of items || []) {
    if (!item || !item.id) continue;
    const prev = next[item.id] || {};
    next[item.id] = {
      ...prev,
      diagramXml:
        item.diagramXml === undefined ? prev.diagramXml : item.diagramXml || undefined,
      diagramFilename:
        item.diagramFilename === undefined
          ? prev.diagramFilename
          : item.diagramFilename || undefined,
    };
    if (!next[item.id].diagramXml) {
      delete next[item.id].diagramXml;
      delete next[item.id].diagramFilename;
    }
    if (Object.keys(next[item.id]).length === 0) delete next[item.id];
  }
  writeJson(PROJECT_ARTEFACTS_FILE, next);
  console.log(`[resultStore] Project artefacts updated (${Object.keys(next).length} projects with artefacts)`);
  return next;
}

/**
 * @param {string|null} projectId
 * @param {string} [projectCodeHint]  used only to find id from snapshot when id is missing
 * @returns {{ diagramXml?: string, diagramFilename?: string }|null}
 */
function getDiagramArtefact(projectId, projectCodeHint) {
  const all = readProjectArtefacts();
  let id = projectId;
  if (!id && projectCodeHint) {
    const code = String(projectCodeHint).trim().toLowerCase();
    const projects = readProjectsSnapshot();
    const p = projects.find(
      (x) =>
        String(x.code || '')
          .trim()
          .toLowerCase() === code
    );
    if (p) id = p.id;
  }
  if (!id) return null;
  const a = all[id];
  return a && a.diagramXml ? a : null;
}

module.exports = {
  readResults,
  writeResults,
  getResultsByProject,
  getResultByJiraKey,
  readProjectsSnapshot,
  writeProjectsSnapshot,
  readProjectArtefacts,
  mergeProjectArtefacts,
  getDiagramArtefact,
};
