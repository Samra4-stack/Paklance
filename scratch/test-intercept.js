const { chromium } = require('playwright');

const PROD_URL = 'https://www.paklance.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const mockJob = {
    id: 'job_prod_demo_1',
    title: 'Fintech Mobile & Web Portal',
    budget: 85000,
    status: 'OPEN'
  };

  const mockContract = {
    id: 'prod_contract_demo',
    status: 'IN_PROGRESS',
    createdAt: new Date().toISOString(),
    job: { title: 'Enterprise Web Platform', budget: 120000 },
    client: { id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT' },
    specialist: { id: 'spec_prod_1', name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' },
    escrow: { balance: 120000 },
    milestones: [
      { id: 'm1', title: 'Milestone 1: Architecture & Frontend', amount: 60000, status: 'FUNDED' },
      { id: 'm2', title: 'Milestone 2: Backend & Testing', amount: 60000, status: 'PENDING' }
    ]
  };

  page.on('request', req => console.log('REQ:', req.method(), req.url()));
  page.on('response', res => console.log('RES:', res.status(), res.url()));

  await page.route('**/api/messaging/sync-delivered', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ count: 0 }) });
  });

  await page.route('**/api/jobs*', async route => {
    const url = route.request().url();
    if (url.includes('clientId=')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockJob]) });
    }
    return route.continue();
  });

  await page.route('https://www.paklance.com/api/contracts**', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockContract]) });
  });

  await page.route('https://www.paklance.com/api/messaging/conversations**', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{
      id: 'conv_prod_1',
      participant1Id: 'prod_smoke_client',
      participant2Id: 'spec_prod_1',
      otherUser: { id: 'spec_prod_1', name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' },
      messages: [],
      unreadCount: 0
    }]) });
  });

  await page.route('https://www.paklance.com/api/wallet/**', async route => {
    const url = route.request().url();
    if (url.includes('balance')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: 150000 }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  await page.goto(`${PROD_URL}/#home`, { waitUntil: 'networkidle' });

  // Set mock authenticated client in localStorage
  await page.evaluate(() => {
    const clientUser = { id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT', email: 'smoke_client@paklance.com' };
    localStorage.setItem('paklance_user', JSON.stringify(clientUser));
    localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
  });

  console.log('Testing route contract...');
  await page.evaluate(() => route('contract'));
  await page.waitForTimeout(1500);

  const miles = await page.$$('.mile-row');
  console.log('Milestone rows count:', miles.length);

  console.log('Switching to messages tab...');
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="messages"]');
    if (tabBtn) tabBtn.click();
  });
  await page.waitForTimeout(600);

  const composer = await page.$('.fullscreen-chat-composer');
  console.log('Contract composer present:', !!composer);

  console.log('Testing openDirectHire modal...');
  await page.evaluate(async () => {
    await openDirectHire({
      id: 'spec_prod_1',
      name: 'Tariq Mehmood',
      role: 'Senior Full Stack Specialist',
      rate: 5000
    });
  });
  await page.waitForTimeout(1000);

  const isDirectHireOpen = await page.$eval('#directHireModal', el => el.classList.contains('open'));
  console.log('Direct Hire Modal opened:', isDirectHireOpen);

  await browser.close();
})().catch(e => console.error(e));
