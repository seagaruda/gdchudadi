const { chromium } = require('playwright');
const OUT = '/tmp/shots-play';
const BASE = 'http://127.0.0.1:8802/index.html';

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 2.4 });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.mouse.click(225, 400);
  await p.waitForTimeout(3500);
  await p.mouse.click(421, 49);          // info icon
  await p.waitForTimeout(1200);

  // 切到「关于游戏」页签
  const tabs = await p.evaluate(() => [...document.querySelectorAll('*')]
    .filter(e => e.children.length === 0 && /关于|關於/.test(e.textContent || ''))
    .map(e => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  console.log('tabs', JSON.stringify(tabs));
  let hit = false;
  for (const t of tabs) {
    if (/关于|關於/.test(t.t) && t.x > 0) {
      await p.mouse.click(t.x, t.y);
      hit = true;
      break;
    }
  }
  await p.waitForTimeout(1200);
  console.log('clicked about tab:', hit);
  await p.screenshot({ path: OUT + '/05-about.png' });
  await b.close();
})();
