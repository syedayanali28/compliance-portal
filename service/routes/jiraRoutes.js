'use strict';

const express = require('express');
const router  = express.Router();
const jiraClient = require('../clients/jiraClient');
const config = require('../config');

// GET /api/jira/firewall-search?q=
router.get('/jira/firewall-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const hits = await jiraClient.searchFirewallRequests(q, 30);
    res.json({ query: q, results: hits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jira/firewall/:issueKey — lightweight issue fetch for preview
router.get('/jira/firewall/:issueKey', async (req, res) => {
  try {
    const issue = await jiraClient.getIssueByKey(req.params.issueKey);
    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    res.json({
      key: issue.key,
      summary: issue.fields.summary,
      status: issue.fields.status && issue.fields.status.name,
      projectKey: issue.fields.project && issue.fields.project.key,
      jiraUrl: config.jira.url ? `${config.jira.url}/browse/${issue.key}` : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jira/projects?q=CSP
router.get('/jira/projects', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const projects = await jiraClient.searchProjects(q);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jira/arb?q=<text>
router.get('/jira/arb', async (req, res) => {
  const q = (req.query.q || '').trim();
  try {
    const issues = await jiraClient.searchArbIssues(q);
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jira/issues?projectKey=CSP&type=Firewall+Request
router.get('/jira/issues', async (req, res) => {
  const { projectKey, type } = req.query;
  try {
    const issues = await jiraClient.searchIssues(projectKey, type);
    res.json(issues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jira/arb-update
router.post('/jira/arb-update', async (req, res) => {
  try {
    const payload = Object.assign({}, req.body, { updatedAt: new Date().toISOString().split('T')[0] });
    const result = await jiraClient.updateArbTicket(payload);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
