#!/usr/bin/env node
'use strict';

/**
 * Integration smoke tests: Jira session + LLM chat completions.
 * Loads service/.env and .env.local like the server. Exit 0 only if both pass.
 *
 * Usage from service folder:
 *   npm run test:integrations
 *   npm run test:integrations:system-ca
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
require('dotenv').config({ path: path.join(__dirname, '../.env.local'), override: true });

const config = require('../config');
const { probeJira, probeLlm } = require('../lib/integrationProbes');

async function testJira() {
  console.log('[test] Jira REST GET /rest/api/2/myself');
  const r = await probeJira();
  if (!r.ok) {
    console.log('[test] Jira: FAIL');
    console.error('[test]        ', r.error);
    if (/401|authenticate/i.test(String(r.error))) {
      console.error('[test]         For Cloud API tokens set JIRA_USER_EMAIL and use the token as JIRA_SERVICE_ACCOUNT_TOKEN.');
      console.error('[test]         For Server PAT leave JIRA_USER_EMAIL unset and fix or renew the PAT.');
    }
    if (/certificate|UNAUTHORIZED|TLS|DEPTH_ZERO/i.test(String(r.error))) {
      console.error('[test]         Try JIRA_TLS_INSECURE=true or import your org CA.');
    }
    return false;
  }
  console.log('[test] Jira: PASS as', r.displayName || r.name || r.key || 'unknown');
  return true;
}

async function testLlm() {
  console.log('[test] LLM POST chat/completions');
  const r = await probeLlm({ timeoutMs: 120000 });
  if (!r.ok) {
    console.log('[test] LLM: FAIL');
    console.error('[test]        ', r.error);
    return false;
  }
  console.log('[test] LLM: PASS snippet:', JSON.stringify(r.snippet));
  return true;
}

async function main() {
  console.log('[test] HKMA analysis service integration checks');
  console.log('[test] Jira stub:', config.jira.stubMode, '| LLM stub:', config.llm.stubMode);
  console.log('[test] Jira TLS insecure:', !!config.jira.tlsInsecure, '| Process TLS relax:', process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0');
  console.log('');

  const j = await testJira();
  console.log('');
  const l = await testLlm();

  if (!j || !l) {
    console.error('\n[test] RESULT: FAIL');
    process.exit(1);
  }
  console.log('\n[test] RESULT: PASS');
  process.exit(0);
}

main().catch((err) => {
  console.error('[test] Unhandled error:', err.message);
  process.exit(1);
});
