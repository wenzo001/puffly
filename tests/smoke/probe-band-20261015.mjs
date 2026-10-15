/**
 * The same band, with the panel closed and then open and scrolled: the wall's own gradient is
 * subtracted out, so a difference can only be something the panel drew there.
 *   node tests/smoke/probe-band-20261015.mjs
 */
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true})).newPage();
await page.goto('http://127.0.0.1:4173/puffly/', {waitUntil:'networkidle'});
await page.waitForSelector('.stage[data-aim]', {timeout:30000});
await page.waitForTimeout(2500);
const band = (top) => [0, Math.round((top-30)*2), 786, Math.round((top-4)*2)];
const rd = (boxes) => (b64) => page.evaluate((d)=>new Promise(res=>{
  const img=new Image(); img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
    const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
    res(d.boxes.map(([x0,y0,x1,y1])=>{const p=g.getImageData(x0,y0,x1-x0,y1-y0).data;let n=0,a=[0,0,0],mx=0;
      for(let i=0;i<p.length;i+=4){a[0]+=p[i];a[1]+=p[i+1];a[2]+=p[i+2];const L=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];if(L>mx)mx=L;n++;}
      const m=a.map(v=>v/n);return {mean:m.map(Math.round),L:+(.2126*m[0]+.7152*m[1]+.0722*m[2]).toFixed(1),maxL:+mx.toFixed(1)};}));};
  img.src=`data:image/png;base64,${d.b64}`;}),{b64,boxes});

let shot = await page.screenshot();
const closed = (await rd([band(409/2)])(shot.toString('base64')))[0];
console.log('BAND_closed_sheet', JSON.stringify(closed));

await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||x.textContent||'').trim().toLowerCase().includes('settings'));b?.click();});
await page.waitForTimeout(1500);
for (const off of [0,120,300]) {
  await page.evaluate((o)=>{const s=[...document.querySelectorAll('.sheet')].find(x=>x.getAttribute('data-open')==='true'); if(s) s.scrollTop=o;},off);
  await page.waitForTimeout(500);
  shot = await page.screenshot();
  const r = (await rd([band(409/2)])(shot.toString('base64')))[0];
  console.log(`BAND_open scroll@${off}`, JSON.stringify(r), `delta_vs_closed=${(r.L-closed.L).toFixed(1)}`, r.L-closed.L>4?'<-- PANEL DREW HERE':'');
}
await browser.close();
