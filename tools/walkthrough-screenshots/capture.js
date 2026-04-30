/**
 * Capture PNGs for docs/user-guides/screenshots-walkthrough.md
 *
 * Prerequisites:
 *   - Static site:  python -m http.server 8080   (cwd: src/main/webapp)
 *   - API:         cd service && node server.js  (default :3001)
 *
 * Usage:  npm install && npm run capture
 */
'use strict';

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'docs/user-guides/screenshots');
const VIEWPORT = { width: 1920, height: 1080 };
const BASE = 'http://127.0.0.1:8080';
const CANVAS_URL =
  `${BASE}/index.html?dev=1&splash=0&drafts=0&local=1&storage=device`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const target = path.join(OUT, name);
  await page.screenshot({ path: target, type: 'png' });
  console.log('  wrote', path.relative(ROOT, target));
}

function installCapture(page) {
  return page.evaluateOnNewDocument(() => {
    let _Editor;
    Object.defineProperty(window, 'Editor', {
      configurable: true,
      set(v) {
        _Editor = new Proxy(v, {
          construct(target, args) {
            const inst = Reflect.construct(target, args);
            window.__editor = inst;
            return inst;
          },
        });
      },
      get() {
        return _Editor;
      },
    });
  });
}

async function waitForCanvas(page) {
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    const ok = await page.evaluate(
      () => !!(window.__editor && window.__editor.graph)
    );
    if (ok) return;
    await sleep(500);
  }
  throw new Error('Canvas editor not ready within 120s');
}

async function dismissDialogs(page) {
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(120);
  }
}

async function setLightMode(page) {
  await page.evaluate(() => {
    try {
      if (window.mxSettings) {
        window.mxSettings.settings = window.mxSettings.settings || {};
        window.mxSettings.settings.darkMode = false;
        window.mxSettings.save && window.mxSettings.save();
      }
      document.body.classList.remove('geDark');
    } catch (e) {}
  });
}

async function openMenubarMenu(page, menuLabel) {
  const clicked = await page.evaluate((menuLabel) => {
    const menus = Array.from(document.querySelectorAll('.geMenubar .geItem'));
    const top = menus.find((m) => (m.textContent || '').trim() === menuLabel);
    if (!top) return false;
    top.click();
    return true;
  }, menuLabel);
  await sleep(400);
  return clicked;
}

async function tryClickMenuItem(page, menuLabel, itemPrefix) {
  const opened = await openMenubarMenu(page, menuLabel);
  if (!opened) return false;
  const itemClicked = await page.evaluate((itemPrefix) => {
    const items = Array.from(document.querySelectorAll('table.mxPopupMenu td'));
    const item = items.find((m) =>
      (m.textContent || '').trim().startsWith(itemPrefix)
    );
    if (item) {
      item.click();
      return true;
    }
    return false;
  }, itemPrefix);
  await sleep(450);
  return itemClicked;
}

async function expandSidebarPalette(page, titleContains) {
  await page.evaluate((titleContains) => {
    const titles = Array.from(document.querySelectorAll('.geTitle'));
    const el = titles.find((t) => (t.textContent || '').includes(titleContains));
    if (el) el.click();
  }, titleContains);
  await sleep(400);
}

