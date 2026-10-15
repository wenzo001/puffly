/**
 * The props' true rendered size, from the scene graph and the orthographic camera's own world box —
 * no pixel segmentation, which cannot tell two neighbouring dark objects apart.
 *   node tests/smoke/probe-prop-geometry.mjs
 */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true})).newPage();
await page.goto('http://127.0.0.1:4173/puffly/', {waitUntil:'load'});
await page.waitForSelector('.stage[data-aim]', {timeout:30000});
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const pick=(o,ns)=>{for(const n of ns){const i=o?.[n]; if(i&&typeof i==='object') return i;} return o;};
  const ctx = window.__pufflyScene?.context;
  const scene = pick(ctx?.scene, ['value','instance','object','current']);
  let cam = pick(ctx?.camera, ['value','instance','object','current']);
  const ac = ctx?.camera?.activeCamera;
  cam = ac?.value ?? ac?.current ?? cam;
  const camInfo = { ctor: cam?.constructor?.name, keys: cam ? Object.keys(cam).slice(0,14) : null,
    ortho: cam?.isOrthographicCamera === true, left:cam?.left, right:cam?.right, top:cam?.top, bottom:cam?.bottom };
  if (!cam || cam.left === undefined) return { camInfo, props: null };
  const worldW = cam.right - cam.left, worldH = cam.top - cam.bottom;
  const stageW = 393, stageH = 852;
  const props = {};
  scene.traverse(o => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    const g = o.geometry;
    let w=null,h=null;
    if (g?.type === 'BoxGeometry') { w = g.parameters.width; h = g.parameters.height; }
    else if (g?.type === 'CylinderGeometry') { w = g.parameters.radiusTop*2; h = g.parameters.height; }
    else if (g?.type === 'RingGeometry') { w = g.parameters.outerRadius*2; h = g.parameters.outerRadius*2; }
    if (w === null) return;
    const cssW = (w * o.scale.x / worldW) * stageW;
    const cssH = (h * o.scale.y / worldH) * stageH;
    const key = o.name || (g.type + '@' + o.parent?.name);
    props[key] = { cssW:+cssW.toFixed(1), cssH:+cssH.toFixed(1), aspect:+(cssW/cssH).toFixed(3),
      worldW:+(w*o.scale.x).toFixed(4), worldH:+(h*o.scale.y).toFixed(4) };
  });
  return { camInfo, worldW:+worldW.toFixed(3), worldH:+worldH.toFixed(3), props };
});
console.log('camera', JSON.stringify(out.camInfo));
if (out.props) {
  console.log('world box', out.worldW, 'x', out.worldH);
  for (const [k,v] of Object.entries(out.props)) console.log(' ', k.padEnd(22), JSON.stringify(v));
}
await browser.close();
