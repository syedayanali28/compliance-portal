'use strict';

const express = require('express');
const { ToolLoopAgent, stepCountIs } = require('ai');
const { createOpenAI } = require('@ai-sdk/openai');
const config = require('../config');
const { buildPortalChatTools } = require('../lib/portalChatTools');

const router = express.Router();

/** Host only, for logs (no path / query). */
function llmHostForLog() {
  const raw = config.llm.url || config.maas.url || '';
  if (!raw) return '(none)';
  try {
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return u.host || raw;
  } catch {
    return '(unparsed)';
  }
}

function lastUserSnippet(messages, maxLen) {
  maxLen = maxLen || 120;
  const u = [...messages].reverse().find((m) => m && m.role === 'user');
  const text = typeof u?.content === 'string' ? u.content : JSON.stringify(u?.content || '');
  return text.length <= maxLen ? text : `${text.slice(0, maxLen)}…`;
}

function initAiProvider() {
  let baseURL = config.llm.url || config.maas.url || '';

  if (!baseURL) {
    return null;
  }

  if (baseURL.endsWith('/chat/completions')) {
    baseURL = baseURL.replace('/chat/completions', '');
  } else if (!baseURL.endsWith('/v1')) {
    baseURL += baseURL.endsWith('/') ? 'v1' : '/v1';
  }

  return createOpenAI({
    baseURL,
    apiKey:
      config.llm.apiKey ||
      config.maas.apiKey ||
      process.env.MAAS_API_KEY ||
      process.env.LLM_API_KEY ||
      'not-needed-if-stubbed',
    compatibility: 'compatible',
  });
}

const SYSTEM_INSTRUCTIONS =
  'You are the HKMA Compliance Portal architecture assistant. ' +
  'Answer clearly and cite which tool you used. ' +
  'When the user asks about a project diagram, zones, or network flows, call getProjectDiagram with the project code (and projectId if known). ' +
  'Summarise diagram XML at a high level (components, zones, data flows); quote small snippets only if helpful. ' +
  'Jira, Confluence, and firewall-json tools are placeholders until they are implemented — say so if the user asks for them.';

router.post('/', async (req, res) => {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    console.warn(`[chat ${reqId}] bad request: missing messages`);
    return res.status(400).json({ error: 'Expected a non-empty messages array' });
  }

  console.log(`[chat ${reqId}] start messages=${messages.length} lastUser="${lastUserSnippet(messages)}"`);

  const customAi = initAiProvider();

  if (!customAi) {
    console.warn(`[chat ${reqId}] no LLM URL — set service/.env or .env.local (LLM_ENDPOINT / MAAS_URL)`);
    res.status(200);
    res.type('text/plain; charset=utf-8');
    res.send(
      '[LLM not configured] Set LLM_URL, LLM_ENDPOINT, or MAAS_URL to your OpenAI-compatible API base (the service appends /v1 as needed). Set LLM_API_KEY or MAAS_API_KEY if required, then restart.\n\n' +
        'Diagrams for the assistant: link a .drawio in the Projects Portal and use Export Snapshot — diagram XML is pushed to the analysis service as artefacts for getProjectDiagram.'
    );
    return;
  }

  try {
    const modelId =
      config.llm.model ||
      config.maas.model ||
      process.env.MAAS_MODEL ||
      process.env.LLM_MODEL ||
      'gpt-4o';
    console.log(`[chat ${reqId}] model=${modelId} host=${llmHostForLog()}`);

    // Use .chat() so requests go to /v1/chat/completions (OpenAI-compatible), not /v1/responses (MaaS won't serve that).
    const agent = new ToolLoopAgent({
      model: customAi.chat(modelId),
      instructions: SYSTEM_INSTRUCTIONS,
      tools: buildPortalChatTools(),
      stopWhen: stepCountIs(25),
    });

    const streamResult = await agent.stream({
      messages,
      onStepFinish: (step) => {
        try {
          const calls = step.toolCalls;
          if (calls && calls.length) {
            const names = calls.map((c) => c.toolName || c.name || '?').join(', ');
            console.log(`[chat ${reqId}] step toolCalls=[${names}]`);
          } else {
            const t = step.text || '';
            console.log(`[chat ${reqId}] step (no tools, assistant text ${t.length} chars)`);
          }
        } catch (e) {
          console.log(`[chat ${reqId}] step (onStepFinish log error: ${e.message})`);
        }
      },
      onFinish: (evt) => {
        try {
          const u = evt.totalUsage || evt.usage || {};
          const pt = u.promptTokens ?? u.inputTokens;
          const ct = u.completionTokens ?? u.outputTokens;
          console.log(
            `[chat ${reqId}] finished ok finishReason=${evt.finishReason || 'n/a'} tokensIn=${pt ?? '?'} tokensOut=${ct ?? '?'}`
          );
        } catch (e) {
          console.log(`[chat ${reqId}] finished ok (usage details unavailable: ${e.message})`);
        }
      },
      onError: (err) => {
        console.error(`[chat ${reqId}] provider/stream error:`, err && err.message ? err.message : err);
      },
    });

    streamResult.pipeTextStreamToResponse(res);
  } catch (error) {
    console.error(`[chat ${reqId}] failed:`, error.message || error);
    if (error && error.stack) console.error(error.stack);
    if (!res.headersSent) {
      res.status(500).type('text/plain; charset=utf-8').send(error.message || String(error));
    }
  }
});

module.exports = router;