async function installAnalysisServiceStubs(page) {
  await page.evaluateOnNewDocument(() => {
    const orig = window.fetch;
    window.__docStubHistory = [];
    window.fetch = function (input, init) {
      const u = typeof input === 'string' ? input : input && input.url;
      const url = String(u || '');
      const method = ((init && init.method) || 'GET').toUpperCase();
      let pathname = '';
      try {
        pathname = new URL(url).pathname;
      } catch (e) {
        pathname = '';
      }

      if (url.indexOf('/api/chat') !== -1) {
        const text =
          '**Demo response** (documentation capture): use **Sync portal data** on the Reviewer workspace so the service receives diagram XML. ' +
          'Use **Run validity analysis** for structured firewall review; this chat is for follow-up questions.';
        const stream = new ReadableStream({
          start(controller) {
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

      if (url.indexOf('/api/jira/firewall-search') !== -1) {
        const body = {
          query: 'stub',
          results: [
            {
              key: 'FWREQ-101',
              summary: 'Firewall request: Kong API Gateway → AI Portal BFF',
              status: 'Open',
              projectKey: 'CSP',
              jiraUrl: 'https://jira.example.org/browse/FWREQ-101',
            },
            {
              key: 'FWREQ-102',
              summary: 'Firewall request: Batch Processor → Core Banking DB',
              status: 'In Review',
              projectKey: 'COREBANK',
              jiraUrl: 'https://jira.example.org/browse/FWREQ-102',
            },
          ],
        };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (/^\/api\/jira\/firewall\/[^/]+$/.test(pathname)) {
        const key = decodeURIComponent(pathname.split('/').pop());
        const body = {
          key,
          summary: 'Firewall request: Kong API Gateway → AI Portal BFF',
          status: 'Open',
          projectKey: 'CSP',
          jiraUrl: 'https://jira.example.org/browse/' + encodeURIComponent(key),
        };
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (url.indexOf('/api/analysis/review') !== -1 && method === 'POST') {
        const record = {
          jiraKey: 'FWREQ-101',
          confidencePercent: 86,
          outcome: 'likely_approved',
          requiresClarification: false,
          analysis:
            'Documentation capture: the request aligns with the documented firewall path for this sample project. Illustrative only.',
          reasoningSteps: [
            'Compared Jira source and destination with portal-linked diagram context.',
            'No blocking validation flags in this stub scenario.',
            'Likely valid subject to standard ITS and BSA sign-off.',
          ],
          sourceDocuments: [
            {
              label: 'Firewall request FWREQ-101',
              type: 'jira',
              url: 'https://jira.example.org/browse/FWREQ-101',
            },
            {
              label: 'csp-sample.drawio',
              type: 'diagram',
              url: null,
              note: 'Linked in Projects Portal — snapshot sync pushes XML to the service.',
            },
          ],
          evidenceRuleIds: [],
          reviewers: [],
          jiraIssue: {
            key: 'FWREQ-101',
            summary: 'Firewall request: Kong API Gateway → AI Portal BFF',
            status: 'Open',
            assignee: 'Alice Example',
            sourceComponent: 'integration-kong-api-gateway',
            destComponent: 'backend-ai-portal-bff',
            protocol: 'HTTPS',
            port: '8443',
          },
          matchedFirewallRow: null,
          analysedAt: new Date().toISOString(),
          llmStub: true,
        };
        window.__docStubHistory = [record];
        return Promise.resolve(
          new Response(JSON.stringify(record), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (pathname === '/api/analysis') {
        const list = window.__docStubHistory || [];
        return Promise.resolve(
          new Response(JSON.stringify(list), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (
        url.indexOf('/api/projects/sync') !== -1 ||
        url.indexOf('/api/projects/artefacts') !== -1
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

      if (url.indexOf('/api/health/probes') !== -1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jira: { ok: true, user: 'Documentation capture' },
              llm: { ok: true, snippet: 'OK' },
              stubMode: { jira: false, llm: false },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );
      }

      return orig.call(this, input, init);
    };
  });
}

async function capturePortal(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  await page.goto(`${BASE}/projects.html?cleardata=1`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(500);
  await shot(page, '01-portal-empty.png');

  await page.click('#newProjectBtn');
  await sleep(400);
  await shot(page, '02-portal-new-project-modal.png');

  await page.$eval('#fieldName', (el) => (el.value = ''));
  await page.type('#fieldName', 'CSP Phase 2');
  await page.$eval('#fieldCode', (el) => (el.value = ''));
  await page.type('#fieldCode', 'CSP');
  await page.select('#fieldTeam', 'BTG');
  await page.$eval('#fieldMembers', (el) => (el.value = ''));
  await page.type('#fieldMembers', 'Ryan Chan, Raymond So');
  await page.$eval('#fieldDescription', (el) => (el.value = ''));
  await page.type(
    '#fieldDescription',
    'Sample architecture review project for firewall correlation.'
  );
  await shot(page, '03-portal-new-project-filled.png');

  await page.click('#modalSaveBtn');
  await sleep(700);
  await shot(page, '04-portal-card-created.png');

  await page.evaluate(() => {
    const S = window.HKMAProjectStore;
    S.save({
      name: 'Retail API',
      code: 'RET',
      team: 'ITIS',
      status: 'Active',
      members: 'Alex Ng',
      description: 'Second sample project for filters.',
    });
    S.save({
      name: 'Legacy Batch',
      code: 'BAT',
      team: 'AS1',
      status: 'On Hold',
      members: 'Chris Lee',
      description: 'Third sample project (on hold).',
    });
    location.reload();
  });
  await sleep(900);
  await shot(page, '05-portal-multiple-projects.png');

  const cspId = await page.evaluate(() => {
    const csp = window.HKMAProjectStore.getAll().find((p) => p.code === 'CSP');
    return csp ? csp.id : null;
  });
  if (!cspId) throw new Error('CSP project not found');

  const minimalXml = `<?xml version="1.0"?><mxfile><diagram id="d1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`;
  const fixtureXlsx = fs.readFileSync(
    path.join(__dirname, 'fixture-idac.xlsx')
  );

  await page.evaluate(
    (id, xml) => {
      const p = window.HKMAProjectStore.getById(id);
      p.diagramXml = xml;
      p.diagramFilename = 'csp-sample.drawio';
      p.linkedAt = new Date().toISOString();
      window.HKMAProjectStore.save(p);
      location.reload();
    },
    cspId,
    minimalXml
  );
  await sleep(900);
  await shot(page, '07-portal-diagram-linked.png');

  await page.evaluate(
    (id, b64) => {
      const p = window.HKMAProjectStore.getById(id);
      p.firewallIdacXlsxBase64 = b64;
      p.firewallIdacFilename = 'csp-firewall-idac.xlsx';
      p.firewallLinkedAt = new Date().toISOString();
      window.HKMAProjectStore.save(p);
      location.reload();
    },
    cspId,
    fixtureXlsx.toString('base64')
  );
  await sleep(900);
  await shot(page, '08-portal-idac-linked.png');

  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('127.0.0.1:3001') || u.includes('localhost:3001')) {
      req.abort();
    } else {
      req.continue();
    }
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(600);
  await shot(page, '09-portal-analysis-offline.png');

  page.removeAllListeners('request');
  await page.setRequestInterception(false);

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(500);

  await page.evaluate(async (cid) => {
    const projects = window.HKMAProjectStore.getAll();
    const snapshot = projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      team: p.team,
      status: p.status,
      members: p.members,
      description: p.description,
      firewallIdacFilename: p.firewallIdacFilename || null,
      diagramFilename: p.diagramFilename || null,
      linkedAt: p.linkedAt || null,
      firewallLinkedAt: p.firewallLinkedAt || null,
      createdAt: p.createdAt || null,
    }));
    await fetch('http://127.0.0.1:3001/api/projects/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    const artefacts = projects
      .filter((p) => p.diagramXml)
      .map((p) => ({
        id: p.id,
        diagramXml: p.diagramXml,
        diagramFilename: p.diagramFilename || null,
      }));
    if (artefacts.length) {
      await fetch('http://127.0.0.1:3001/api/projects/artefacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artefacts }),
      });
    }
    await fetch('http://127.0.0.1:3001/api/run', { method: 'POST' });
  }, cspId);
  await sleep(5500);
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(1200);
  await shot(page, '10-portal-analysis-results.png');

  await page.$$eval(
    'button[data-action="edit"]',
    (btns) => {
      const csp = window.HKMAProjectStore.getAll().find((p) => p.code === 'CSP');
      if (!csp) return;
      for (const b of btns) {
        if (b.getAttribute('data-id') === csp.id) {
          b.click();
          break;
        }
      }
    }
  );
  await sleep(500);
  await shot(page, '12-portal-edit-modal.png');
  await page.click('#modalCancelBtn');
  await sleep(300);

  page.once('dialog', (d) => d.dismiss());
  await page.$$eval(
    'button[data-action="delete"]',
    (btns) => {
      const p = window.HKMAProjectStore.getAll().find((x) => x.code === 'CSP');
      if (!p) return;
      for (const b of btns) {
        if (b.getAttribute('data-id') === p.id) {
          b.click();
          break;
        }
      }
    }
  );
  await sleep(500);
  await shot(page, '13-portal-delete-confirm.png');
  await page.click('#confirmCancelBtn');
  await sleep(300);

  await page.close();
}

async function captureFirewallPanel(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(`${BASE}/firewall-rules-panel.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page
    .waitForSelector('#fwTbody tr', { timeout: 45000 })
    .catch(() => console.warn('[firewall-panel] no firewall rows yet'));
  await sleep(800);

  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(200);
  await shot(page, '22-firewall-panel-firewall-rules.png');

  await page.click('#btnFwAdd');
  await page.waitForFunction(
    () => document.getElementById('fwModal').classList.contains('open'),
    { timeout: 10000 }
  );
  await sleep(300);
  await shot(page, '31-firewall-panel-modal-new-rule.png');
  await page.click('#fwE_cancel');
  await page.waitForFunction(
    () => !document.getElementById('fwModal').classList.contains('open'),
    { timeout: 5000 }
  );
  await sleep(250);

  const editFw = await page.$('#fwTbody button[data-fw-i]');
  if (editFw) {
    await editFw.click();
    await page.waitForFunction(
      () => document.getElementById('fwModal').classList.contains('open'),
      { timeout: 10000 }
    );
    await sleep(300);
    await shot(page, '32-firewall-panel-modal-edit-rule.png');
    await page.click('#fwE_cancel');
    await page.waitForFunction(
      () => !document.getElementById('fwModal').classList.contains('open'),
      { timeout: 5000 }
    );
    await sleep(250);
  }

  await page.evaluate(() => {
    const tb = document.getElementById('fwTbody');
    if (tb) tb.scrollIntoView({ block: 'center' });
  });
  await sleep(300);
  await shot(page, '33-firewall-panel-before-delete.png');

  page.once('dialog', (d) => d.accept());
  const delFw = await page.$('#fwTbody button[data-fw-d]');
  if (delFw) {
    await delFw.click();
    await sleep(600);
    await shot(page, '34-firewall-panel-after-delete.png');
  }

  await page.evaluate(() => {
    const el = document.getElementById('val-heading');
    if (el) el.scrollIntoView({ block: 'start' });
  });
  await sleep(400);
  await shot(page, '23-firewall-panel-validation-connection.png');

  await page.click('#vE_new');
  await page.waitForFunction(
    () => document.getElementById('valModal').classList.contains('open'),
    { timeout: 10000 }
  );
  await sleep(300);
  await shot(page, '35-val-modal-new-connection.png');
  await page.click('#vE_cancel');
  await page.waitForFunction(
    () => !document.getElementById('valModal').classList.contains('open'),
    { timeout: 5000 }
  );
  await sleep(250);

  const openedEdit = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#valList .rule-row'));
    for (const row of rows) {
      if (
        row.querySelector('.badge-deny') ||
        row.querySelector('.badge-allow')
      ) {
        row.click();
        return true;
      }
    }
    return false;
  });
  if (openedEdit) {
    await page.waitForFunction(
      () => document.getElementById('valModal').classList.contains('open'),
      { timeout: 10000 }
    );
    await sleep(300);
    await shot(page, '36-val-modal-edit-connection.png');
    await page.click('#vE_cancel');
    await page.waitForFunction(
      () => !document.getElementById('valModal').classList.contains('open'),
      { timeout: 5000 }
    );
    await sleep(250);
  }

  await page.evaluate(() => {
    const t = document.querySelector('.tabs button[data-vtab="containment"]');
    if (t) t.click();
  });
  await sleep(400);
  await shot(page, '24-firewall-panel-validation-placement.png');

  await page.click('#vE_new');
  await page.waitForFunction(
    () => document.getElementById('valModal').classList.contains('open'),
    { timeout: 10000 }
  );
  await sleep(300);
  await shot(page, '37-val-modal-new-placement.png');
  await page.click('#vE_cancel');
  await page.waitForFunction(
    () => !document.getElementById('valModal').classList.contains('open'),
    { timeout: 5000 }
  );
  await sleep(250);

  const openedPlace = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#valList .rule-row'));
    for (const row of rows) {
      if (
        row.querySelector('.badge-deny') ||
        row.querySelector('.badge-allow')
      ) {
        row.click();
        return true;
      }
    }
    return false;
  });
  if (openedPlace) {
    await page.waitForFunction(
      () => document.getElementById('valModal').classList.contains('open'),
      { timeout: 10000 }
    );
    await sleep(300);
    await shot(page, '38-val-modal-edit-placement.png');
    await page.click('#vE_cancel');
    await sleep(200);
  }

  await page.evaluate(() => {
    const t = document.querySelector('.tabs button[data-vtab="edge"]');
    if (t) t.click();
  });
  await sleep(400);

  await shot(page, '39-val-before-delete.png');
  page.once('dialog', (d) => d.accept());
  const valDel = await page.$('#valList button[data-val-del]');
  if (valDel) {
    await valDel.click();
    await sleep(500);
    await shot(page, '40-val-after-delete.png');
  }

  await page.close();
}

async function captureReviewerWorkspace(browser) {
  const page = await browser.newPage();
  await installAnalysisServiceStubs(page);
  await page.setViewport(VIEWPORT);

  await page.goto(`${BASE}/llm-analysis.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(600);
  await shot(page, '41-reviewer-workspace-overview.png');

  await page.goto(`${BASE}/llm-analysis-review.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(500);
  await page.$eval('#jiraSearchInput', (el) => {
    el.value = '';
  });
  await page.type('#jiraSearchInput', 'Kong');
  await page.click('#jiraSearchBtn');
  await page.waitForSelector('.search-results.visible .search-hit', {
    timeout: 15000,
  });
  await sleep(400);
  await shot(page, '42-reviewer-jira-search.png');

  await page.click('.search-hit');
  await page.waitForSelector('#issuePreview.visible', { timeout: 10000 });
  await sleep(500);
  await shot(page, '43-reviewer-ticket-preview.png');

  await page.click('#runReviewBtn');
  await page.waitForSelector('#verdictPanel.visible', { timeout: 15000 });
  await sleep(500);
  await page.evaluate(() => {
    const el = document.getElementById('verdictPanel');
    if (el) el.scrollIntoView({ block: 'start' });
  });
  await sleep(300);
  await shot(page, '44-reviewer-verdict-panel.png');

  await page.goto(`${BASE}/llm-analysis-history.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(500);
  await page.waitForSelector('#historyList .history-card, #historyList .empty-state', {
    timeout: 15000,
  });
  await sleep(400);
  await shot(page, '45-reviewer-analysed-requests.png');

  await page.goto(`${BASE}/llm-analysis-review.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(400);
  await page.click('#syncPortalBtn');
  await sleep(900);
  await shot(page, '46-reviewer-sync-portal-toast.png');

  await page.goto(`${BASE}/llm-analysis-chat.html`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await sleep(400);
  await page.$eval('#userInput', (el) => {
    el.value = '';
  });
  await page.type('#userInput', 'How does sync portal data relate to diagram XML?');
  await Promise.all([
    page.click('#sendBtn'),
    page.waitForFunction(
      () => {
        const nodes = [...document.querySelectorAll('.message.assistant')];
        const last = nodes[nodes.length - 1];
        return last && !last.textContent.includes('Thinking');
      },
      { timeout: 15000 }
    ),
  ]);
  await sleep(600);
  await shot(page, '47-reviewer-assistant-chat.png');
  await page.close();
}

async function captureCanvas(browser) {
  const page = await browser.newPage();
  await installCapture(page);
  await page.setViewport(VIEWPORT);
  page.on('pageerror', (e) => console.warn('[canvas pageerror]', e.message));

  await page.goto(CANVAS_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await waitForCanvas(page);
  await dismissDialogs(page);
  await setLightMode(page);
  await sleep(800);
  await shot(page, '14-canvas-landing.png');

  await expandSidebarPalette(page, 'Architecture / Zones');
  await sleep(500);
  await shot(page, '15-canvas-sidebar-zones.png');

  await expandSidebarPalette(page, 'Architecture / Components');
  await sleep(500);
  await shot(page, '16-canvas-sidebar-components.png');

  if (await openMenubarMenu(page, 'File')) {
    await shot(page, '27-canvas-file-menu.png');
    await page.keyboard.press('Escape');
    await sleep(250);
  }

  if (await openMenubarMenu(page, 'View')) {
    await shot(page, '19-canvas-view-menu.png');
    await page.keyboard.press('Escape');
    await sleep(250);
  }

  if (await tryClickMenuItem(page, 'File', 'Architecture Admin')) {
    await sleep(900);
    await shot(page, '21-canvas-catalog-zones.png');
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  if (await tryClickMenuItem(page, 'File', 'Export firewall')) {
    await sleep(900);
    await shot(page, '28-canvas-firewall-idac-extract.png');
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  await page.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    channel: 'chrome',
    defaultViewport: VIEWPORT,
    args: [
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    console.log('Capturing portal…');
    await capturePortal(browser);
    console.log('Capturing firewall rules panel…');
    await captureFirewallPanel(browser);
    console.log('Capturing Reviewer workspace…');
    await captureReviewerWorkspace(browser);
    console.log('Capturing canvas…');
    await captureCanvas(browser);
    console.log('Done. Output:', OUT);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
