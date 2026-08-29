const { chromium } = require('playwright');
const PROD_URL = 'https://www.paklance.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => { if (msg.type() !== 'log' || !msg.text().includes('BROWSER')) console.log('BROWSER:', msg.type(), msg.text()); });

  await page.route('**/api/messaging/sync-delivered', async route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) }));
  
  await page.route('**/api/messaging/conversations**', async route => {
    const url = route.request().url();
    if (url.includes('/messages')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: 'conv_prod_1',
      participant1Id: 'prod_smoke_client',
      participant2Id: 'spec_prod_1',
      otherUser: { id: 'spec_prod_1', name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' },
      messages: [],
      unreadCount: 0
    }]) });
  });

  await page.goto(`${PROD_URL}/#home`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('paklance_user', JSON.stringify({ id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT', email: 'smoke_client@paklance.com' }));
    localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
  });

  // Simulate the contract -> messages tab -> then route('messages') scenario
  console.log('Simulating contract tab click then route("messages")...');
  
  // First go somewhere else
  await page.evaluate(() => route('jobs'));
  await page.waitForTimeout(800);
  
  // Then go to messages
  await page.evaluate(async () => { await route('messages'); });
  await page.waitForTimeout(3000);

  // Check what's in messagesMain
  const mainHtml = await page.$eval('#messagesMain', el => el.innerHTML);
  console.log('messagesMain innerHTML length:', mainHtml.length);
  console.log('Has messages-shell:', mainHtml.includes('messages-shell'));
  console.log('First 300 chars:', mainHtml.slice(0, 300));

  const shell = await page.$('#messagesMain .messages-shell');
  console.log('Shell found:', !!shell);

  // Also check current active view
  const activeView = await page.$eval('.view.active', el => el.dataset.view);
  console.log('Active view:', activeView);

  await browser.close();
})().catch(e => console.error('Error:', e));
