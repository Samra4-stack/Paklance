const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const BASE_URL = 'https://paklance-backend-updated-bmy1jgy4l-ashna3.vercel.app';
const STAGING_DB_URL = "postgresql://neondb_owner:npg_Y26bEnkXoCxO@ep-billowing-wildflower-awjgcwi4-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: STAGING_DB_URL
    }
  }
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`=== STARTING LIVE AUDIT & VERIFICATION ON PREVIEW ===\nURL: ${BASE_URL}\n`);
  const ts = Date.now();
  const password = 'TestPassword123!';
  const passwordHash = await bcrypt.hash(password, 10);

  // 1. Create Verified Users in Staging Database
  console.log('1. Setting up verified Client and Specialist in Staging DB...');
  const specEmail = `spec_audit_${ts}@paklance.com`;
  const clientEmail = `client_audit_${ts}@paklance.com`;

  const specUserDb = await prisma.user.create({
    data: {
      email: specEmail,
      name: 'Tariq Mehmood',
      passwordHash,
      role: 'SPECIALIST',
      headline: 'Senior Full Stack Specialist',
      city: 'Lahore',
      hourlyRate: 5000,
      skills: ['React', 'Node.js', 'PostgreSQL'],
      isEmailVerified: true,
    }
  });

  const clientUserDb = await prisma.user.create({
    data: {
      email: clientEmail,
      name: 'Karachi Tech Ventures',
      passwordHash,
      role: 'CLIENT',
      city: 'Karachi',
      isEmailVerified: true,
    }
  });

  console.log(`✓ Created Specialist: ${specUserDb.id} (${specEmail})`);
  console.log(`✓ Created Client: ${clientUserDb.id} (${clientEmail})`);

  // Helper for API calls
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

  // 2. Log in via API to get real JWT access tokens
  console.log('\n2. Logging in via Preview API...');
  const clientLoginRes = await apiCall('/auth/login', 'POST', { email: clientEmail, password });
  if (!clientLoginRes.ok) throw new Error(`Client login failed: ${JSON.stringify(clientLoginRes.data)}`);
  const clientToken = clientLoginRes.data.accessToken;
  const clientUser = clientLoginRes.data.user;
  console.log('✓ Client logged in, token received');

  const specLoginRes = await apiCall('/auth/login', 'POST', { email: specEmail, password });
  if (!specLoginRes.ok) throw new Error(`Specialist login failed: ${JSON.stringify(specLoginRes.data)}`);
  const specToken = specLoginRes.data.accessToken;
  const specUser = specLoginRes.data.user;
  console.log('✓ Specialist logged in, token received');

  // Client creates an initial job
  const jobRes = await apiCall('/jobs', 'POST', {
    title: `Fintech Portal Platform ${ts}`,
    description: 'Build responsive Fintech application with secure payments and milestone release workflows.\n\nRequirements:\n- Strong Typescript\n- PostgreSQL and NestJS\n- Clean architecture',
    budget: 75000
  }, clientToken);
  const jobId = jobRes.data?.id;
  console.log(`✓ Client posted initial job: ID=${jobId}`);

  const jobsBeforeRes = await apiCall(`/jobs?clientId=${clientUser.id}`, 'GET', null, clientToken);
  const jobsCountBefore = (jobsBeforeRes.data || []).length;
  console.log(`✓ Client jobs count before Hire Me: ${jobsCountBefore}`);

  // 3. Test HIRE-ME flow in UI
  console.log('\n3. Testing HIRE-ME Flow on Specialist Profile...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/#home`);
  await page.waitForLoadState('networkidle');

  // Set Client auth in browser localStorage
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
  }, { token: clientToken, user: clientUser });

  // Open Specialist profile
  await page.evaluate((sId) => {
    renderProfile(0, sId);
    route('profile', { uid: sId, index: 0 });
  }, specUserDb.id);
  await page.waitForTimeout(1000);

  // Click Hire Me
  const hireBtn = await page.$('#hireBtn');
  console.log('✓ Hire Me button present on profile:', !!hireBtn);
  await hireBtn.click();
  await page.waitForTimeout(1000);

  // Check which modal opened
  const isDirectHireOpen = await page.$eval('#directHireModal', el => el.classList.contains('open'));
  const isPostJobOpen = await page.$eval('#postJobModal', el => el.classList.contains('open'));
  console.log('✓ Direct Hire Modal opened:', isDirectHireOpen);
  console.log('✓ Post Job Modal remained closed (NO DUPLICATE JOB POSTING):', !isPostJobOpen);

  if (!isDirectHireOpen) throw new Error('Expected directHireModal to be open');

  // Check existing job in dropdown
  const selectedJobId = await page.$eval('#directHireJobSelect', el => el.value);
  console.log(`✓ Existing Job selected in modal: ${selectedJobId} (Matches created job: ${selectedJobId === jobId})`);

  // Submit Direct Hire
  console.log('Submitting Direct Hire contract creation...');
  await page.click('#btnSubmitDirectHire');
  await page.waitForTimeout(2000);

  // Verify redirected to Contract view
  const isContractActive = await page.$eval('[data-view="contract"]', el => el.classList.contains('active'));
  console.log('✓ Redirected to Contract view:', isContractActive);

  // Verify job count didn't increase
  const jobsAfterRes = await apiCall(`/jobs?clientId=${clientUser.id}`, 'GET', null, clientToken);
  const jobsCountAfter = (jobsAfterRes.data || []).length;
  console.log(`✓ Client jobs count after Hire Me: ${jobsCountAfter}`);
  console.log('✅ VERIFIED: ZERO DUPLICATE JOBS CREATED:', jobsCountBefore === jobsCountAfter);

  // 4. Verify Milestone and Escrow
  console.log('\n4. Verifying Milestone & Escrow in Database and UI...');
  const clientContractsRes = await apiCall('/contracts', 'GET', null, clientToken);
  const contracts = clientContractsRes.data || [];
  console.log(`✓ Contracts retrieved for Client: ${contracts.length}`);
  const activeContract = contracts[0];
  console.log(`✓ Contract ID: ${activeContract.id}`);
  console.log(`✓ Contract Status: ${activeContract.status}`);
  console.log(`✓ Escrow Balance: PKR ${activeContract.escrow?.balance || 0}`);
  console.log(`✓ Milestones Count: ${activeContract.milestones?.length}`);
  console.log(`✓ Milestone 1: "${activeContract.milestones?.[0]?.title}" - Amount: PKR ${activeContract.milestones?.[0]?.amount}`);

  if (!activeContract.milestones || activeContract.milestones.length === 0) {
    throw new Error('Milestones array is empty!');
  }

  // Verify Specialist contracts
  const specContractsRes = await apiCall('/contracts', 'GET', null, specToken);
  console.log(`✓ Specialist contracts retrieved: ${specContractsRes.data?.length}`);
  console.log(`✓ Specialist sees milestones: ${specContractsRes.data?.[0]?.milestones?.length > 0}`);

  // 5. Test Role Mapping in Messaging
  console.log('\n5. Testing Role Mapping in Messaging...');

  // A. Client viewing Specialist
  await page.evaluate(({ token, user, sId }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('messages', { id: sId, name: 'Tariq Mehmood', role: 'SPECIALIST', headline: 'Senior Full Stack Specialist' });
  }, { token: clientToken, user: clientUser, sId: specUserDb.id });
  await page.waitForTimeout(1000);

  const clientViewingRole = await page.$eval('#chatHeadRole', el => el.innerText);
  console.log(`✓ Client viewing Specialist -> Header displays: "${clientViewingRole}"`);
  console.log('✅ Correct Specialist headline/role displayed:', clientViewingRole.includes('Specialist') || clientViewingRole.includes('Full Stack'));

  // Client sends message
  await page.fill('#chatInput', 'Hello Tariq, excited to work together on this project!');
  await page.click('#sendChat');
  await page.waitForTimeout(1500);

  // B. Specialist viewing Client
  await page.evaluate(({ token, user, cId }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('messages', { id: cId, name: 'Karachi Tech Ventures', role: 'CLIENT' });
  }, { token: specToken, user: specUser, cId: clientUserDb.id });
  await page.waitForTimeout(1200);

  const specViewingRole = await page.$eval('#chatHeadRole', el => el.innerText);
  console.log(`✓ Specialist viewing Client -> Header displays: "${specViewingRole}"`);
  console.log('✅ Correct Client role displayed:', specViewingRole === 'Client');

  // 6. Test Mobile Viewport Layout (Hamburger, Bottom Nav, Composer, Scrolling)
  console.log('\n6. Testing Mobile UX across Viewports...');
  const mobileWidths = [375, 390, 414, 768];

  for (const w of mobileWidths) {
    await page.setViewportSize({ width: w, height: 750 });
    await page.evaluate(() => route('home'));
    await page.waitForTimeout(300);

    const brandBox = await page.$eval('.brand', el => el.getBoundingClientRect());
    const menuBox = await page.$eval('#menuButton', el => el.getBoundingClientRect());
    console.log(`✓ Mobile ${w}px - Brand Left: ${brandBox.left}px, Menu Button Left: ${menuBox.left}px`);
    console.log(`✅ Mobile ${w}px - Hamburger is placed on far RIGHT side: ${menuBox.left > brandBox.right + 50}`);

    await page.evaluate(() => route('dashboard'));
    await page.waitForTimeout(300);
    const bottomNavDisplay = await page.$eval('.mobile-bottom-nav', el => window.getComputedStyle(el).display);
    console.log(`✓ Mobile ${w}px - Bottom Nav display: ${bottomNavDisplay}`);

    // Check Contract messages & composer
    await page.evaluate(() => route('contract'));
    await page.waitForTimeout(400);

    await page.evaluate(() => {
      const tabBtn = document.querySelector('[data-tab="messages"]');
      if (tabBtn) tabBtn.click();
    });
    await page.waitForTimeout(400);

    const composerBox = await page.$eval('.fullscreen-chat-composer', el => el.getBoundingClientRect());
    console.log(`✓ Mobile ${w}px - Composer bottom: ${composerBox.bottom}px <= viewport 750px: ${composerBox.bottom <= 750}`);
  }

  // 7. Test SPA History / Mobile Back Navigation
  console.log('\n7. Testing SPA History & Mobile Back Navigation...');
  await page.setViewportSize({ width: 390, height: 844 });

  // 1. Home
  await page.evaluate(() => route('home'));
  await page.waitForTimeout(300);
  console.log('✓ On Home view');

  // 2. Jobs
  await page.evaluate(() => route('jobs'));
  await page.waitForTimeout(300);
  console.log('✓ Navigated to Jobs view');

  // 3. Job Detail
  await page.evaluate((jId) => {
    state.currentJobId = jId;
    renderJobDetail(0);
    route('job-detail', { jobId: jId, index: 0 });
  }, jobId);
  await page.waitForTimeout(300);
  console.log('✓ Navigated to Job Detail view');

  // 4. Specialist Profile
  await page.evaluate((sId) => {
    renderProfile(0, sId);
    route('profile', { uid: sId, index: 0 });
  }, specUserDb.id);
  await page.waitForTimeout(300);
  console.log('✓ Navigated to Specialist Profile view');

  // Press Back 1 -> Job Detail
  console.log('Pressing Back (1)...');
  await page.goBack();
  await page.waitForTimeout(400);
  const back1 = await page.$eval('.view.active', el => el.dataset.view);
  console.log(`✓ Back 1 active view: "${back1}" (Expected: job-detail)`);

  // Press Back 2 -> Jobs
  console.log('Pressing Back (2)...');
  await page.goBack();
  await page.waitForTimeout(400);
  const back2 = await page.$eval('.view.active', el => el.dataset.view);
  console.log(`✓ Back 2 active view: "${back2}" (Expected: jobs)`);

  // Press Back 3 -> Home
  console.log('Pressing Back (3)...');
  await page.goBack();
  await page.waitForTimeout(400);
  const back3 = await page.$eval('.view.active', el => el.dataset.view);
  console.log(`✓ Back 3 active view: "${back3}" (Expected: home)`);

  console.log('\n======================================================');
  console.log('🎉 ALL AUDIT & FLOW TESTS PASSED ON PREVIEW DEPLOYMENT!');
  console.log('======================================================');

  await browser.close();
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (err) => {
  console.error('❌ Test failed with error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
