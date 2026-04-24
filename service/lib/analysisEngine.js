'use strict';

const { analyseFirewallRequest }  = require('../clients/llmClient');
const { postComment }             = require('../clients/jiraClient');
const { findMatchingFirewallRow } = require('./projectCorrelator');
const config                      = require('../config');

/**
 * Build the LLM context payload for a single JIRA issue.
 *
 * @param {object} issue
 * @param {object|null} project  Matched project from the portal snapshot
 * @param {object|null} firewallRow  Matched firewall row from the project's linked JSON
 * @returns {object}
 */
function buildContext(issue, project, firewallRow) {
  let projectDiagramRules = [];

  if (project && project.firewallJson) {
    try {
      const parsed = typeof project.firewallJson === 'string'
        ? JSON.parse(project.firewallJson)
        : project.firewallJson;
      projectDiagramRules = parsed.requests || parsed.rows || (Array.isArray(parsed) ? parsed : []);
    } catch (_) { /* ignore */ }
  }

  return {
    jiraIssue: {
      key:         issue.key,
      summary:     issue.fields.summary     || '',
      description: issue.fields.description || '',
      status:      (issue.fields.status && issue.fields.status.name) || '',
      assignee:    (issue.fields.assignee   && issue.fields.assignee.displayName) || '',
      sourceComponent: issue.fields.customfield_sourceComponent || '',
      destComponent:   issue.fields.customfield_destComponent   || '',
      protocol:        issue.fields.customfield_protocol        || '',
      port:            issue.fields.customfield_port            || '',
      sourceZone:      issue.fields.customfield_sourceZone      || '',
      destZone:        issue.fields.customfield_destZone        || '',
    },
    projectDiagramRules,
    schemaRules: {},   // TODO: load schema when service has access to architecture.schema.json
    matchedFirewallRow: firewallRow,
  };
}

/**
 * Format an analysis result record (persisted in analysis-results.json).
 *
 * @param {object} issue
 * @param {object|null} project
 * @param {object|null} firewallRow
 * @param {object} llmResult  Response from llmClient.analyseFirewallRequest
 * @param {object|null} jiraComment  Comment posted to JIRA, or null
 * @returns {object}
 */
function buildResultRecord(issue, project, firewallRow, llmResult, jiraComment) {
  return {
    analysedAt:           new Date().toISOString(),
    jiraKey:              issue.key,
    projectId:            project ? project.id   : null,
    projectCode:          project ? project.code : null,
    projectName:          project ? project.name : null,
    llmStub:              llmResult.llmStub !== false,
    outcome:              llmResult.outcome,
    requiresClarification: llmResult.requiresClarification,
    analysis:             llmResult.analysis,
    evidenceRuleIds:      llmResult.evidenceRuleIds || [],
    reviewers:            llmResult.reviewers       || [],
    jiraIssue: {
      key:         issue.key,
      summary:     issue.fields.summary || '',
      status:      (issue.fields.status && issue.fields.status.name) || '',
      assignee:    (issue.fields.assignee && issue.fields.assignee.displayName) || '',
      sourceComponent: issue.fields.customfield_sourceComponent || '',
      destComponent:   issue.fields.customfield_destComponent   || '',
      protocol:        issue.fields.customfield_protocol        || '',
      port:            issue.fields.customfield_port            || '',
    },
    matchedFirewallRow:   firewallRow  || null,
    jiraCommentPosted:    !!jiraComment,
    jiraCommentId:        jiraComment ? (jiraComment.id || null) : null,
  };
}

/**
 * Analyse a single JIRA issue end-to-end:
 *  1. Correlate with project (caller already did this — receives project/row)
 *  2. Build LLM context
 *  3. Call LLM
 *  4. Optionally post JIRA comment
 *  5. Return result record
 *
 * @param {object} issue
 * @param {object|null} project
 * @returns {Promise<object>} Result record
 */
async function analyseIssue(issue, project) {
  const firewallRow = project ? findMatchingFirewallRow(issue, project) : null;
  const context     = buildContext(issue, project, firewallRow);

  console.log(`[analysisEngine] Analysing ${issue.key} — project: ${project ? project.name : '(none)'}, row matched: ${!!firewallRow}`);

  const llmResult = await analyseFirewallRequest(context);

  let jiraComment = null;
  if (config.poll.postJiraComments && !config.jira.stubMode) {
    const commentBody = formatJiraComment(llmResult, issue.key);
    try {
      jiraComment = await postComment(issue.key, commentBody);
    } catch (err) {
      console.warn(`[analysisEngine] Failed to post comment to ${issue.key}:`, err.message);
    }
  }

  return buildResultRecord(issue, project, firewallRow, llmResult, jiraComment);
}

/**
 * Analyse all correlated { issue, project } pairs.
 *
 * @param {Array<{ issue, project }>} correlated
 * @returns {Promise<Array>} Array of result records
 */
async function analyseAll(correlated) {
  const results = [];
  for (const { issue, project } of correlated) {
    try {
      const record = await analyseIssue(issue, project);
      results.push(record);
    } catch (err) {
      console.error(`[analysisEngine] Error analysing ${issue.key}:`, err.message);
    }
  }
  return results;
}

/**
 * Format a concise JIRA comment from the LLM result.
 * @param {object} llmResult
 * @param {string} jiraKey
 * @returns {string}
 */
function formatJiraComment(llmResult, jiraKey) {
  const outcomeLabel = {
    likely_approved:       '✅ Likely Approved',
    requires_clarification: '⚠️ Requires Clarification',
    pending_review:        '🔄 Pending Review',
  }[llmResult.outcome] || llmResult.outcome;

  const lines = [
    `*Architecture Firewall Analysis — ${jiraKey}*`,
    '',
    `*Outcome:* ${outcomeLabel}`,
    `*Requires Clarification:* ${llmResult.requiresClarification ? 'Yes' : 'No'}`,
    '',
    `*Analysis:*`,
    llmResult.analysis,
  ];

  if (llmResult.evidenceRuleIds && llmResult.evidenceRuleIds.length > 0) {
    lines.push('', `*Evidence Rules:* ${llmResult.evidenceRuleIds.join(', ')}`);
  }

  if (llmResult.reviewers && llmResult.reviewers.length > 0) {
    const rList = llmResult.reviewers.map((r) => `${r.name} (${r.team})`).join(', ');
    lines.push('', `*Reviewers:* ${rList}`);
  }

  if (llmResult.llmStub) {
    lines.push('', '_Note: This analysis was generated in stub/demo mode._');
  }

  return lines.join('\n');
}

module.exports = { analyseIssue, analyseAll };
