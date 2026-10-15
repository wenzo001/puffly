import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await (await browser.newContext({viewport:{width:393,height:852},deviceScaleFactor:2,isMobile:true,hasTouch:true})).newPage();
await page.goto('http://127.0.0.1:4173/puffly/', {waitUntil:'load'});
await page.waitForSelector('.stage[data-aim]', {timeout:30000});
await page.waitForTimeout(2800);
const shot = await page.screenshot({ path: '/tmp/puffly-repro/ground.png' });
const r = await page.evaluate((b64)=>new Promise(res=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
 const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
 const A={};document.querySelector('.stage').getAttribute('data-aim').trim().split(/\s+/).forEach(p=>{const[k,v]=p.split(':');A[k]=v.split(',').map(Number);});
 const L=(d,i)=>0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];
 const at=(x,y)=>{const d=g.getImageData(Math.round(x*2),Math.round(y*2),1,1).data;return +L(d,0).toFixed(1);};
 const out={};for(const k of ['pack','lighter','ashtray']){const[fx,fy]=A[k];out[k]={body:at(fx*393,fy*852),ground:at(fx*393+30,fy*852)};}
 out.wall=at(196,150); res(out);};img.src=`data:image/png;base64,${b64}`;}), shot.toString('base64'));
for (const [k,v] of Object.entries(r)) {
  if (typeof v === 'number') { console.log(`wall L=${v}`); continue; }
  console.log(`${k.padEnd(9)} body L=${String(v.body).padStart(5)}  ground L=${String(v.ground).padStart(5)}  ratio ${(v.body/Math.max(1,v.ground)).toFixed(2)}  ${v.body>=v.ground?'LIGHTER than ground (as the Demo)':'still darker'}`);
}
await browser.close();
