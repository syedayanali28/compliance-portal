'use strict';

const express        = require('express');
const cors           = require('cors');
const config         = require('./config');
const analysisRoutes = require('./routes/analysisRoutes');
const projectRoutes  = require('./routes/projectRoutes');
const { schedulePoll } = require('./jobs/firewallPoller');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: false }));  // allow all localhost origins in dev
app.use(express.json({ limit: '10mb' }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api', analysisRoutes);
app.use('/api', projectRoutes);

// 404 handler
app.use((_req, res) => {
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
  console.log(`║  LLM  stub mode : ${config.llm.stubMode  ? 'YES (no LLM_URL)         ' : 'NO (real LLM)          '}║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /api/health');
  console.log('    GET  /api/analysis');
  console.log('    GET  /api/analysis/:projectId');
  console.log('    GET  /api/analysis/issue/:jiraKey');
  console.log('    POST /api/run');
  console.log('    GET  /api/projects');
  console.log('    POST /api/projects/sync');
  console.log('');

  schedulePoll();
});

module.exports = app;
