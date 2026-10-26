const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8802/index.html';
const OUT = process.env.OUT || '/tmp/shots62';

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 1 });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/1-start.png' });

  await p.mouse.click(225, 400);          // tap the table centre to deal
  await p.waitForTimeout(3500);
  await p.screenshot({ path: OUT + '/2-play.png' });

  // top-right "i" icon -> rules modal
  await p.mouse.click(421, 49);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/3-rules.png' });

  const ver = await p.evaluate(() => document.body.innerText.match(/v?1\.5\.\d+(\.\d+)?/g) || []);
  console.log('version strings on screen:', ver.join(','), '| base', BASE);
  await b.close();
})();
