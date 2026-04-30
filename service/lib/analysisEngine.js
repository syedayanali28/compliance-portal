'use strict';

const { analyseFirewallRequest }  = require('../clients/llmClient');
const { postComment }             = require('../clients/jiraClient');
const { findMatchingFirewallRow } = require('./projectCorrelator');
const { getFirewallRows }         = require('./firewallRowsFromProject');
const config = require('../config');
const fs                          = require('fs');
const path                        = require('path');

function jiraBrowseUrl(issueKey) {
  const base = (config.jira.url || '').replace(/\/$/, '');
  return base ? `${base}/browse/${issueKey}` : null;
}

/**
 * Links reviewers see alongside an analysis (Jira, ARB, portal artefacts, pasted URLs).
 * @param {string} issueKey
 * @param {object|null} project
 * @param {object} reviewerMeta
 * @returns {Array<{ label: string, type: string, url: string|null, note?: string }>}
 */
function buildSourceDocuments(issueKey, project, reviewerMeta = {}) {
  const docs = [];
  const ju = jiraBrowseUrl(issueKey);
  if (ju) {
    docs.push({ label: `Firewall request ${issueKey}`, type: 'jira', url: ju });
  } else {
    docs.push({
      label: `Firewall request ${issueKey}`,
      type: 'jira',
      url: null,
      note: 'Set JIRA_BASE_URL on the analysis service for clickable Jira links.',
    });
  }

  if (reviewerMeta.linkedArbKey) {
    const arbUrl = reviewerMeta.linkedArbUrl || jiraBrowseUrl(reviewerMeta.linkedArbKey);
    docs.push({ label: `ARB ${reviewerMeta.linkedArbKey}`, type: 'jira', url: arbUrl });
  }

  if (project && project.diagramFilename) {
    docs.push({
      label: project.diagramFilename,
      type: 'diagram',
      url: null,
      note: 'Linked in Projects Portal — snapshot sync sends diagram XML to the analysis service.',
    });
  }

  if (project && project.firewallIdacFilename) {
    docs.push({
      label: project.firewallIdacFilename,
      type: 'idac',
      url: null,
      note: 'IdaC workbook linked in Projects Portal.',
    });
  }

  const extra = reviewerMeta.additionalLinks;
  if (Array.isArray(extra)) {
    for (const l of extra) {
      if (l && l.url && l.label) {
        docs.push({ label: l.label, type: 'other', url: l.url });
      }
    }
  }

  return docs;
}

function defaultConfidenceForOutcome(outcome) {
  return (
    {
      likely_approved: 82,
      requires_clarification: 30,
      pending_review: 55,
    }[outcome] ?? 55
  );
}

let preloadedSchemaRules = null;
function loadSchemaRules() {
  if (preloadedSchemaRules) return preloadedSchemaRules;
  try {
    const schemaPath = path.join(__dirname, '../../src/main/webapp/schemas/architecture.schema.json');
    if (fs.existsSync(schemaPath)) {
      const raw = fs.readFileSync(schemaPath, 'utf8');
      const schema = JSON.parse(raw);
      preloadedSchemaRules = {
        edgeRules: schema.rules && schema.rules.edgeRules ? schema.rules.edgeRules : [],
        firewallRules: schema.firewallRules && schema.firewallRules.rules ? schema.firewallRules.rules : []
      };
      return preloadedSchemaRules;
    }
  } catch (err) {
    console.error('[analysisEngine] Failed to read architecture.schema.json', err.message);
  }
  return {};
}

/**
 * Build the LLM context payload for a single JIRA issue.
 *
 * @param {object} issue
 * @param {object|null} project  Matched project from the portal snapshot
 * @param {object|null} firewallRow  Matched firewall row from the project's IdaC sheet (or legacy JSON)
 * @returns {object}
 */
function buildContext(issue, project, firewallRow) {
  const projectDiagramRules = project ? getFirewallRows(project) : [];

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
    schemaRules: loadSchemaRules(),
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
 * @param {object} [reviewerMeta]  linkedArbKey, linkedArbUrl, reviewerNotes, additionalLinks
 * @returns {object}
 */
function buildResultRecord(issue, project, firewallRow, llmResult, jiraComment, reviewerMeta = {}) {
  const confidencePercent =
    typeof llmResult.confidencePercent === 'number'
      ? llmResult.confidencePercent
      : defaultConfidenceForOutcome(llmResult.outcome);

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
    confidencePercent,
    reasoningSteps:       llmResult.reasoningSteps || [],
    linkedArbKey:         reviewerMeta.linkedArbKey || null,
    linkedArbUrl:         reviewerMeta.linkedArbUrl || null,
    reviewerNotes:        reviewerMeta.reviewerNotes || null,
    sourceDocuments:      buildSourceDocuments(issue.key, project, reviewerMeta),
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
    llmError:             llmResult.llmError || false,
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
 * @param {object} [reviewerMeta] Optional ARB / notes / extra doc links for the dashboard.
 * @returns {Promise<object>} Result record
 */
async function analyseIssue(issue, project, reviewerMeta = {}) {
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

  return buildResultRecord(issue, project, firewallRow, llmResult, jiraComment, reviewerMeta);
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
