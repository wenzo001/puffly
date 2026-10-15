import { chromium } from 'playwright';
const URL_ARG = 'http://127.0.0.1:4183/puffly/';
const FLAGS = (process.env.PUFFLY_CHROME_ARGS || '').split(' ').filter(Boolean);
const run = async (route) => {
  const browser = await chromium.launch(FLAGS.length ? { args: FLAGS } : {});
  const page = await (await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await page.goto(URL_ARG, { waitUntil: 'load' });
  await page.waitForSelector('.stage[data-aim]', { timeout: 30000 });
  await page.waitForTimeout(2500);
  const aim = await page.evaluate(() => {
    const raw = document.querySelector('.stage')?.dataset.aim ?? '';
    const b = document.querySelector('.stage').getBoundingClientRect();
    const f = {};
    for (const p of raw.split(' ')) { const i = p.indexOf(':'); if (i > 0) { const [x, y] = p.slice(i + 1).split(',').map(Number); if (Number.isFinite(x)) f[p.slice(0, i)] = { x: b.left + x * b.width, y: b.top + y * b.height }; } }
    return f;
  });
  if (aim.pack) await page.touchscreen.tap(aim.pack.x, aim.pack.y);
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => document.querySelector('.stage')?.dataset.affordance ?? '');
  const box = await page.locator('.pill').boundingBox();
  let pressed = 'no-box';
  if (box) {
    if (route === 'click') { await page.locator('.pill').click({ timeout: 5000 }).catch(() => {}); pressed = 'click'; }
    else { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up(); pressed = 'down/up 30ms'; }
  }
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({ aff: document.querySelector('.stage')?.dataset.affordance ?? '', phase: document.querySelector('.stage')?.dataset.phase ?? '', frames: window.__pufflyScene?.frames ?? -1 }));
  await browser.close();
  return { route, pressed, before, ...after };
};
console.log(JSON.stringify(await run('downup')));
console.log(JSON.stringify(await run('click')));
