const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function captureViews() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    ignoreHTTPSErrors: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,1050', '--ignore-certificate-errors']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1050 });

  console.log('Logging in...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });

  if (page.url().includes('/login')) {
    await page.type('#username', 'admin');
    await page.type('#password', 'DrishtiAdmin@2026');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('#submitBtn')
    ]);
  }

  await new Promise(r => setTimeout(r, 3000));

  const views = [
    { name: 'overview', fn: 'showView("overview")' },
    { name: 'roads', fn: 'showView("roads")' },
    { name: 'traffic', fn: 'showView("traffic")' },
    { name: 'safety', fn: 'showView("safety")' },
    { name: 'analytics', fn: 'showView("analytics")' },
    { name: 'departments', fn: 'showView("departments")' },
    { name: 'workorders', fn: 'showView("workorders")' },
    { name: 'events', fn: 'showView("events")' }
  ];

  for (const v of views) {
    console.log(`Capturing view: ${v.name}...`);
    await page.evaluate(v.fn);
    await new Promise(r => setTimeout(r, 1200));
    await page.screenshot({ path: path.join(__dirname, `view-${v.name}.png`), fullPage: false });
  }

  await browser.close();
  console.log('All views captured successfully!');
}

captureViews().catch(console.error);
