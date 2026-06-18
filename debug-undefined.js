const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.setViewportSize({ width: 1400, height: 900 });

  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2500);

  // Dump raw API data to see field names
  const apiData = await page.evaluate(async () => {
    const [att, proj, leaves, issues] = await Promise.all([
      fetch('/api/attendance').then(r=>r.json()),
      fetch('/api/projects').then(r=>r.json()),
      fetch('/api/leaves').then(r=>r.json()),
      fetch('/api/issues').then(r=>r.json()),
    ]);
    return {
      att: att.slice ? att.slice(0,2) : att,
      proj: proj.slice ? proj.slice(0,2) : proj,
      leaves: leaves.slice ? leaves.slice(0,2) : leaves,
      issues: issues.slice ? issues.slice(0,2) : issues,
    };
  });

  console.log('\n=== /api/attendance sample ===');
  console.log(JSON.stringify(apiData.att, null, 2));
  console.log('\n=== /api/projects sample ===');
  console.log(JSON.stringify(apiData.proj, null, 2));
  console.log('\n=== /api/leaves sample ===');
  console.log(JSON.stringify(apiData.leaves, null, 2));
  console.log('\n=== /api/issues sample ===');
  console.log(JSON.stringify(apiData.issues, null, 2));

  await browser.close();
})();
