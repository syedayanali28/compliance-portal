/**
 * Records a step-by-step build of CSP Architecture 2 in the draw.io canvas
 * using Puppeteer. Emits PNG frames to ./frames for ffmpeg encoding.
 *
 * Workflow phases:
 *   A. Open canvas (light mode), dismiss splash → frame
 *   B. Add zones one-by-one (with hold frames) → many frames
 *   C. Add components per zone (parent-before-child) → many frames
 *   D. Add edges → many frames
 *   E. Walkthrough: Validation Rules → Architecture Catalog → Firewall Extraction
 *   F. Open Projects Portal, create project, link files, run analysis
 */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { parseDiagram } = require('./parse-diagram');

const FRAMES_DIR = path.resolve(__dirname, 'frames');
const VIEWPORT = { width: 1920, height: 1080 };
const CANVAS_URL = 'http://localhost:8080/index.html?dev=1&splash=0&drafts=0&local=1&storage=device';
const PORTAL_URL = 'http://localhost:8080/projects.html';
const DRAWIO = path.resolve(__dirname, '..', '..', 'CSP Architecture 2.drawio');
const FIREWALL_JSON = path.resolve(__dirname, '..', '..', 'CSP-firewall-requests (1).json');

// reset frames dir
fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

let frameIdx = 0;
async function snap(page, holds = 1) {
  for (let i = 0; i < holds; i++) {
    const file = path.join(FRAMES_DIR, `frame_${String(frameIdx).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, type: 'png' });
    frameIdx++;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function installCapture(page) {
  await page.evaluateOnNewDocument(() => {
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
    const status = await page.evaluate(() => ({
      hasEditor: !!window.__editor,
      hasGraph: !!(window.__editor && window.__editor.graph),
      readyState: document.readyState,
    }));
    if (status.hasGraph) return;
    if ((Date.now() - t0) % 5000 < 600) console.log('   waiting…', JSON.stringify(status));
    await sleep(500);
  }
  throw new Error('canvas never initialised within 120s');
}

async function dismissDialogs(page) {
  // Press Escape repeatedly to clear any startup dialogs.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(100);
  }
}

async function setLightMode(page) {
  await page.evaluate(() => {
    try {
      // draw.io persists theme via mxSettings
      if (window.mxSettings) {
        window.mxSettings.settings = window.mxSettings.settings || {};
        window.mxSettings.settings.darkMode = false;
        window.mxSettings.save && window.mxSettings.save();
      }
      document.body.classList.remove('geDark');
    } catch (e) {}
  });
}

async function clearGraph(page) {
  await page.evaluate(() => {
    const graph = window.__editor.graph;
    graph.getModel().beginUpdate();
    try {
      const root = graph.getModel().getRoot();
      const layer = root.children && root.children[0];
      if (layer && layer.children) {
        const kids = layer.children.slice();
        kids.forEach((c) => graph.getModel().remove(c));
      }
    } finally {
      graph.getModel().endUpdate();
    }
  });
}

async function fitGraph(page) {
  await page.evaluate(() => {
    const graph = window.__editor.graph;
    graph.fit(20);
    if (graph.view.scale > 0.4) graph.zoomTo(0.4, true);
  });
}

async function addCell(page, cell) {
  await page.evaluate((c) => {
    const graph = window.__editor.graph;
    const model = graph.getModel();
    const parentCell = model.getCell(c.parent) || graph.getDefaultParent();

    const buildValue = () => {
      if (
        c.archZoneId ||
        c.archComponentId ||
        c.archCategory ||
        c.archContainerType ||
        c.placeholders
      ) {
        const doc = window.mxUtils.createXmlDocument();
        const obj = doc.createElement('object');
        if (c.value) obj.setAttribute('label', c.value);
        if (c.archZoneId) obj.setAttribute('archZoneId', c.archZoneId);
        if (c.archComponentId) obj.setAttribute('archComponentId', c.archComponentId);
        if (c.archCategory) obj.setAttribute('archCategory', c.archCategory);
        if (c.archContainerType) obj.setAttribute('archContainerType', c.archContainerType);
        if (c.placeholders) obj.setAttribute('placeholders', c.placeholders);
        return obj;
      }
      return c.value || '';
    };

    model.beginUpdate();
    try {
      if (c.isEdge) {
        const src = c.source ? model.getCell(c.source) : null;
        const tgt = c.target ? model.getCell(c.target) : null;
        const geom = new window.mxGeometry();
        geom.relative = true;
        if (c.points && c.points.length) {
          geom.points = c.points.map((p) => new window.mxPoint(p.x, p.y));
        }
        const cell = new window.mxCell(buildValue(), geom, c.style || '');
        cell.id = c.id;
        cell.edge = true;
        cell.connectable = c.connectable !== '0';
        graph.addEdge(cell, parentCell, src, tgt);
      } else {
        const g = c.geometry || { x: 0, y: 0, width: 120, height: 60 };
        const geom = new window.mxGeometry(g.x, g.y, g.width, g.height);
        const cell = new window.mxCell(buildValue(), geom, c.style || '');
        cell.id = c.id;
        cell.vertex = true;
        graph.addCell(cell, parentCell);
      }
    } finally {
      model.endUpdate();
    }
  }, cell);
}

async function tryClickMenuItem(page, menuLabel, itemLabel) {
  // Click top-level menu, then find dropdown item by label.
  const clicked = await page.evaluate(
    ({ menuLabel, itemLabel }) => {
      const menus = Array.from(document.querySelectorAll('.geMenubar .geItem'));
      const top = menus.find((m) => (m.textContent || '').trim() === menuLabel);
      if (!top) return false;
      top.click();
      return true;
    },
    { menuLabel, itemLabel }
  );
  if (!clicked) return false;
  await sleep(300);
  const itemClicked = await page.evaluate((itemLabel) => {
    const items = Array.from(document.querySelectorAll('table.mxPopupMenu td'));
    const item = items.find((m) => (m.textContent || '').trim().startsWith(itemLabel));
    if (item) {
      item.click();
      return true;
    }
    return false;
  }, itemLabel);
  await sleep(400);
  return itemClicked;
}

async function recordDiagramBuild(page, cells) {
  // Hold a few frames on empty canvas
  await snap(page, 4);

  // Group cells: zones first (vertices with archContainerType), then components, then edges
  const zones = cells.filter((c) => !c.isEdge && c.archContainerType === 'zone');
  const components = cells.filter(
    (c) => !c.isEdge && c.archComponentId && c.archContainerType !== 'zone'
  );
  const edges = cells.filter((c) => c.isEdge);
  const others = cells.filter(
    (c) => !c.isEdge && !c.archContainerType && !c.archComponentId
  );

  // Zones go in parent-before-child order (already preserved in `cells` order).
  console.log(
    `Build phases: ${zones.length} zones, ${components.length} components, ${edges.length} edges, ${others.length} other`
  );

  for (const z of zones) {
    await addCell(page, z);
    await fitGraph(page);
    await snap(page, 2);
  }
  await snap(page, 4);

  for (let i = 0; i < components.length; i++) {
    await addCell(page, components[i]);
    if (i % 3 === 0) await fitGraph(page);
    await snap(page, 1);
  }
  await fitGraph(page);
  await snap(page, 4);

  for (let i = 0; i < edges.length; i++) {
    await addCell(page, edges[i]);
    await snap(page, 1);
  }

  // Add any leftover (edge labels, etc.)
  for (const c of others) {
    try {
      await addCell(page, c);
    } catch {}
  }

  await fitGraph(page);
  await snap(page, 8);
}

async function recordWalkthrough(page) {
  // Validation rules dialog
  if (await tryClickMenuItem(page, 'View', 'Validation Rules')) {
    await sleep(800);
    await snap(page, 6);
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  // Run validation self-test
  if (await tryClickMenuItem(page, 'View', 'Run Validation Self-Test')) {
    await sleep(800);
    await snap(page, 5);
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  // Architecture Admin (catalog)
  if (await tryClickMenuItem(page, 'View', 'Architecture Admin')) {
    await sleep(900);
    await snap(page, 6);
    await page.keyboard.press('Escape');
    await sleep(300);
  }

  // Firewall extract preview
  if (await tryClickMenuItem(page, 'File', 'Extract Firewall Requests JSON')) {
    await sleep(900);
    await snap(page, 6);
    await page.keyboard.press('Escape');
    await sleep(300);
  }
}

async function recordPortal(browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
  await page.goto(PORTAL_URL, { waitUntil: 'networkidle2' });
  await sleep(800);
  await snap(page, 5);

  // Programmatically seed a sample project so the screenshot has content
  await page.evaluate(() => {
    const projects = [
      {
        id: 'csp-phase2',
        name: 'CSP Phase 2',
        code: 'CSP',
        owner: 'BTG',
        status: 'In Review',
        arbJiraKey: 'ARB-2024-031',
        drawioFileName: 'CSP Architecture 2.drawio',
        firewallFileName: 'CSP-firewall-requests.json',
        createdAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem('hkma.projects', JSON.stringify(projects));
    location.reload();
  });
  await sleep(1500);
  await snap(page, 6);

  await page.close();
}

(async () => {
  console.log('Parsing diagram…');
  const cells = parseDiagram(DRAWIO);
  console.log(`Parsed ${cells.length} cells`);

  console.log('Launching Chromium…');
  const browser = await puppeteer.launch({
    headless: 'new',
    defaultViewport: VIEWPORT,
    args: [
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);

    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    page.on('console', (m) => {
      const t = m.type();
      if (t === 'error' || t === 'warning') console.log(`[browser ${t}]`, m.text());
    });
    page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure() && r.failure().errorText));

    console.log('Opening canvas…');
    await installCapture(page);
    await page.goto(CANVAS_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
    console.log('  domcontentloaded; waiting for editor…');
    await waitForCanvas(page);
    console.log('  canvas ready');
    await dismissDialogs(page);
    await setLightMode(page);
    await clearGraph(page);
    await sleep(500);

    console.log('Recording diagram build…');
    await recordDiagramBuild(page, cells);

    console.log('Recording UI walkthrough…');
    await recordWalkthrough(page);

    console.log('Recording portal…');
    await recordPortal(browser);

    console.log(`Done. Wrote ${frameIdx} frames to ${FRAMES_DIR}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
