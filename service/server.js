'use strict';

const express        = require('express');
const cors           = require('cors');
const config         = require('./config');
const analysisRoutes = require('./routes/analysisRoutes');
const projectRoutes  = require('./routes/projectRoutes');
const jiraRoutes     = require('./routes/jiraRoutes');
const chatRoutes     = require('./routes/chatRoutes');
const { schedulePoll } = require('./jobs/firewallPoller');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: false }));  // allow all localhost origins in dev
app.use(express.json({ limit: '50mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', analysisRoutes);
app.use('/api', projectRoutes);
app.use('/api', jiraRoutes);
app.use('/api/chat', chatRoutes);

// 404 handler (logs to the same terminal as `node server.js`)
app.use((req, res) => {
  console.warn('[404]', req.method, req.originalUrl);
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = config.service.port;

app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  HKMA Firewall Analysis Service                      ║');
  console.log(`║  Listening on http://localhost:${PORT}                   ║`);
  console.log(`║  JIRA stub mode : ${config.jira.stubMode ? 'YES (no JIRA_URL)        ' : 'NO (real JIRA)         '}║`);
  console.log(`║  LLM  stub mode : ${config.llm.stubMode  ? 'YES (no LLM/MaaS URL in .env)   ' : 'NO (real LLM)          '}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /api/health/probes');
  console.log('    GET  /api/analysis');
  console.log('    GET  /api/analysis/:projectId');
  console.log('    GET  /api/analysis/issue/:jiraKey');
  console.log('    POST /api/analysis/review');
  console.log('    POST /api/run');
  console.log('    GET  /api/jira/firewall-search?q=');
  console.log('    GET  /api/jira/firewall/:issueKey');
  console.log('    GET  /api/projects');
  console.log('    POST /api/projects/sync');
  console.log('    POST /api/projects/artefacts');
  console.log('    POST /api/chat');
  console.log('');
  if (config.llm.stubMode) {
    console.log('  LLM chat: add LLM_ENDPOINT / LLM_URL or MAAS_URL (+ keys) to service/.env — copy from .env.example');
    console.log('');
  } else {
    console.log('  LLM chat: logs use prefix [chat <id>] in this terminal (start / steps / finish / errors).');
    console.log('');
  }

  schedulePoll();
});

module.exports = app;
