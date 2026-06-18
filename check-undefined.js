const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setViewportSize({ width: 1400, height: 900 });

  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'ss-dashboard.png', fullPage: true });

  const pages = ['worklog', 'attendance', 'projects', 'leaves', 'issues', 'team'];

  for (const p of pages) {
    await page.evaluate(pg => window.navigate(pg), p);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `ss-${p}.png`, fullPage: true });

    const text = await page.evaluate(() => document.getElementById('main').innerText);
    const lines = text.split('\n').filter(l => l.includes('undefined'));
    if (lines.length > 0) {
      console.log(`\n⚠  [${p}] has ${lines.length} "undefined" occurrence(s):`);
      lines.forEach(l => console.log('   >', l.trim().slice(0, 120)));
    } else {
      console.log(`✅ [${p}] — no "undefined" found`);
    }
  }

  if (errors.length) {
    console.log('\n🔴 Console errors:');
    errors.slice(0, 15).forEach(e => console.log(' ', e));
  }

  await browser.close();
})();
