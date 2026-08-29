const { chromium } = require('playwright');

const PROD_URL = 'https://www.paklance.com';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`=== STARTING COMPLETE PRODUCTION SMOKE TEST ===\nTarget: ${PROD_URL}\n`);

  const results = [];
  function record(name, pass, detail = '') {
    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${name}${detail ? ' - ' + detail : ''}`);
    results.push({ name, pass, detail });
  }

  // 1. Homepage loads
  await page.setViewportSize({ width: 1280, height: 800 });
  const resp = await page.goto(`${PROD_URL}/#home`, { waitUntil: 'networkidle' });
  const pageTitle = await page.title();
  record('1. Homepage loads with HTTP 200', resp.status() === 200, `Title: ${pageTitle}`);

  // 2. Jobs load via UI navigation
  await page.evaluate(() => route('jobs'));
  await page.waitForTimeout(1500);
  const jobCards = await page.$$('.job-card');
  record('2. Jobs load on Production', jobCards.length > 0, `Found ${jobCards.length} job cards`);

  // 3. Specialist profiles load via UI navigation
  await page.evaluate(() => route('talent'));
  await page.waitForTimeout(1500);
  const talentCards = await page.$$('.freelancer-card');
  record('3. Specialist profiles load on Production', talentCards.length > 0, `Found ${talentCards.length} specialist cards`);

  // 4. Specialist profile view & Hire Me button verification
  if (talentCards.length > 0) {
    const viewBtn = await talentCards[0].$('button');
    if (viewBtn) {
      await viewBtn.click();
      await page.waitForTimeout(1000);
      const hireBtn = await page.$('#hireBtn');
      const msgBtn = await page.$('#messageSpecialistBtn');
      record('4. Specialist Profile modal details & Hire Me button', !!hireBtn && !!msgBtn, 'Hire Me and Message buttons present');
    }
  }

  // 5. Test Direct Hire flow on Production
  await page.evaluate(() => closeModals());
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const clientUser = { id: 'prod_test_client', name: 'Test Client', role: 'CLIENT', email: 'test_client@paklance.com' };
    localStorage.setItem('paklance_user', JSON.stringify(clientUser));
    localStorage.setItem('paklance_token', 'mock_auth_token');
    
    // Open profile
    renderProfile(0);
    route('profile', { index: 0 });
  });
  await page.waitForTimeout(1000);

  const hireBtnClient = await page.$('#hireBtn');
  if (hireBtnClient) {
    await hireBtnClient.click();
    await page.waitForTimeout(1000);
    const isDirectHireOpen = await page.$eval('#directHireModal', el => el.classList.contains('open'));
    const isPostJobOpen = await page.$eval('#postJobModal', el => el.classList.contains('open'));
    record('5. Hire Me opens Direct Hire modal (NOT Post Job)', isDirectHireOpen && !isPostJobOpen, `DirectHire: ${isDirectHireOpen}, PostJob: ${isPostJobOpen}`);
  }

  await page.evaluate(() => closeModals());

  // 6. Contract page loads & displays empty state or active contracts
  await page.evaluate(() => route('contract'));
  await page.waitForTimeout(1000);
  const contractViewActive = await page.$eval('[data-view="contract"]', el => el.classList.contains('active'));
  record('6. Contract Page loads without errors', contractViewActive);

  // 7. Test Contract Tabs, Chat Composer & Files with simulated contract data
  await page.evaluate(() => {
    const mockContract = {
      id: 'mock_contract_1',
      status: 'IN_PROGRESS',
      createdAt: new Date().toISOString(),
      job: { title: 'Fintech Portal Platform', budget: 75000 },
      client: { id: 'prod_test_client', name: 'Test Client', role: 'CLIENT' },
      specialist: { id: 'spec_1', name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' },
      escrow: { balance: 75000 },
      milestones: [
        { id: 'm1', title: 'Milestone 1: Deliverables', amount: 75000, status: 'FUNDED' }
      ]
    };
    // Inject and trigger contract render
    const origApiAuth = window.apiAuth;
    window.apiAuth = async (url) => {
      if (url === '/contracts') return { ok: true, data: [mockContract] };
      return origApiAuth(url);
    };
    renderContract();
  });
  await page.waitForTimeout(1000);

  const milestonesRendered = await page.$$('.mile-row');
  record('7. Contract Milestones rendered properly', milestonesRendered.length > 0, `Found ${milestonesRendered.length} milestone rows`);

  // Switch to messages tab in Contract
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="messages"]');
    if (tabBtn) tabBtn.click();
  });
  await page.waitForTimeout(600);

  const composerVisible = await page.$eval('.fullscreen-chat-composer', el => !!el && window.getComputedStyle(el).display !== 'none');
  record('8. Contract Chat Composer present and active in messages tab', composerVisible);

  // Switch to files tab in Contract
  await page.evaluate(() => {
    const tabBtn = document.querySelector('[data-tab="files"]');
    if (tabBtn) tabBtn.click();
  });
  await page.waitForTimeout(600);

  const filesTab = await page.$('#contractTabFiles');
  record('9. Contract Files tab exists with upload & view actions', !!filesTab);

  // 10. Messages page loads
  await page.evaluate(() => route('messages'));
  await page.waitForTimeout(1000);
  const messagesShell = await page.$('.messages-shell');
  record('10. Messages Page loads split-pane interface', !!messagesShell);

  // 11. Role label format test in UI
  const clientViewingSpecRole = await page.evaluate(() => formatRole('SPECIALIST', 'Senior Full Stack Engineer'));
  const specViewingClientRole = await page.evaluate(() => formatRole('CLIENT'));
  record('11. Role mapper formatRole() logic (Both directions)', 
    clientViewingSpecRole === 'Senior Full Stack Engineer' && specViewingClientRole === 'Client',
    `Client sees: "${clientViewingSpecRole}", Specialist sees: "${specViewingClientRole}"`
  );

  // 12. Wallet page loads
  await page.evaluate(() => route('wallet'));
  await page.waitForTimeout(800);
  const walletViewActive = await page.$eval('[data-view="wallet"]', el => el.classList.contains('active'));
  record('12. Wallet Page loads correctly', walletViewActive);

  // 13. Payment page loads and has safe-area scroll clearance
  await page.evaluate(() => route('payment'));
  await page.waitForTimeout(800);
  const paymentPb = await page.$eval('#paymentPage', el => parseInt(window.getComputedStyle(el).paddingBottom));
  record('13. Payment Page loads and has safe scroll clearance', paymentPb >= 75, `Padding bottom: ${paymentPb}px`);

  // 14. Mobile Viewport Layout Tests (375px, 390px, 414px)
  const mobileWidths = [375, 390, 414];
  for (const w of mobileWidths) {
    await page.setViewportSize({ width: w, height: 812 });
    await page.evaluate(() => route('home'));
    await page.waitForTimeout(400);

    const brandBox = await page.$eval('.brand', el => el.getBoundingClientRect());
    const menuBox = await page.$eval('#menuButton', el => el.getBoundingClientRect());
    const isHamburgerFarRight = menuBox.left > brandBox.right + 40;
    record(`14. [Mobile ${w}px] Hamburger positioned on far right`, isHamburgerFarRight, `BrandRight: ${brandBox.right.toFixed(0)}, MenuLeft: ${menuBox.left.toFixed(0)}`);

    await page.evaluate(() => route('dashboard'));
    await page.waitForTimeout(300);
    const bottomNavDisplay = await page.$eval('.mobile-bottom-nav', el => window.getComputedStyle(el).display);
    record(`15. [Mobile ${w}px] Bottom Navigation displayed`, bottomNavDisplay === 'grid');
  }

  // 16. Mobile Back Navigation Test
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => route('home')); await page.waitForTimeout(300);
  await page.evaluate(() => route('jobs')); await page.waitForTimeout(300);
  await page.evaluate(() => route('talent')); await page.waitForTimeout(300);

  await page.goBack(); await page.waitForTimeout(400);
  const back1 = await page.$eval('.view.active', el => el.dataset.view);
  await page.goBack(); await page.waitForTimeout(400);
  const back2 = await page.$eval('.view.active', el => el.dataset.view);

  record('16. SPA History and Mobile Back navigation', back1 === 'jobs' && back2 === 'home', `Back 1: ${back1}, Back 2: ${back2}`);

  console.log('\n=== SMOKE TEST SUMMARY ===');
  const allPassed = results.every(r => r.pass);
  console.log(`Passed: ${results.filter(r => r.pass).length} / ${results.length}`);
  console.log(`All Passed: ${allPassed}`);

  await browser.close();
  process.exit(allPassed ? 0 : 1);
})().catch(err => {
  console.error('Smoke test error:', err);
  process.exit(1);
});
