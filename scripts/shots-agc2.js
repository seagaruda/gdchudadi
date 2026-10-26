const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 450, height: 800 }, deviceScaleFactor: 1 });
  await p.goto('http://127.0.0.1:8799/index.html', { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.mouse.click(225, 400);
  await p.waitForTimeout(3500);

  // rules / card-type modal
  try {
    await p.locator('text=牌型').last().click({ timeout: 5000 });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: '/tmp/shots/s3.png' });
    console.log('s3 ok');
    await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
  } catch (e) { console.log('s3 fail', e.message.slice(0, 120)); }

  // score table
  try {
    const btns = await p.locator('text=🏆').all();
    if (btns.length) { await btns[0].click({ timeout: 5000 }); }
    else { await p.mouse.click(400, 30); }
    await p.waitForTimeout(1500);
    await p.screenshot({ path: '/tmp/shots/s4.png' });
    console.log('s4 ok');
  } catch (e) { console.log('s4 fail', e.message.slice(0, 120)); }

  await b.close();
})();
