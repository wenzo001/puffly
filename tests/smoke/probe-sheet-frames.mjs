/**
 * The acceptance measurement for "the bottom of the skins list flickers": read what the scene
 * actually draws, per composited frame, with the DOM held still. No screenshots — a forced frame
 * lands inside the mirror's own clear/read/paint task and invents motion.
 *   node tests/smoke/probe-sheet-frames.mjs
 */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true})).newPage();
await page.goto('http://127.0.0.1:4173/puffly/', {waitUntil:'load'});
await page.waitForSelector('.stage[data-aim]', {timeout:30000});
await page.waitForTimeout(2200);
await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||x.textContent||'').includes('boxes'));b?.click();});
await page.waitForTimeout(1500);
await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||x.textContent||'').includes('skins'));b?.click();});
await page.waitForTimeout(1200);
for(let k=0;k<3;k++){await page.evaluate(()=>{const s=[...document.querySelectorAll('.sheet')].find(x=>x.getAttribute('data-open')==='true'); if(s) s.scrollTop=s.scrollHeight;}); await page.waitForTimeout(400);}
const res = await page.evaluate(() => new Promise((resolve) => {
  const pick=(o,ns)=>{for(const n of ns){const i=o?.[n]; if(i&&typeof i==='object') return i;} return o;};
  const scene = pick(window.__pufflyScene?.context?.scene, ['value','instance','object','current']);
  const frames=[]; let n=0;
  const tick = () => {
    const sig=[];
    scene.traverse((o)=>{
      if(!o.isMesh||o.visible!==true) return;
      const m=o.material;
      if(!Array.isArray(m?.clippingPlanes)||m.clippingPlanes.length!==4) return;
      const e=o.matrixWorld.elements;
      sig.push(`z${o.position.z.toFixed(3)}@${e[12].toFixed(2)},${e[13].toFixed(3)}`);
    });
    const s=[...document.querySelectorAll('.sheet')].find(x=>x.getAttribute('data-open')==='true');
    frames.push({sig:sig.join('|'),count:sig.length,st:s?s.scrollTop:-1});
    n+=1;
    if(n<90) globalThis.requestAnimationFrame(tick); else resolve(frames);
  };
  globalThis.requestAnimationFrame(tick);
}));
const sets=res.map(f=>new Set(f.sig.split('|')));
const diffs=[]; for(let i=1;i<sets.length;i++){let d=0;for(const x of sets[i-1])if(!sets[i].has(x))d++;diffs.push(d);}
const all=new Set(); sets.forEach(s=>s.forEach(x=>all.add(x)));
console.log('frames sampled        :', res.length);
console.log('clipped slots         :', [...new Set(res.map(f=>f.count))].join(','));
console.log('scrollTop             :', [...new Set(res.map(f=>f.st))].join(','));
console.log('distinct placements   :', all.size, 'of', sets[0].size, 'slots');
console.log('per-frame changed     : max', Math.max(...diffs), 'mean', (diffs.reduce((a,b)=>a+b,0)/diffs.length).toFixed(2), 'nonzero', diffs.filter(d=>d>0).length,'/',diffs.length);
const stable = all.size === sets[0].size;
console.log(stable ? 'STABLE — nothing the scene draws moves while the DOM is still' : '<-- STILL FLICKERING');
await browser.close();
