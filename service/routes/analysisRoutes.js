'use strict';

const express = require('express');
const router  = express.Router();

const {
  readResults,
  getResultsByProject,
  getResultByJiraKey,
  writeResults,
  readProjectsSnapshot,
} = require('../lib/resultStore');

const { runPoll, getStatus } = require('../jobs/firewallPoller');
const config                 = require('../config');
const { getIssueByKey }      = require('../clients/jiraClient');
const { matchIssueToProject } = require('../lib/projectCorrelator');
const { analyseIssue }       = require('../lib/analysisEngine');
const { probeJira, probeLlm } = require('../lib/integrationProbes');

// GET /api/health/probes — Jira session + LLM chat round-trip from the server host
router.get('/health/probes', async (_req, res) => {
  try {
    const jira = await probeJira();
    const llm = await probeLlm({ timeoutMs: 60000 });
    res.json({
      jira: {
        ok: jira.ok,
        user: jira.ok ? jira.displayName || jira.name || jira.key : undefined,
        error: jira.ok ? undefined : jira.error,
      },
      llm: {
        ok: llm.ok,
        snippet: llm.snippet,
        error: llm.ok ? undefined : llm.error,
      },
      stubMode: {
        jira: config.jira.stubMode,
        llm: config.llm.stubMode,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
router.get('/health', (_req, res) => {
  const status = getStatus();
  res.json({
    status:   'ok',
    stubMode: { jira: config.jira.stubMode, llm: config.llm.stubMode },
    poller:   status,
  });
});

// GET /api/status - poller status
router.get('/status', (_req, res) => {
  res.json({
    status: 'ok',
    poller: getStatus(),
    stubMode: { jira: config.jira.stubMode, llm: config.llm.stubMode }
  });
});

// GET /api/analysis — all results, newest first
router.get('/analysis', (_req, res) => {
  try {
    const results = readResults();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/issue/:jiraKey — single result by JIRA key
router.get('/analysis/issue/:jiraKey', (req, res) => {
  try {
    const result = getResultByJiraKey(req.params.jiraKey);
    if (!result) { return res.status(404).json({ error: 'Not found' }); }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analysis/:projectId — results for one project
router.get('/analysis/:projectId', (req, res) => {
  try {
    const results = getResultsByProject(req.params.projectId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/analysis/review — single-issue reviewer workflow (linked ARB + context)
router.post('/analysis/review', async (req, res) => {
  try {
    const body = req.body || {};
    const jiraKeyRaw = body.jiraKey || body.issueKey || '';
    const key = String(jiraKeyRaw).trim().toUpperCase();
    if (!key) {
      return res.status(400).json({ error: 'jiraKey is required' });
    }

    const issue = await getIssueByKey(key);
    if (!issue) {
      return res.status(404).json({ error: `Issue ${key} not found (check Jira connection or stub fixture).` });
    }

    const snapshot = readProjectsSnapshot();
    let project = null;
    const projectId = (body.projectId || '').trim();
    if (projectId) {
      project = snapshot.find((p) => p.id === projectId) || null;
    }
    if (!project) {
      project = matchIssueToProject(issue, snapshot);
    }

    const extra = [];
    if (body.additionalDocUrl && body.additionalDocLabel) {
      extra.push({ label: String(body.additionalDocLabel).trim(), url: String(body.additionalDocUrl).trim() });
    }
    if (Array.isArray(body.additionalLinks)) {
      for (const l of body.additionalLinks) {
        if (l && l.url && l.label) {
          extra.push({ label: String(l.label).trim(), url: String(l.url).trim() });
        }
      }
    }

    const linkedArb = (body.linkedArbKey || '').trim();
    const linkedArbUrl = (body.linkedArbUrl || '').trim();
    const reviewerNotes = (body.reviewerNotes || '').trim();

    const reviewerMeta = {
      additionalLinks: extra,
    };
    if (linkedArb) reviewerMeta.linkedArbKey = linkedArb.toUpperCase();
    if (linkedArbUrl) reviewerMeta.linkedArbUrl = linkedArbUrl;
    if (reviewerNotes) reviewerMeta.reviewerNotes = reviewerNotes;

    const record = await analyseIssue(issue, project, reviewerMeta);
    writeResults([record]);
    res.json(record);
  } catch (err) {
    console.error('[route /analysis/review]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/run — manually trigger the poller
router.post('/run', async (_req, res) => {
  try {
    const status = getStatus();
    if (status.running) {
      return res.json({ skipped: true, reason: 'already running' });
    }
    res.json({ started: true, message: 'Poll started in background' });
    // Run after sending response so client isn't kept waiting
    runPoll().catch((err) => console.error('[route /run] Poll error:', err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
