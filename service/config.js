'use strict';

const path = require('path');

// Load service/.env, then optional service/.env.local (overrides / local-only secrets for dev).
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env.local'), override: true });

/** Dev-only: skip TLS verification for Jira HTTPS only. Prefer NODE_EXTRA_CA_CERTS or corporate CA import. */
const jiraTlsInsecure = String(process.env.JIRA_TLS_INSECURE || '').toLowerCase() === 'true';
if (jiraTlsInsecure) {
  console.warn(
    '[config] JIRA_TLS_INSECURE=true — Jira HTTPS calls use rejectUnauthorized: false (not for production).'
  );
}

/** Dev-only: if true, disables TLS cert verification for all HTTPS in this Node process. Prefer NODE_EXTRA_CA_CERTS or node --use-system-ca. */
const llmTlsInsecure = String(process.env.LLM_TLS_INSECURE || '').toLowerCase() === 'true';
if (llmTlsInsecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn(
    '[config] LLM_TLS_INSECURE=true — TLS verification is OFF for this process (not for production).'
  );
}

const config = {
  jira: {
    url:         process.env.JIRA_BASE_URL || process.env.JIRA_URL || '',
    token:       process.env.JIRA_SERVICE_ACCOUNT_TOKEN || process.env.JIRA_TOKEN || '',
    webhookSecret: process.env.JIRA_WEBHOOK_SECRET || '',
    projectKey:  process.env.JIRA_FIREWALL_PROJECT_KEY || 'FWREQ',
    firewallJql: process.env.JIRA_FIREWALL_JQL,
    stubMode:    !(process.env.JIRA_BASE_URL || process.env.JIRA_URL),
    tlsInsecure: jiraTlsInsecure,
  },
  llm: {
    provider:    process.env.LLM_PROVIDER    || 'maas',
    // Merge MaaS env names here so one set of vars powers chat + firewall analysis.
    url:         process.env.LLM_ENDPOINT    || process.env.LLM_URL
      || process.env.MAAS_URL || process.env.MAAS_ENDPOINT || '',
    apiKey:
      process.env.MAAS_API_KEY ||
      process.env.LLM_API_KEY ||
      '',
    model:       process.env.LLM_MODEL       || process.env.MAAS_MODEL || '',
    promptPath:  process.env.LLM_PROMPT_PATH || './prompts/firewall-analysis.prompt.txt',
    stubMode:    !(process.env.LLM_ENDPOINT || process.env.LLM_URL
      || process.env.MAAS_URL || process.env.MAAS_ENDPOINT),
  },
  maas: {
    accessKeyId: process.env.MAAS_ACCESS_KEY_ID || '',
    apiKey:      process.env.MAAS_API_KEY       || '',
    url:         process.env.MAAS_URL           || '',
    model:       process.env.MAAS_MODEL         || '',
  },
  poll: {
    cron:             process.env.POLL_CRON         || '0 8 * * *',
    postJiraComments: process.env.POST_JIRA_COMMENTS === 'true',
  },
  service: {
    port: parseInt(process.env.SERVICE_PORT || '3001', 10),
  },
};

module.exports = config;
