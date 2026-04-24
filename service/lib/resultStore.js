'use strict';

const fs   = require('fs');
const path = require('path');

const RESULTS_FILE    = path.join(__dirname, '../data/analysis-results.json');
const PROJECTS_FILE   = path.join(__dirname, '../data/projects-snapshot.json');

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

module.exports = {
  readResults,
  writeResults,
  getResultsByProject,
  getResultByJiraKey,
  readProjectsSnapshot,
  writeProjectsSnapshot,
};
