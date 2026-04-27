const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', defaultViewport: { width: 1920, height: 1080 } });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[browser]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:8080/index.html?dev=1&splash=0&drafts=0&local=1&storage=device', { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 8000));
  const probe = await page.evaluate(() => {
    return {
      hasApp: !!window.App,
      hasMain: !!(window.App && window.App.main),
      hasEditorUi: !!window.editorUi,
      hasMxCell: typeof window.mxCell,
      hasMxGeometry: typeof window.mxGeometry,
      keys: Object.keys(window).filter((k) => /^(App|Editor|mx|Graph)/.test(k)).slice(0, 40),
      bodyClasses: document.body.className,
      visibleDialogs: Array.from(document.querySelectorAll('.geDialog,.mxWindow,.geSplash')).map((d) => d.textContent.slice(0, 80)),
      menubar: Array.from(document.querySelectorAll('.geMenubar .geItem')).map((e) => e.textContent.trim()).slice(0, 10),
    };
  });
  console.log(JSON.stringify(probe, null, 2));
  await page.screenshot({ path: 'probe.png' });
  await browser.close();
})();
