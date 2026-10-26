const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:8799/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: '/tmp/shots/s1.png' });

  // dump visible text to understand UI
  const txt = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1200));
  console.log('--- text1 ---\n' + txt);

  // tap table centre to deal
  await p.mouse.click(225, 400);
  await p.waitForTimeout(3500);
  await p.screenshot({ path: '/tmp/shots/s2.png' });
  const txt2 = await p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1200));
  console.log('--- text2 ---\n' + txt2);

  // find clickable labels
  const labels = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('button,[role=button],.btn,[onclick],a').forEach(el => {
      const t = (el.innerText || '').trim();
      const r = el.getBoundingClientRect();
      if (t && r.width > 0) out.push(t.slice(0, 20) + ' @' + Math.round(r.x + r.width / 2) + ',' + Math.round(r.y + r.height / 2));
    });
    return out.slice(0, 40);
  });
  console.log('--- clickables ---\n' + labels.join(' | '));

  await b.close();
})();
