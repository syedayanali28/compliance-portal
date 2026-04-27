const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:8080/index.html?dev=1&splash=0&drafts=0&local=1&storage=device', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  const probe = await page.evaluate(() => {
    const findUi = () => {
      // EditorUi sets various things on prototype. The instance is usually attached to body or referenced via mxResources.
      // Search for divs with __EditorUi reference
      for (const k of Object.keys(window)) {
        try {
          const v = window[k];
          if (v && typeof v === 'object' && v.editor && v.editor.graph) {
            return { key: k, type: v.constructor && v.constructor.name };
          }
        } catch (e) {}
      }
      return null;
    };
    return {
      mainType: typeof window.App && typeof window.App.main,
      mainCalled: typeof window.App.main === 'function' ? window.App.main.toString().slice(0, 200) : null,
      ui: findUi(),
      // try walking DOM
      editorEl: !!document.querySelector('.geEditor, .geMenubar'),
    };
  });
  console.log(JSON.stringify(probe, null, 2));

  // try invoking main if it's not yet
  const fixed = await page.evaluate(() => {
    if (typeof window.App.main === 'function' && !window.__uiProbe) {
      try {
        window.App.main(function (theApp) {
          window.__uiProbe = theApp;
        });
        return 'invoked';
      } catch (e) { return 'err: ' + e.message; }
    }
    return 'noop';
  });
  console.log('invoke result:', fixed);
  await new Promise((r) => setTimeout(r, 3000));
  const after = await page.evaluate(() => ({
    has: !!(window.__uiProbe && window.__uiProbe.editor && window.__uiProbe.editor.graph),
    keysOnUi: window.__uiProbe ? Object.keys(window.__uiProbe).slice(0, 20) : null,
  }));
  console.log('after invoke:', JSON.stringify(after, null, 2));

  await browser.close();
})();
