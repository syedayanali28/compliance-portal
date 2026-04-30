'use strict';

const { readProjectsSnapshot } = require('./resultStore');
const { getFirewallRows } = require('./firewallRowsFromProject');
const stringSimilarity = require('string-similarity');

/**
 * Attempt to match a JIRA issue to a project in the portal snapshot.
 *
 * Matching strategy (in order):
 *  1. issue.fields.project.key === project.code  (exact, case-insensitive)
 *  2. issue.fields.project.name and project.name string similarity (score > 0.8)
 *  3. issue.key prefix (JIRA project key) is a substring of project.code
 *  4. Return null (unmatched — still analysed, just without diagram context)
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
  const issueKeyPrefix = issue.key ? issue.key.split('-')[0].toUpperCase() : '';

  // 1. Exact key match
  for (const p of snapshot) {
    if (p.code && p.code.toUpperCase() === jiraProjectKey) {
      console.log(`[correlator] Exact key match: issue ${issue.key} → project "${p.name}" (${p.id})`);
      return p;
    }
  }

  // 2. Fuzzy name match (string similarity score > 0.8)
  if (jiraProjectName) {
      const projectNames = snapshot.map(p => p.name.toLowerCase());
      const bestMatch = stringSimilarity.findBestMatch(jiraProjectName, projectNames);
      if (bestMatch.bestMatch.rating > 0.8) {
          const matchedProject = snapshot[bestMatch.bestMatchIndex];
          console.log(`[correlator] Fuzzy name match (score: ${bestMatch.bestMatch.rating.toFixed(2)}): issue ${issue.key} → project "${matchedProject.name}" (${matchedProject.id})`);
          return matchedProject;
      }
  }

  // 3. Issue key prefix is substring of project code
  if (issueKeyPrefix) {
      for (const p of snapshot) {
          if (p.code && p.code.toUpperCase().includes(issueKeyPrefix)) {
               console.log(`[correlator] Prefix substring match: issue ${issue.key} → project "${p.name}" (${p.id}) [prefix: ${issueKeyPrefix}, code: ${p.code}]`);
               return p;
          }
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
 * Given a project (IdaC xlsx or legacy firewallJson), find the firewall row that best matches
 * the source/destination component IDs from the JIRA issue custom fields.
 *
 * @param {object} issue
 * @param {object} project
 * @returns {object|null} Matched firewall row or null
 */
function findMatchingFirewallRow(issue, project) {
  if (!project) { return null; }

  const rows = getFirewallRows(project);
  if (!rows.length) {
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
