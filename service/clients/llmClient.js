'use strict';

const axios  = require('axios');
const config = require('../config');

// ── Stub logic (mirrors Phase 3 buildAnalysisStubForRow) ─────────────────────

const REVIEWERS = [
  { name: 'Raymond So', team: 'ITS', role: 'Security Reviewer'    },
  { name: 'Ryan Chan',  team: 'BSA', role: 'Architecture Reviewer' },
];

/**
 * Produce a deterministic stub analysis based on the context supplied.
 * This mirrors the Phase 3 `buildAnalysisStubForRow` logic so stubs are
 * consistent whether the analysis is triggered from the browser or the service.
 *
 * @param {object} context  — see analyseFirewallRequest for shape
 * @returns {object} Analysis result
 */
function stubAnalyse(context) {
  const row              = context.matchedFirewallRow || {};
  const validationAllowed = row.validation ? row.validation.allowed : true;
  const violationRuleIds  = (row.validation && row.validation.violationRuleIds) || [];
  const appliedRuleIds    = row.appliedRuleIds || [];
  const usedDefault       = appliedRuleIds.indexOf('__default__') !== -1;
  const issue             = context.jiraIssue || {};

  let outcome;
  let requiresClarification;
  let evidenceRuleIds;
  let analysis;

  if (!validationAllowed) {
    outcome                = 'requires_clarification';
    requiresClarification  = true;
    evidenceRuleIds        = violationRuleIds;
    analysis               = `[STUB] JIRA issue ${issue.key || '?'} corresponds to a flow that violates schema validation rule(s): ${violationRuleIds.join(', ')}. This request requires security clarification before it can be approved.`;
  } else if (usedDefault) {
    outcome                = 'pending_review';
    requiresClarification  = false;
    evidenceRuleIds        = ['__default__'];
    analysis               = `[STUB] JIRA issue ${issue.key || '?'} was matched to a flow using the default firewall rule — no specific schema rule covers this connection. A manual architecture review is recommended.`;
  } else {
    outcome                = 'likely_approved';
    requiresClarification  = false;
    evidenceRuleIds        = appliedRuleIds;
    analysis               = `[STUB] JIRA issue ${issue.key || '?'} corresponds to a flow that aligns with schema firewall rule(s): ${appliedRuleIds.join(', ')}. This request is likely to be approved subject to standard review.`;
  }

  return {
    analysis,
    outcome,
    requiresClarification,
    evidenceRuleIds,
    reviewers: REVIEWERS,
    llmStub:   true,
  };
}

/**
 * Send a firewall request context to the LLM for analysis.
 * Falls back to deterministic stub when LLM_URL is not configured.
 *
 * Context payload shape:
 * {
 *   jiraIssue:           { key, summary, description, ... },
 *   projectDiagramRules: [ ...firewallRows from linked diagram ],
 *   schemaRules:         { edgeRules: [], firewallRules: {} },
 *   matchedFirewallRow:  { ...row } | null
 * }
 *
 * Expected LLM response shape:
 * {
 *   analysis:             string,
 *   outcome:              "likely_approved" | "requires_clarification" | "pending_review",
 *   requiresClarification: boolean,
 *   evidenceRuleIds:      string[]
 * }
 *
 * @param {object} context
 * @returns {Promise<object>}
 */
async function analyseFirewallRequest(context) {
  if (config.llm.stubMode) {
    console.log('[llmClient] STUB MODE — generating deterministic analysis');
    return stubAnalyse(context);
  }

  try {
    const response = await axios.post(
      config.llm.url,
      context,
      {
        headers: {
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'Authorization': config.llm.apiKey ? `Bearer ${config.llm.apiKey}` : undefined,
        },
        timeout: 30000,
      }
    );

    const result = response.data;
    console.log(`[llmClient] LLM responded: outcome=${result.outcome}`);

    return {
      analysis:              result.analysis              || '',
      outcome:               result.outcome               || 'pending_review',
      requiresClarification: result.requiresClarification || false,
      evidenceRuleIds:       result.evidenceRuleIds       || [],
      reviewers:             REVIEWERS,
      llmStub:               false,
    };
  } catch (err) {
    console.error('[llmClient] LLM call failed, falling back to stub:', err.message);
    const fallback   = stubAnalyse(context);
    fallback.analysis = `[LLM UNAVAILABLE — STUB FALLBACK] ${fallback.analysis}`;
    return fallback;
  }
}

module.exports = { analyseFirewallRequest };
