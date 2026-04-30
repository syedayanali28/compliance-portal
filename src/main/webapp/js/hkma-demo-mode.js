/**
 * HKMA client-side demo mode for static hosting (e.g. Vercel) without the Node service.
 *
 * How it is chosen (first match wins):
 *  1) URL query: ?demo=1|true|on  → demo ON; ?demo=0|false|off  → demo OFF
 *  2) localStorage "hkmaDemoMode": "true"|"1" or "false"|"0"
 *  3) window.HKMA_DEMO_MODE === true or false (set in HTML before this script to force)
 *  4) Default: demo OFF on localhost / 127.0.0.1 / [::1]; demo ON everywhere else (e.g. Vercel)
 *
 * Local development against real Jira/LLM: use http://localhost — demo stays off automatically.
 * To force demo ON locally: ?demo=1 or localStorage.hkmaDemoMode = "true"
 * To force demo OFF on Vercel: ?demo=0 or localStorage.hkmaDemoMode = "false"
 */
(function (global) {
  'use strict';

  var LS_KEY = 'hkmaDemoMode';

  function getDemoMode() {
    try {
      var sp = new URLSearchParams(global.location.search || '');
      var q = sp.get('demo');
      if (q === '0' || q === 'false' || q === 'off') return false;
      if (q === '1' || q === 'true' || q === 'on') return true;
    } catch (e) {}

    try {
      var ls = global.localStorage.getItem(LS_KEY);
      if (ls === 'false' || ls === '0') return false;
      if (ls === 'true' || ls === '1') return true;
    } catch (e) {}

    if (global.HKMA_DEMO_MODE === true) return true;
    if (global.HKMA_DEMO_MODE === false) return false;

    var h = (global.location.hostname || '').toLowerCase();
    var isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    return !isLocal;
  }

  global.HKMA_getDemoMode = getDemoMode;
  global.HKMA_SERVICE_URL = global.HKMA_SERVICE_URL || 'http://localhost:3001';

  function serviceBase() {
    return String(global.HKMA_SERVICE_URL || '').replace(/\/$/, '');
  }

  function isServiceRequest(urlStr) {
    if (!urlStr) return false;
    var base = serviceBase();
    if (urlStr.indexOf(base + '/') === 0 || urlStr === base) return true;
    try {
      var u = new URL(urlStr);
      if (u.pathname.indexOf('/api/') !== 0) return false;
      return (
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
        String(u.port || '') === '3001'
      );
    } catch (e) {
      return false;
    }
  }

  function jsonResponse(obj, status) {
    return Promise.resolve(
      new Response(JSON.stringify(obj), {
        status: status || 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }

  function chatStreamResponse(text) {
    var stream = new ReadableStream({
      start: function (controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    return Promise.resolve(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }

  function stubIssue(key) {
    key = key || 'FWREQ-101';
    return {
      key: key,
      summary: 'Firewall request: Kong API Gateway → AI Portal BFF',
      status: 'Open',
      projectKey: 'CSP',
      jiraUrl: 'https://jira.example.org/browse/' + encodeURIComponent(key),
    };
  }

  function stubSearchResults() {
    return {
      query: 'demo',
      results: [
        stubIssue('FWREQ-101'),
        {
          key: 'FWREQ-102',
          summary: 'Firewall request: Batch Processor → Core Banking DB',
          status: 'In Review',
          projectKey: 'COREBANK',
          jiraUrl: 'https://jira.example.org/browse/FWREQ-102',
        },
      ],
    };
  }

  function buildReviewRecord(body) {
    var key =
      (body && body.jiraKey ? String(body.jiraKey) : 'FWREQ-101').trim().toUpperCase() ||
      'FWREQ-101';
    var issue = stubIssue(key);
    return {
      jiraKey: key,
      confidencePercent: 86,
      outcome: 'likely_approved',
      requiresClarification: false,
      analysis:
        '[Client demo mode] Illustrative validity narrative. Run the Node analysis service with Jira and LLM credentials for real results; use ?demo=0 on this host or localStorage.hkmaDemoMode="false" to call a live API from a static deploy.',
      reasoningSteps: [
        'Demo: compared ticket metadata with portal context (simulated).',
        'Demo: no blocking validation flags in this sample.',
        'Production: connect the service for live Jira and model output.',
      ],
      sourceDocuments: [
        { label: 'Firewall request ' + key, type: 'jira', url: issue.jiraUrl },
        {
          label: 'Portal diagram context',
          type: 'diagram',
          url: null,
          note: 'In production, Sync portal data pushes diagram XML to the service.',
        },
      ],
      evidenceRuleIds: [],
      reviewers: [],
      jiraIssue: {
        key: key,
        summary: issue.summary,
        status: issue.status,
        assignee: 'Alex Demo',
        sourceComponent: 'integration-kong-api-gateway',
        destComponent: 'backend-ai-portal-bff',
        protocol: 'HTTPS',
        port: '8443',
      },
      matchedFirewallRow: null,
      matchedProjectId: body && body.projectId ? body.projectId : null,
      analysedAt: new Date().toISOString(),
      llmStub: true,
      clientDemo: true,
    };
  }

  function getAnalysisHistoryList() {
    try {
      var raw = global.sessionStorage.getItem('hkmaDemoAnalysisHistory');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return global.__hkmaDemoAnalysisHistoryCache || [];
  }

  function saveAnalysisHistoryList(list) {
    global.__hkmaDemoAnalysisHistoryCache = list;
    try {
      global.sessionStorage.setItem('hkmaDemoAnalysisHistory', JSON.stringify(list));
    } catch (e) {}
  }

  function handleDemoFetch(url, init, orig, input) {
    var method = ((init && init.method) || 'GET').toUpperCase();
    var pathname = '';
    try {
      pathname = new URL(url, 'http://localhost').pathname;
    } catch (e) {
      pathname = '';
    }

    if (url.indexOf('/api/chat') !== -1 && method === 'POST') {
      return chatStreamResponse(
        '**Client demo mode** — this reply is generated in the browser. For a real model, deploy or run the `service/` app with LLM credentials and use **demo off** (localhost is off by default; on Vercel set `localStorage.hkmaDemoMode = \"false\"` or `?demo=0`). ' +
          '**Run validity analysis** above is the primary structured review.'
      );
    }

    if (url.indexOf('/api/jira/firewall-search') !== -1) {
      return jsonResponse(stubSearchResults());
    }

    if (/^\/api\/jira\/firewall\/[^/]+$/.test(pathname)) {
      var fKey = decodeURIComponent(pathname.replace(/.*\/jira\/firewall\//, ''));
      return jsonResponse(stubIssue(fKey));
    }

    if (url.indexOf('/api/analysis/review') !== -1 && method === 'POST') {
      var body = {};
      try {
        body = JSON.parse((init && init.body) || '{}');
      } catch (e) {}
      var record = buildReviewRecord(body);
      var hist = getAnalysisHistoryList().filter(function (r) {
        return r.jiraKey !== record.jiraKey;
      });
      hist.unshift(record);
      saveAnalysisHistoryList(hist);
      return jsonResponse(record);
    }

    if (pathname === '/api/analysis') {
      var list = getAnalysisHistoryList();
      if (!list.length) {
        list = [buildReviewRecord({ jiraKey: 'FWREQ-101' })];
      }
      return jsonResponse(list);
    }

    var m = pathname.match(/^\/api\/analysis\/([^/]+)$/);
    if (m) {
      var projectId = decodeURIComponent(m[1]);
      var all = getAnalysisHistoryList();
      var forProject = all.filter(function (r) {
        return r.matchedProjectId === projectId;
      });
      if (forProject.length) return jsonResponse(forProject);
      return jsonResponse([buildReviewRecord({ jiraKey: 'FWREQ-101', projectId: projectId })]);
    }

    if (
      url.indexOf('/api/projects/sync') !== -1 ||
      url.indexOf('/api/projects/artefacts') !== -1
    ) {
      return jsonResponse({ ok: true, clientDemo: true });
    }

    if (url.indexOf('/api/jira/arb-update') !== -1 && method === 'POST') {
      return jsonResponse({
        ok: true,
        clientDemo: true,
        message: 'Simulated ARB ticket description update.',
      });
    }

    if (url.indexOf('/api/health/probes') !== -1) {
      return jsonResponse({
        jira: { ok: true, user: 'client-demo' },
        llm: { ok: true, snippet: 'client-demo' },
        stubMode: { clientDemo: true },
      });
    }

    return orig.call(global, input, init);
  }

  if (!getDemoMode()) return;

  var origFetch = global.fetch;
  global.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : input && input.url;
    url = String(url || '');
    if (!isServiceRequest(url)) return origFetch.call(global, input, init);
    return handleDemoFetch(url, init || {}, origFetch, input);
  };
})(typeof window !== 'undefined' ? window : this);
