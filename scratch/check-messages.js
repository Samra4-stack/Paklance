const { chromium } = require('playwright');

const PROD_URL = 'https://www.paklance.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));

  await page.route('**/api/messaging/sync-delivered', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
  });

  await page.route('**/api/messaging/conversations', async route => {
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
    const clientUser = { id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT', email: 'smoke_client@paklance.com' };
    localStorage.setItem('paklance_user', JSON.stringify(clientUser));
    localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
  });

  console.log('Routing to messages...');
  await page.evaluate(async () => {
    await route('messages');
  });
  await page.waitForTimeout(2000);

  const html = await page.$eval('#messagesMain', el => el.innerHTML);
  console.log('messagesMain innerHTML length:', html.length);
  console.log('messagesMain sample:', html.slice(0, 200));

  await browser.close();
})().catch(e => console.error(e));
