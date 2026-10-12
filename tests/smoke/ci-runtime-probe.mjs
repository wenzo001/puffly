/**
 * What the runner itself is able to do, printed before the suite drives it (#159).
 *
 * CI's device job had died inside ~110 seconds three runs in a row, and a GitHub Actions job log is
 * not readable without a token, so nothing on this machine could say *which* of the three ways it
 * died: the browser not launching, the page never settling, or the scene never framing. This answers
 * that with numbers, in one place, in under a minute:
 *
 *   node tests/smoke/ci-runtime-probe.mjs http://127.0.0.1:4173/puffly/ [report-file]
 *
 * It is a diagnostic and never a gate: it exits 0 whatever it finds, so the suite still gets to run
 * and still owns every verdict. The launch options mirror the suite's, because a probe that launches
 * differently proves nothing about the thing that failed.
 */

const URL_ARG = process.argv[2] ?? 'http://localhost:5175/';
const REPORT = process.argv[3] ?? '';
const PLAYWRIGHT_SPEC = process.env['PUFFLY_PLAYWRIGHT'] ?? 'playwright';
const CHROME = process.env['PUFFLY_CHROME'];

const lines = [];
const say = (text) => {
  lines.push(text);
  console.log(`PROBE ${text}`);
};

let browser;
try {
  const playwright = await import(PLAYWRIGHT_SPEC);
  const engine = playwright.chromium;
  if (engine === undefined) throw new Error(`no chromium export in ${PLAYWRIGHT_SPEC}`);
  // The same options touch-device.mjs uses: a named binary, else Playwright's full Chromium build.
  browser = await engine.launch(
    CHROME !== undefined ? { executablePath: CHROME } : { channel: 'chromium' },
  );
  say(`launch ok ${browser.version()}`);
} catch (error) {
  say(`launch FAILED: ${String(error.message ?? error).slice(0, 300)}`);
  browser = undefined;
}

if (browser) {
  try {
    const page = await browser.newPage({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
    });
    const pageErrors = [];
    const consoleErrors = [];
    const inFlight = new Map();
    const bump = (url, delta) => inFlight.set(url, (inFlight.get(url) ?? 0) + delta);
    page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
    });
    // Counted per url rather than per Request object: the finished event is not guaranteed to hand
    // back the identical instance, and an inflated "still in flight" list is exactly the kind of
    // reading this file exists to prevent.
    page.on('request', (request) => bump(request.url(), 1));
    page.on('requestfinished', (request) => bump(request.url(), -1));
    page.on('requestfailed', (request) => bump(request.url(), -1));

    // The suite's own first move is `goto(..., { waitUntil: 'networkidle' })`. Splitting it into
    // `load` and then `networkidle` is the whole point of this file: those two fail for different
    // reasons, and only the second one is a network question.
    const started = performance.now();
    let loadMs = -1;
    try {
      await page.goto(URL_ARG, { waitUntil: 'load', timeout: 20000 });
      loadMs = Math.round(performance.now() - started);
      say(`goto load ok in ${String(loadMs)}ms`);
    } catch (error) {
      say(
        `goto load FAILED after ${String(Math.round(performance.now() - started))}ms: ` +
          String(error.message ?? error).slice(0, 240),
      );
    }
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
      say(`networkidle reached ${String(Math.round(performance.now() - started))}ms after start`);
    } catch {
      say('networkidle NEVER reached within 15000ms of goto');
    }

    const open = [...inFlight.entries()].filter(([, count]) => count > 0).map(([url]) => url);
    say(`requests still in flight: ${String(open.length)} ${JSON.stringify(open.slice(0, 6))}`);

    // Give the scene four seconds to report a backend, then read the same handles the suite reads.
    await page.waitForTimeout(4000);
    const facts = await page.evaluate(async () => {
      const probe = globalThis.__pufflyScene;
      const gpu = globalThis.navigator?.gpu;
      let adapter = null;
      let gpuError = '';
      try {
        adapter = gpu ? await gpu.requestAdapter() : null;
      } catch (error) {
        gpuError = String(error).slice(0, 160);
      }
      const canvas = document.querySelector('canvas.scene3d');
      const test = document.createElement('canvas');
      return {
        backend: probe?.backend ?? 'no handle',
        frames: probe?.frames ?? -1,
        poolSize: probe?.poolSize ?? -1,
        stage: Boolean(document.querySelector('.stage')),
        hit: document.querySelectorAll('.hit').length,
        canvas3d: canvas ? [canvas.width, canvas.height] : null,
        navigatorGpu: Boolean(gpu),
        gpuAdapter: adapter
          ? adapter.info
            ? [adapter.info.vendor, adapter.info.architecture]
            : 'unnamed adapter'
          : null,
        gpuError,
        webgl2: Boolean(test.getContext('webgl2')),
        pendingResources: performance
          .getEntriesByType('resource')
          .filter((entry) => entry.responseEnd === 0)
          .map((entry) => entry.name.slice(-48))
          .slice(0, 6),
      };
    });
    say(`scene ${JSON.stringify(facts)}`);
    say(
      `pageerror x${String(pageErrors.length)} ${JSON.stringify(pageErrors.slice(0, 3))} / ` +
        `console-error x${String(consoleErrors.length)} ${JSON.stringify(consoleErrors.slice(0, 3))}`,
    );
  } catch (error) {
    say(`page phase threw: ${String(error.message ?? error).slice(0, 240)}`);
  }
  await browser.close().catch(() => {});
}

if (REPORT !== '') {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(REPORT, `${lines.join('\n')}\n`).catch((error) =>
    console.error(`probe report not written: ${String(error).slice(0, 120)}`),
  );
}
process.exit(0);
