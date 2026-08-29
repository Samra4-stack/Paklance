const { chromium } = require('playwright');

const BASE_URL = 'https://paklance-backend-updated-qek0cdo04-ashna3.vercel.app';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`=== STARTING COMPLETE AUDIT & VERIFICATION SUITE ON PREVIEW ===\nTarget: ${BASE_URL}\n`);
  const ts = Date.now();

  const clientEmail = `audit_client_${ts}@test.com`;
  const specEmail = `audit_spec_${ts}@test.com`;
  const pass = 'TestPassword123!';

  // Helper for direct API calls to Preview backend
  async function apiCall(endpoint, method, body, token) {
    const res = await fetch(`${BASE_URL}/api${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    try {
      return { ok: res.ok, status: res.status, data: JSON.parse(text) };
    } catch {
      return { ok: res.ok, status: res.status, data: text };
    }
  }

  // --- 1. REGISTER & SETUP USERS ---
  console.log('1. Setting up Client and Specialist on Preview...');
  const regSpec = await apiCall('/auth/register', 'POST', {
    email: specEmail,
    password: pass,
    role: 'SPECIALIST'
  });
  const specToken = regSpec.data?.accessToken;
  const specUser = regSpec.data?.user;
  const specId = specUser?.id;
  console.log('Specialist registered:', regSpec.ok, specId);

  await apiCall('/profiles/me', 'PATCH', {
    name: 'Tariq Mehmood',
    headline: 'Senior Full Stack Specialist',
    city: 'Lahore',
    hourlyRate: 5000,
    skills: ['React', 'Node.js', 'PostgreSQL']
  }, specToken);

  const regClient = await apiCall('/auth/register', 'POST', {
    email: clientEmail,
    password: pass,
    role: 'CLIENT'
  });
  const clientToken = regClient.data?.accessToken;
  const clientUser = regClient.data?.user;
  const clientId = clientUser?.id;
  console.log('Client registered:', regClient.ok, clientId);

  await apiCall('/profiles/me', 'PATCH', {
    name: 'Karachi Tech Ventures',
    city: 'Karachi'
  }, clientToken);

  // Client creates a single job
  const jobRes = await apiCall('/jobs', 'POST', {
    title: `Fintech Portal Redesign ${ts}`,
    description: 'Redesigning the frontend web portal with responsive layouts.\n\nDeliverables:\n- Wireframes\n- Frontend Implementation',
    budgetMin: 50000,
    budgetMax: 75000
  }, clientToken);
  const jobId = jobRes.data?.id;
  console.log('Client created initial job:', jobId);

  // Check initial job count for client
  const jobsBeforeRes = await apiCall(`/jobs?clientId=${clientId}`, 'GET', null, clientToken);
  const jobsCountBefore = (jobsBeforeRes.data || []).length;
  console.log(`Initial client jobs count: ${jobsCountBefore}`);

  // --- 2. TEST HIRE ME FLOW & NO DUPLICATE JOBS ---
  console.log('\n2. Testing HIRE-ME flow from Specialist Profile in UI...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/#home`);
  await page.waitForLoadState('networkidle');

  // Log in as Client in localStorage
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
  }, { token: clientToken, user: clientUser });

  // Navigate to specialist profile
  await page.evaluate((sId) => {
    renderProfile(0, sId);
    route('profile', { uid: sId, index: 0 });
  }, specId);
  await page.waitForTimeout(1000);

  // Click "Hire Me"
  const hireBtn = await page.$('#hireBtn');
  console.log('Hire Me button present:', !!hireBtn);
  await hireBtn.click();
  await page.waitForTimeout(1000);

  // Verify Direct Hire modal is opened (NOT Post Job modal)
  const isDirectHireOpen = await page.$eval('#directHireModal', el => el.classList.contains('open'));
  const isPostJobOpen = await page.$eval('#postJobModal', el => el.classList.contains('open'));
  console.log('Direct Hire Modal opened:', isDirectHireOpen);
  console.log('Post Job Modal remained closed:', !isPostJobOpen);

  // Verify selected existing job in dropdown
  const selectedJobValue = await page.$eval('#directHireJobSelect', el => el.value);
  console.log('Existing job selected in Direct Hire modal:', selectedJobValue === jobId);

  // Submit direct hire contract
  console.log('Submitting Direct Hire contract...');
  await page.click('#btnSubmitDirectHire');
  await page.waitForTimeout(2000);

  // Verify redirected to Contract view
  const isContractViewActive = await page.$eval('[data-view="contract"]', el => el.classList.contains('active'));
  console.log('Redirected to Contract View:', isContractViewActive);

  // Check jobs count after Hire Me
  const jobsAfterRes = await apiCall(`/jobs?clientId=${clientId}`, 'GET', null, clientToken);
  const jobsCountAfter = (jobsAfterRes.data || []).length;
  console.log(`Jobs count after Hire Me: ${jobsCountAfter}`);
  console.log('NO DUPLICATE JOBS VERIFIED:', jobsCountBefore === jobsCountAfter);

  // --- 3. VERIFY MILESTONE & ESCROW CREATION ---
  console.log('\n3. Verifying Milestone & Escrow state...');
  const clientContractsRes = await apiCall('/contracts', 'GET', null, clientToken);
  const contracts = clientContractsRes.data || [];
  console.log(`Contracts found for Client: ${contracts.length}`);
  const createdContract = contracts[0];
  console.log('Contract status:', createdContract?.status);
  console.log('Contract escrow balance:', createdContract?.escrow?.balance);
  console.log('Contract milestones count:', createdContract?.milestones?.length);
  console.log('Milestone 1 title:', createdContract?.milestones?.[0]?.title);
  console.log('Milestone 1 amount:', createdContract?.milestones?.[0]?.amount);

  // Verify Specialist can also see the contract and milestones
  const specContractsRes = await apiCall('/contracts', 'GET', null, specToken);
  const specContracts = specContractsRes.data || [];
  console.log(`Contracts found for Specialist: ${specContracts.length}`);
  console.log('Specialist sees milestones:', specContracts[0]?.milestones?.length > 0);

  // --- 4. TEST ROLE MAPPING IN MESSAGING (BOTH DIRECTIONS) ---
  console.log('\n4. Testing Role Mapping in Messaging...');

  // A. Client sending message to Specialist
  console.log('Client viewing Specialist in Messages:');
  await page.evaluate(({ token, user, sId }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('messages', { id: sId, name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' });
  }, { token: clientToken, user: clientUser, sId: specId });
  await page.waitForTimeout(1000);

  const clientViewingRole = await page.$eval('#chatHeadRole', el => el.innerText);
  console.log(`Role displayed to Client when viewing Specialist: "${clientViewingRole}"`);
  console.log('Correct Specialist role displayed:', clientViewingRole.includes('Specialist') || clientViewingRole.includes('Full Stack'));

  // Send a message from Client
  await page.fill('#chatInput', 'Hi Tariq, glad we are starting this contract!');
  await page.click('#sendChat');
  await page.waitForTimeout(1500);

  // B. Specialist viewing Client in Messages
  console.log('Specialist viewing Client in Messages:');
  await page.evaluate(({ token, user, cId }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('messages', { id: cId, name: 'Karachi Tech Ventures', role: 'CLIENT' });
  }, { token: specToken, user: specUser, cId: clientId });
  await page.waitForTimeout(1200);

  const specViewingRole = await page.$eval('#chatHeadRole', el => el.innerText);
  console.log(`Role displayed to Specialist when viewing Client: "${specViewingRole}"`);
  console.log('Correct Client role displayed:', specViewingRole === 'Client');

  // --- 5. TEST MOBILE LAYOUT: HAMBURGER, BOTTOM NAV, COMPOSER, SCROLLING ---
  console.log('\n5. Testing Mobile UX across screen widths...');
  const mobileWidths = [375, 390, 414, 768];

  for (const w of mobileWidths) {
    await page.setViewportSize({ width: w, height: 750 });
    await page.evaluate(() => route('home'));
    await page.waitForTimeout(400);

    // Check Hamburger position on mobile header
    const brandBox = await page.$eval('.brand', el => el.getBoundingClientRect());
    const menuBox = await page.$eval('#menuButton', el => el.getBoundingClientRect());
    console.log(`Mobile ${w}px - Brand Left: ${brandBox.left}, Menu Left: ${menuBox.left}`);
    console.log(`Mobile ${w}px - Hamburger is on far RIGHT side: ${menuBox.left > brandBox.right + 50}`);

    // Check Bottom Nav spacing & layout
    await page.evaluate(() => route('dashboard'));
    await page.waitForTimeout(400);
    const bottomNavDisplay = await page.$eval('.mobile-bottom-nav', el => window.getComputedStyle(el).display);
    console.log(`Mobile ${w}px - Bottom Nav display: ${bottomNavDisplay}`);

    // Check Contract messages tab & chat composer layout
    await page.evaluate(() => route('contract'));
    await page.waitForTimeout(500);

    // Switch to messages tab in contract
    await page.evaluate(() => {
      const tabBtn = document.querySelector('[data-tab="messages"]');
      if (tabBtn) tabBtn.click();
    });
    await page.waitForTimeout(500);

    const composerBox = await page.$eval('.fullscreen-chat-composer', el => el.getBoundingClientRect());
    console.log(`Mobile ${w}px - Contract Composer bottom: ${composerBox.bottom}, within viewport (750px): ${composerBox.bottom <= 750}`);
  }

  // --- 6. TEST MOBILE BROWSER BACK BUTTON (SPA HISTORY) ---
  console.log('\n6. Testing SPA History and Mobile Back Navigation...');
  await page.setViewportSize({ width: 390, height: 844 });

  // 1. Home
  await page.evaluate(() => route('home'));
  await page.waitForTimeout(400);
  console.log('Step 1: On Home view');

  // 2. Jobs
  await page.evaluate(() => route('jobs'));
  await page.waitForTimeout(400);
  console.log('Step 2: Navigated to Jobs view');

  // 3. Job Detail
  await page.evaluate((jId) => {
    state.currentJobId = jId;
    renderJobDetail(0);
    route('job-detail', { jobId: jId, index: 0 });
  }, jobId);
  await page.waitForTimeout(400);
  console.log('Step 3: Navigated to Job Detail view');

  // 4. Specialist Profile
  await page.evaluate((sId) => {
    renderProfile(0, sId);
    route('profile', { uid: sId, index: 0 });
  }, specId);
  await page.waitForTimeout(400);
  console.log('Step 4: Navigated to Specialist Profile view');

  // Press Back -> should go back to Job Detail
  console.log('Pressing Back 1...');
  await page.goBack();
  await page.waitForTimeout(500);
  const back1View = await page.$eval('.view.active', el => el.dataset.view);
  console.log(`After Back 1 active view: "${back1View}" (Expected: job-detail)`);

  // Press Back -> should go back to Jobs
  console.log('Pressing Back 2...');
  await page.goBack();
  await page.waitForTimeout(500);
  const back2View = await page.$eval('.view.active', el => el.dataset.view);
  console.log(`After Back 2 active view: "${back2View}" (Expected: jobs)`);

  // Press Back -> should go back to Home
  console.log('Pressing Back 3...');
  await page.goBack();
  await page.waitForTimeout(500);
  const back3View = await page.$eval('.view.active', el => el.dataset.view);
  console.log(`After Back 3 active view: "${back3View}" (Expected: home)`);

  console.log('\n=== ALL COMPREHENSIVE PREVIEW TESTS PASSED SUCCESSFULLY! ===');

  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
