'use strict';

const { readProjectsSnapshot } = require('./resultStore');

/**
 * Attempt to match a JIRA issue to a project in the portal snapshot.
 *
 * Matching strategy (in order):
 *  1. issue.fields.project.key === project.code  (exact, case-insensitive)
 *  2. issue.fields.project.name.toLowerCase() includes project.name.toLowerCase() (fuzzy)
 *  3. Return null (unmatched — still analysed, just without diagram context)
 *
 * @param {object} issue  A JIRA issue object
 * @param {Array}  [projects]  Optional pre-loaded snapshot; reads from disk if omitted
 * @returns {object|null}  The matched project or null
 */
function matchIssueToProject(issue, projects) {
  const snapshot = projects || readProjectsSnapshot();
  if (!snapshot || snapshot.length === 0) { return null; }

  const jiraProjectKey  = ((issue.fields.project && issue.fields.project.key)  || '').toUpperCase();
  const jiraProjectName = ((issue.fields.project && issue.fields.project.name) || '').toLowerCase();

  // 1. Exact key match
  for (const p of snapshot) {
    if (p.code && p.code.toUpperCase() === jiraProjectKey) {
      console.log(`[correlator] Exact key match: issue ${issue.key} → project "${p.name}" (${p.id})`);
      return p;
    }
  }

  // 2. Fuzzy name match
  for (const p of snapshot) {
    if (p.name && jiraProjectName.includes(p.name.toLowerCase())) {
      console.log(`[correlator] Fuzzy name match: issue ${issue.key} → project "${p.name}" (${p.id})`);
      return p;
    }
  }

  console.log(`[correlator] No match for issue ${issue.key} (JIRA project: ${jiraProjectKey || jiraProjectName})`);
  return null;
}

/**
 * Correlate all JIRA issues against the projects snapshot.
 *
 * @param {Array} issues
 * @returns {Array<{ issue: object, project: object|null }>}
 */
function correlateAll(issues) {
  const snapshot = readProjectsSnapshot();
  return issues.map((issue) => ({
    issue,
    project: matchIssueToProject(issue, snapshot),
  }));
}

/**
 * Given a project (with firewallJson), find the firewall row that best matches
 * the source/destination component IDs from the JIRA issue custom fields.
 *
 * @param {object} issue
 * @param {object} project
 * @returns {object|null} Matched firewall row or null
 */
function findMatchingFirewallRow(issue, project) {
  if (!project || !project.firewallJson) { return null; }

  let rows;
  try {
    const parsed = typeof project.firewallJson === 'string'
      ? JSON.parse(project.firewallJson)
      : project.firewallJson;

    rows = parsed.requests || parsed.rows || (Array.isArray(parsed) ? parsed : []);
  } catch (err) {
    console.warn('[correlator] Could not parse project firewallJson:', err.message);
    return null;
  }

  const srcId  = (issue.fields.customfield_sourceComponent || '').toLowerCase();
  const dstId  = (issue.fields.customfield_destComponent   || '').toLowerCase();

  if (!srcId && !dstId) { return null; }

  // Look for a row matching both source and destination component IDs
  const match = rows.find((r) => {
    const rSrc = (r.sourceComponentId || r.source || '').toLowerCase();
    const rDst = (r.destComponentId   || r.dest   || '').toLowerCase();
    return rSrc === srcId && rDst === dstId;
  });

  if (match) {
    console.log(`[correlator] Matched firewall row: ${srcId} → ${dstId}`);
  }

  return match || null;
}

module.exports = { matchIssueToProject, correlateAll, findMatchingFirewallRow };
