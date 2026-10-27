const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8802/index.html';
const OUT = process.env.OUT || '/tmp/shots-play';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  // 450x800 * 2.4 => 1080x1920 (Google Play 9:16)
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 2.4 });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: OUT + '/01-start.png' });

  await p.mouse.click(225, 400);
  await p.waitForTimeout(4000);
  await p.screenshot({ path: OUT + '/02-play.png' });

  // 出牌几次，让桌面有多轮牌面
  for (let i = 0; i < 6; i++) {
    const box = await p.evaluate(() => {
      const el = [...document.querySelectorAll('*')].find(e =>
        e.className && String(e.className).includes('card') && e.offsetHeight > 40);
      return el ? { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, h: el.offsetHeight } : null;
    });
    if (box) { await p.mouse.click(box.x + 10, box.y + box.h / 2); await p.waitForTimeout(400); }
    await p.waitForTimeout(1200);
  }
  await p.screenshot({ path: OUT + '/03-midgame.png' });

  await p.mouse.click(421, 49);   // i icon -> rules
  await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + '/04-rules.png' });

  await b.close();
  console.log('done', OUT);
})();
