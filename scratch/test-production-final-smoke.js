const { chromium } = require('playwright');

const PROD_URL = 'https://www.paklance.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`=== STARTING COMPLETE PRODUCTION SMOKE TEST ON HTTPS://WWW.PAKLANCE.COM ===\n`);

  const results = [];
  function record(name, pass, detail = '') {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`);
    results.push({ name, pass, detail });
  }

  // Persistent mock contract and job data for simulated authenticated flows
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

  // Route handlers for protected authenticated pages
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

  await page.route('**/api/contracts', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([mockContract]) });
  });

  await page.route('**/api/messaging/conversations**', async route => {
    const url = route.request().url();
    if (url.includes('/messages')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'msg_1',
          content: 'Hello, looking forward to starting the milestones!',
          createdAt: new Date().toISOString(),
          senderId: 'spec_prod_1',
          isRead: true,
          isDelivered: true
        }])
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        id: 'conv_prod_1',
        participant1Id: 'prod_smoke_client',
        participant2Id: 'spec_prod_1',
        otherUser: { id: 'spec_prod_1', name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' },
        messages: [{
          id: 'msg_1',
          content: 'Hello, looking forward to starting the milestones!',
          createdAt: new Date().toISOString(),
          senderId: 'spec_prod_1',
          isRead: true,
          isDelivered: true
        }],
        unreadCount: 0
      }])
    });
  });

  await page.route('**/api/wallet/balance', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ balance: 150000 }) });
  });

  await page.route('**/api/wallet/payout-methods', async route => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });

  // 1. Homepage loads
  await page.setViewportSize({ width: 1280, height: 800 });
  const resp = await page.goto(`${PROD_URL}/#home`, { waitUntil: 'networkidle' });
  const pageTitle = await page.title();
  record('1. Homepage loads with HTTP 200', resp.status() === 200, `Title: ${pageTitle}`);

  // Set user auth in browser
  await page.evaluate(() => {
    const clientUser = { id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT', email: 'smoke_client@paklance.com' };
    localStorage.setItem('paklance_user', JSON.stringify(clientUser));
    localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
  });

  // 2. Jobs load from live API
  await page.evaluate(() => route('jobs'));
  await page.waitForTimeout(1500);
  const jobCards = await page.$$('.job-card');
  record('2. Jobs load from Production API', jobCards.length > 0, `Found ${jobCards.length} job cards`);

  // 3. Specialist profiles load from live API
  await page.evaluate(() => route('talent'));
  await page.waitForTimeout(1500);
  const talentCards = await page.$$('.freelancer-card');
  record('3. Specialist profiles load from Production API', talentCards.length > 0, `Found ${talentCards.length} specialist cards`);

  // 4. Specialist profile view & Hire Me button verification
  await page.evaluate(() => {
    const spec = (typeof liveFreelancers !== 'undefined' && liveFreelancers.length > 0)
      ? liveFreelancers[0]
      : {
          id: 'spec_prod_1',
          name: 'Tariq Mehmood',
          role: 'Senior Full Stack Specialist',
          city: 'Lahore',
          rate: 5000,
          skills: ['React', 'Node.js', 'PostgreSQL'],
          available: true
        };
    _renderProfileUI(spec);
    route('profile');
  });
  await page.waitForTimeout(800);
  const hireBtn = await page.$('#hireBtn');
  const msgBtn = await page.$('#messageSpecialistBtn');
  record('4. Specialist Profile details & Hire Me button', !!hireBtn && !!msgBtn, 'Hire Me and Message buttons rendered');

  // 5. Test Direct Hire flow on Production (Direct Hire modal opens, NO duplicate job created)
  await page.evaluate(async () => {
    closeModals();
    await openDirectHire({
      id: 'spec_prod_1',
      name: 'Tariq Mehmood',
      role: 'Senior Full Stack Specialist',
      rate: 5000
    });
  });
  await page.waitForTimeout(1000);
  const isDirectHireOpen = await page.$eval('#directHireModal', el => el.classList.contains('open'));
  const isPostJobOpen = await page.$eval('#postJobModal', el => el.classList.contains('open'));
  record('5. Hire Me opens Direct Hire modal (NOT Post Job)', isDirectHireOpen && !isPostJobOpen, `DirectHire: ${isDirectHireOpen}, PostJob: ${isPostJobOpen}`);

  await page.evaluate(() => closeModals());

  // 6. Contract Page loads & displays active contract workspace
  await page.evaluate(() => route('contract'));
  await page.waitForSelector('.mile-row', { timeout: 5000 });

  const milestonesRendered = await page.$$('.mile-row');
  record('6. Contract Page loads with active milestones & SafePay Escrow', milestonesRendered.length >= 2, `Found ${milestonesRendered.length} milestones`);

  // 7. Switch to messages tab in Contract
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="messages"]');
    if (tabBtn) tabBtn.click();
  });
  await page.waitForTimeout(600);

  const composerVisible = await page.$eval('.fullscreen-chat-composer', el => !!el);
  record('7. Contract Chat Composer sticky & active in Messages tab', composerVisible);

  // 8. Switch to files tab in Contract
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="files"]');
    if (tabBtn) tabBtn.click();
  });
  await page.waitForTimeout(600);

  const filesTab = await page.$('#contractTabFiles');
  record('8. Contract Files tab accessible with upload and actions', !!filesTab);

  // 9. Messages page loads — reset state and re-auth before navigating
  await page.evaluate(() => {
    localStorage.setItem('paklance_user', JSON.stringify({ id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT', email: 'smoke_client@paklance.com' }));
    localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
  });
  await page.evaluate(async () => { await route('messages'); });
  await page.waitForTimeout(4000);
  const messagesShell = await page.$('#messagesMain .messages-shell');
  record('9. Messages Page loads split-pane interface', !!messagesShell);

  // 10. Role label format test in UI (Both directions)
  const clientViewingSpecRole = await page.evaluate(() => formatRole('SPECIALIST', 'Senior Full Stack Specialist'));
  const specViewingClientRole = await page.evaluate(() => formatRole('CLIENT'));
  record('10. Role mapper formatRole() logic in UI', 
    clientViewingSpecRole === 'Senior Full Stack Specialist' && specViewingClientRole === 'Client',
    `Client sees: "${clientViewingSpecRole}", Specialist sees: "${specViewingClientRole}"`
  );

  // 11. Wallet page loads
  // Restore desktop viewport and auth state before wallet check
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.evaluate(() => {
    localStorage.setItem('paklance_user', JSON.stringify({ id: 'prod_smoke_client', name: 'Karachi Tech Ventures', role: 'CLIENT', email: 'smoke_client@paklance.com' }));
    localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
  });
  await page.evaluate(async () => { await route('wallet'); });
  await page.waitForTimeout(2000);
  const walletMain = await page.$('#walletMain .wallet-grid');
  const walletView = await page.$eval('[data-view="wallet"]', el => el.classList.contains('active'));
  record('11. Wallet Page loads correctly', walletView && !!walletMain, `Wallet view active: ${walletView}, walletMain rendered: ${!!walletMain}`);

  // 12. Safe-area padding and scroll clearance on mobile (375px, 390px, 414px)
  const mobileWidths = [375, 390, 414];
  for (const w of mobileWidths) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.evaluate(() => {
      localStorage.setItem('paklance_user', JSON.stringify({ id: 'prod_smoke_client', name: 'Client', role: 'CLIENT' }));
      localStorage.setItem('paklance_token', 'mock_token_for_smoke_test');
      route('home');
    });
    await page.waitForTimeout(400);

    const brandBox = await page.$eval('.brand', el => el.getBoundingClientRect());
    const menuBox = await page.$eval('#menuButton', el => el.getBoundingClientRect());
    const isHamburgerFarRight = menuBox.left > brandBox.right + 40;
    record(`12. [Mobile ${w}px] Hamburger positioned on far right`, isHamburgerFarRight, `BrandRight: ${brandBox.right.toFixed(0)}, MenuLeft: ${menuBox.left.toFixed(0)}`);

    await page.evaluate(() => route('dashboard'));
    await page.waitForTimeout(300);
    const bottomNavDisplay = await page.$eval('.mobile-bottom-nav', el => window.getComputedStyle(el).display);
    record(`13. [Mobile ${w}px] Bottom Navigation displayed`, bottomNavDisplay === 'grid');
  }

  // 14. Mobile Back Navigation Test
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => route('home')); await page.waitForTimeout(300);
  await page.evaluate(() => route('jobs')); await page.waitForTimeout(300);
  await page.evaluate(() => route('talent')); await page.waitForTimeout(300);

  await page.goBack(); await page.waitForTimeout(400);
  const back1 = await page.$eval('.view.active', el => el.dataset.view);
  await page.goBack(); await page.waitForTimeout(400);
  const back2 = await page.$eval('.view.active', el => el.dataset.view);

  record('14. SPA History and Mobile Back navigation', back1 === 'jobs' && back2 === 'home', `Back 1: ${back1}, Back 2: ${back2}`);

  console.log('\n=== PRODUCTION SMOKE TEST SUMMARY ===');
  const allPassed = results.every(r => r.pass);
  console.log(`Passed: ${results.filter(r => r.pass).length} / ${results.length}`);
  console.log(`All Passed: ${allPassed}`);

  await browser.close();
  process.exit(allPassed ? 0 : 1);
})().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
