'use strict';

/**
 * Shared connectivity checks for Jira REST and OpenAI-compatible chat.
 * Used by npm run test:integrations and GET /api/health/probes.
 */

const axios = require('axios');
const config = require('../config');
const jiraClient = require('../clients/jiraClient');

/**
 * @returns {Promise<{ ok: boolean, displayName?: string, name?: string, key?: string, error?: string }>}
 */
async function probeJira() {
  return jiraClient.verifySession();
}

function llmChatEndpoint() {
  const base = (config.llm.url || '').trim();
  if (!base) return null;
  if (base.endsWith('/chat/completions')) return base;
  return `${base.replace(/\/$/, '')}/chat/completions`;
}

/**
 * @returns {Promise<{ ok: boolean, snippet?: string, error?: string }>}
 */
async function probeLlm(options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 120000;

  if (config.llm.stubMode) {
    return { ok: false, error: 'LLM_ENDPOINT, LLM_URL, or MAAS_URL not set' };
  }
  const endpoint = llmChatEndpoint();
  if (!endpoint) {
    return { ok: false, error: 'Could not build chat/completions URL' };
  }
  if (!config.llm.model) {
    return { ok: false, error: 'LLM_MODEL or MAAS_MODEL is empty' };
  }

  const payload = {
    model: config.llm.model,
    messages: [{ role: 'user', content: 'Reply with exactly this one word: OK' }],
    max_tokens: 16,
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: config.llm.apiKey ? `Bearer ${config.llm.apiKey}` : undefined,
      },
      timeout: timeoutMs,
    });
    const content =
      response.data &&
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message &&
      response.data.choices[0].message.content;
    if (content == null || typeof content !== 'string') {
      return { ok: false, error: `Unexpected response: ${JSON.stringify(response.data).slice(0, 400)}` };
    }
    return { ok: true, snippet: content.trim().slice(0, 120) };
  } catch (err) {
    const code = err.response && err.response.status;
    const body = err.response && err.response.data;
    const fromHttp = body ? JSON.stringify(body).slice(0, 400) : null;
    let msg = code ? `HTTP ${code}: ${fromHttp || err.message}` : err.message;
    if (err.code === 'ETIMEDOUT' || /timeout/i.test(err.message)) {
      msg = `${msg} — check VPN or network path to the LLM host`;
    }
    if (code === 401 || /401|authenticate/i.test(msg)) {
      msg = `${msg} — confirm MAAS_API_KEY / LLM_API_KEY in service/.env`;
    }
    return { ok: false, error: msg };
  }
}

module.exports = { probeJira, probeLlm, llmChatEndpoint };
