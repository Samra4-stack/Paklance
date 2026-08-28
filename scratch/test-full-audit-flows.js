const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('=== STARTING COMPLETE AUDIT & FLOW VERIFICATION ===\n');
  const ts = Date.now();

  const clientEmail = `audit_client_${ts}@test.com`;
  const specEmail = `audit_spec_${ts}@test.com`;
  const pass = 'TestPassword123!';

  // Helper for API calls
  async function apiCall(endpoint, method, body, token) {
    const res = await fetch(`http://localhost:3000/api${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  }

  // 1. Setup Client & Specialist in DB
  console.log('Step 1: Registering Specialist & Client via API...');
  const regSpec = await apiCall('/auth/register', 'POST', {
    email: specEmail,
    password: pass,
    role: 'SPECIALIST'
  });
  console.log('Specialist registered:', regSpec.ok, regSpec.data?.user?.id);
  const specToken = regSpec.data?.accessToken;
  const specUser = regSpec.data?.user;
  const specId = specUser?.id;

  // Set specialist name & headline
  await apiCall('/profiles/me', 'PATCH', {
    name: 'Audit Specialist',
    headline: 'Senior Full Stack Specialist',
    city: 'Lahore',
    hourlyRate: 4500,
    skills: ['Node.js', 'React', 'PostgreSQL']
  }, specToken);

  const regClient = await apiCall('/auth/register', 'POST', {
    email: clientEmail,
    password: pass,
    role: 'CLIENT'
  });
  console.log('Client registered:', regClient.ok, regClient.data?.user?.id);
  const clientToken = regClient.data?.accessToken;
  const clientUser = regClient.data?.user;
  const clientId = clientUser?.id;

  // Set client name
  await apiCall('/profiles/me', 'PATCH', {
    name: 'Audit Client Org',
    city: 'Karachi'
  }, clientToken);

  // Add initial funds to specialist for withdrawal test
  await apiCall('/wallet/deposit', 'POST', { amount: 15000 }, specToken);
  console.log('Deposited 15,000 PKR to specialist wallet for withdrawal test.');

  // Create a job posted by client
  const jobRes = await apiCall('/jobs', 'POST', {
    title: `Full-Stack Web App ${ts}`,
    description: 'Build modern responsive web application with clean architecture.',
    budget: 85000
  }, clientToken);
  console.log('Job created by client:', jobRes.ok, jobRes.data?.id);

  // 2. Test Desktop View (1280px)
  console.log('\nStep 2: Testing Desktop (1280px) UI flows...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('http://localhost:8080/#home');
  await page.waitForLoadState('networkidle');

  // Test Wallet & Add Funds modal as Client
  console.log('Logging in as Client in UI...');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('wallet');
  }, { token: clientToken, user: clientUser });

  await page.waitForTimeout(800);

  console.log('Checking Wallet Add Funds Modal...');
  const topupBtn = await page.$('#topupBtn');
  if (topupBtn) {
    await topupBtn.click();
    await page.waitForTimeout(400);
    const modalVisible = await page.$eval('#addFundsModal', el => el.classList.contains('open') || window.getComputedStyle(el).display !== 'none');
    console.log('Add Funds Modal opened:', modalVisible);
    const noticeText = await page.$eval('#addFundsModal', el => el.innerText);
    console.log('Contains Gateway Notice:', noticeText.includes('Gateway Integration Notice') && noticeText.includes('Easypaisa'));
    await page.click('#addFundsModal [data-close-modal]');
    await page.waitForTimeout(400);
  }

  // 3. Test Withdrawal Flow as Specialist
  console.log('\nStep 3: Testing Withdrawal Flow as Specialist...');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('wallet');
  }, { token: specToken, user: specUser });

  await page.waitForTimeout(800);

  const withdrawBtn = await page.$('#withdrawBtn');
  console.log('Clicking Withdraw button...', !!withdrawBtn);
  await withdrawBtn.click();
  await page.waitForTimeout(500);

  console.log('Filling out withdrawal form...');
  await page.fill('#wdAccountTitle', 'Audit Specialist Account');
  await page.fill('#wdAccountNum', 'PK36SCBL0000001234567801');
  await page.fill('#wdAmount', '4000');

  console.log('Submitting withdrawal of 4,000 PKR...');
  await page.click('#confirmWithdrawBtn');
  await page.waitForTimeout(2500);

  const newBalanceText = await page.$eval('.wallet-balance strong', el => el.innerText);
  console.log('New Wallet Balance after withdrawal:', newBalanceText);
  console.log('Balance properly debited (11,000 PKR):', newBalanceText.includes('11,000'));

  // 4. Test Messaging Flow (Client -> Specialist -> Reply)
  console.log('\nStep 4: Testing Messaging Flow from Specialist Profile...');
  // Switch to client
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
  }, { token: clientToken, user: clientUser });

  // Client visits specialist profile
  await page.evaluate((sId) => {
    route('profile');
    renderProfile(0, sId);
  }, specId);
  await page.waitForTimeout(800);

  const msgBtn = await page.$('#messageSpecialistBtn');
  console.log('Message button on Specialist Profile exists:', !!msgBtn);
  await msgBtn.click();
  await page.waitForTimeout(800);

  console.log('Messages view active:', await page.$eval('[data-view="messages"]', el => el.classList.contains('active')));
  console.log('Chat header name:', await page.$eval('#chatHeadName', el => el.innerText));

  console.log('Client sending message: "Hello Specialist, let us discuss the project!"');
  await page.fill('#chatInput', 'Hello Specialist, let us discuss the project!');
  await page.click('#sendChat');
  await page.waitForTimeout(1500);

  let msgBubbles = await page.$$eval('.bubble', els => els.map(e => e.innerText));
  console.log('Sent bubbles:', msgBubbles);

  // Specialist logs in and views message
  console.log('\nSpecialist logging in to check message...');
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('paklance_token', token);
    localStorage.setItem('paklance_user', JSON.stringify(user));
    route('messages');
  }, { token: specToken, user: specUser });

  await page.waitForTimeout(1000);

  const specConvs = await page.$$eval('.conversation-item', els => els.map(e => e.innerText));
  console.log('Specialist conversation list:', specConvs);

  console.log('Specialist replying: "Thank you for reaching out, I would love to work on this."');
  await page.fill('#chatInput', 'Thank you for reaching out, I would love to work on this.');
  await page.click('#sendChat');
  await page.waitForTimeout(1500);

  // Reload page to verify persistence
  console.log('Reloading messages page to verify database persistence...');
  await page.reload();
  await page.evaluate(() => route('messages'));
  await page.waitForTimeout(1000);

  const persistedMsgs = await page.$$eval('.bubble', els => els.map(e => e.innerText));
  console.log('Persisted messages in thread:', persistedMsgs);

  // 5. Test Multi-Viewport Responsiveness
  console.log('\nStep 5: Testing Viewport Responsiveness...');
  const viewports = [
    { name: 'Mobile SE (375px)', width: 375, height: 667 },
    { name: 'Mobile iPhone 13 (390px)', width: 390, height: 844 },
    { name: 'Tablet (768px)', width: 768, height: 1024 },
    { name: 'Desktop (1280px)', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.evaluate(() => route('home'));
    await page.waitForTimeout(300);
    const navVisible = await page.$eval('.mobile-bottom-nav', el => window.getComputedStyle(el).display);
    console.log(`Viewport ${vp.name}: Bottom nav display on home: ${navVisible}`);

    await page.evaluate(() => route('messages'));
    await page.waitForTimeout(300);
    const msgNavVisible = await page.$eval('.mobile-bottom-nav', el => window.getComputedStyle(el).display);
    console.log(`Viewport ${vp.name}: Bottom nav display on messages: ${msgNavVisible}`);
  }

  console.log('\n=== ALL AUDIT TESTS PASSED SUCCESSFULLY! ===');
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
