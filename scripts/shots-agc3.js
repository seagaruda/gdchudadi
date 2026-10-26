const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:8799/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.mouse.click(225, 400);
  await p.waitForTimeout(3000);

  // locate top-right icon buttons
  const info = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const t = (el.innerText || '').trim();
      const r = el.getBoundingClientRect();
      if (['i', '🏆', '🌐', '🔊', '❔', 'ℹ️'].includes(t) && r.width > 0 && r.width < 60 && el.children.length === 0) {
        out.push(t + '@' + Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2));
      }
    });
    return out;
  });
  console.log('icons:', info.join(' | '));

  const ic = info.find(x => x.startsWith('i@'));
  if (ic) {
    const [x, y] = ic.split('@')[1].split(',').map(Number);
    await p.mouse.click(x, y);
    await p.waitForTimeout(1500);
    await p.screenshot({ path: '/tmp/shots/s5.png' });
    console.log('s5 clicked i at', x, y);
  }
  const rk = info.find(x => x.startsWith('🏆@'));
  if (rk) {
    const [x, y] = rk.split('@')[1].split(',').map(Number);
    await p.mouse.click(0, 0);
    await p.waitForTimeout(500);
    await p.mouse.click(x, y);
    await p.waitForTimeout(1200);
    await p.screenshot({ path: '/tmp/shots/s6.png' });
    console.log('s6 clicked trophy');
  }
  await b.close();
})();
