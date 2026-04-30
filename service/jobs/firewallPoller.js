'use strict';

const cron         = require('node-cron');
const config       = require('../config');
const jiraClient   = require('../clients/jiraClient');
const { correlateAll }  = require('../lib/projectCorrelator');
const { analyseAll }    = require('../lib/analysisEngine');
const { writeResults }  = require('../lib/resultStore');

let _running = false;
let _lastRun = null;
let _lastResult = null;
let _cronJob = null;

/**
 * Execute one full poll cycle:
 *   1. Fetch open firewall issues from JIRA (or stub)
 *   2. Correlate each issue to a project in the portal snapshot
 *   3. Run LLM analysis for each issue
 *   4. Persist results to analysis-results.json
 *
 * @returns {Promise<{ count: number, results: Array }>}
 */
async function runPoll() {
  if (_running) {
    console.log('[poller] Poll already in progress — skipping');
    return { count: 0, results: [], skipped: true, reason: "already running" };
  }

  _running = true;
  console.log('[poller] Starting poll cycle…');

  try {
    const issues      = await jiraClient.getFirewallIssues();
    console.log(`[poller] Fetched ${issues.length} issue(s)`);

    const correlated  = correlateAll(issues);
    const results     = await analyseAll(correlated);

    writeResults(results);

    _lastRun    = new Date().toISOString();
    _lastResult = { count: results.length, at: _lastRun };

    console.log(`[poller] Poll complete — ${results.length} issue(s) analysed`);
    return { count: results.length, results };
  } catch (err) {
    console.error('[poller] Poll cycle failed:', err.message);
    throw err;
  } finally {
    _running = false;
  }
}

/**
 * Register the cron schedule defined in config.
 * Call this once from server.js at startup.
 */
function schedulePoll() {
  const expr = config.poll.cron;

  if (!cron.validate(expr)) {
    console.warn(`[poller] Invalid POLL_CRON expression "${expr}" — polling disabled`);
    return;
  }

  console.log(`[poller] Scheduling cron: "${expr}"`);
  _cronJob = cron.schedule(expr, () => {
    console.log('[poller] Cron triggered');
    runPoll().catch((err) => console.error('[poller] Unhandled cron error:', err.message));
  });
}

/**
 * Return a summary of the last run (for health/status endpoints).
 */
function getStatus() {
  let nextDate = null;
  if (_cronJob) {
    try {
      // Very naive next execution time for UI display when node-cron doesn't expose it properly across versions
      nextDate = `Scheduled based on cron: ${config.poll.cron}`;
    } catch (e) {
      // Ignored
    }
  }

  return {
    running:    _running,
    lastRun:    _lastRun,
    nextRun:    nextDate,
    lastResult: _lastResult,
    stubMode: {
      jira: config.jira.stubMode,
      llm:  config.llm.stubMode,
    },
  };
}

module.exports = { runPoll, schedulePoll, getStatus };
