'use strict';

const express = require('express');
const router  = express.Router();

const {
  readResults,
  getResultsByProject,
  getResultByJiraKey,
} = require('../lib/resultStore');

const { runPoll, getStatus } = require('../jobs/firewallPoller');
const config                 = require('../config');

// GET /api/health
router.get('/health', (_req, res) => {
  const status = getStatus();
  res.json({
    status:   'ok',
    stubMode: { jira: config.jira.stubMode, llm: config.llm.stubMode },
    poller:   status,
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

// POST /api/run — manually trigger the poller
router.post('/run', async (_req, res) => {
  try {
    res.json({ started: true, message: 'Poll started in background' });
    // Run after sending response so client isn't kept waiting
    runPoll().catch((err) => console.error('[route /run] Poll error:', err.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
