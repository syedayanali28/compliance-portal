'use strict';

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
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

  let confidencePercent;
  let reasoningSteps;

  if (!validationAllowed) {
    outcome                = 'requires_clarification';
    requiresClarification  = true;
    evidenceRuleIds        = violationRuleIds;
    analysis               = `[STUB] JIRA issue ${issue.key || '?'} corresponds to a flow that violates schema validation rule(s): ${violationRuleIds.join(', ')}. This request requires security clarification before it can be approved.`;
    confidencePercent      = 34;
    reasoningSteps         = [
      'Compared the Jira flow to the matched IdaC / diagram rule row.',
      'Validation flags indicate one or more schema rules block this path.',
      'Verdict: not valid as-is — needs clarification or design change.',
    ];
  } else if (usedDefault) {
    outcome                = 'pending_review';
    requiresClarification  = false;
    evidenceRuleIds        = ['__default__'];
    analysis               = `[STUB] JIRA issue ${issue.key || '?'} was matched to a flow using the default firewall rule — no specific schema rule covers this connection. A manual architecture review is recommended.`;
    confidencePercent      = 58;
    reasoningSteps         = [
      'A firewall row was found but it relies on the generic default rule.',
      'Without a specific schema rule match, automated confidence is limited.',
      'Verdict: unclear — manual reviewer decision required.',
    ];
  } else {
    outcome                = 'likely_approved';
    requiresClarification  = false;
    evidenceRuleIds        = appliedRuleIds;
    analysis               = `[STUB] JIRA issue ${issue.key || '?'} corresponds to a flow that aligns with schema firewall rule(s): ${appliedRuleIds.join(', ')}. This request is likely to be approved subject to standard review.`;
    confidencePercent      = 86;
    reasoningSteps         = [
      'Source/destination components line up with a documented rule row.',
      'Applied schema firewall rules support this connection.',
      'Verdict: likely valid — subject to your standard approval workflow.',
    ];
  }

  return {
    analysis,
    outcome,
    requiresClarification,
    evidenceRuleIds,
    reviewers: REVIEWERS,
    llmStub:   true,
    confidencePercent,
    reasoningSteps,
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
function getPromptTemplate() {
  try {
    const promptPath = path.resolve(__dirname, '..', config.llm.promptPath || 'prompts/firewall-analysis.prompt.txt');
    if (fs.existsSync(promptPath)) {
      return fs.readFileSync(promptPath, 'utf8');
    }
  } catch (err) {
    console.error('[llmClient] Failed to load prompt template, using default empty wrapper', err.message);
  }
  return '{{CONTEXT}}';
}

async function analyseFirewallRequest(context) {
  if (config.llm.stubMode) {
    console.log('[llmClient] STUB MODE — generating deterministic analysis');
    return stubAnalyse(context);
  }

  const template = getPromptTemplate();
  const promptText = template.replace('{{CONTEXT}}', JSON.stringify(context, null, 2));

  let payload;
  if (config.llm.provider === 'maas') {
    payload = {
      model: config.llm.model,
      messages: [{ role: 'user', content: promptText }]
    };
  } else {
    payload = { prompt: promptText, context };
  }

  let attempt = 0;
  const maxAttempts = 4; // up to 3 retries (1 initial + 3 retries)
  
  while (attempt < maxAttempts) {
    try {
      const endpoint = config.llm.url.endsWith('/chat/completions') 
        ? config.llm.url 
        : `${config.llm.url}/chat/completions`;

      const response = await axios.post(
        endpoint,
        payload,
        {
          headers: {
            'Content-Type':  'application/json',
            'Accept':        'application/json',
            'Authorization': config.llm.apiKey ? `Bearer ${config.llm.apiKey}` : undefined,
          },
          timeout: 30000,
        }
      );

      let resultText = response.data;
      
      // Parse output if it's from MaaS which wraps the actual content
      if (config.llm.provider === 'maas' && response.data.choices && response.data.choices[0].message) {
        let content = response.data.choices[0].message.content || '{}';
        
        // Strip markdown codeblocks
        content = content.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        try {
          resultText = JSON.parse(content);
        } catch (e) {
          console.warn('[llmClient] Failed to parse model JSON content output, falling back to raw', e.message);
          resultText = content;
        }
      }

      console.log(`[llmClient] LLM responded: outcome=${resultText.outcome || 'unknown'}`);

      const fallbackConf = {
        likely_approved: 84,
        requires_clarification: 32,
        pending_review: 55,
      };

      return {
        analysis:              resultText.analysis              || '',
        outcome:               resultText.outcome               || 'pending_review',
        requiresClarification: resultText.requiresClarification || false,
        evidenceRuleIds:       resultText.evidenceRuleIds       || [],
        reviewers:             resultText.reviewers             || REVIEWERS,
        confidencePercent:
          typeof resultText.confidencePercent === 'number'
            ? resultText.confidencePercent
            : fallbackConf[resultText.outcome] ?? 55,
        reasoningSteps:
          Array.isArray(resultText.reasoningSteps) && resultText.reasoningSteps.length
            ? resultText.reasoningSteps
            : (resultText.reasoning ? String(resultText.reasoning).split(/\n+/).map((s) => s.trim()).filter(Boolean) : []),
        llmStub:               false,
        llmError:              false,
      };
    } catch (err) {
      attempt++;
      console.error(`[llmClient] LLM call failed (attempt ${attempt}/${maxAttempts}):`, err.message);
      
      if (attempt < maxAttempts) {
        // Backoff: 2s, 4s, 8s -> Math.pow(2, attempt) * 1000
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[llmClient] Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[llmClient] All LLM retry attempts exhausted, falling back to stub');
        const fallback = stubAnalyse(context);
        fallback.analysis = `[LLM UNAVAILABLE — STUB FALLBACK] ${fallback.analysis}`;
        fallback.llmError = true;
        return fallback;
      }
    }
  }
}

module.exports = { analyseFirewallRequest };
