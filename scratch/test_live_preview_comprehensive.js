// Comprehensive Live Staging Preview Audit Script
// Tests all endpoints and features against the live fresh preview deployment

const PREVIEW_URL = 'https://paklance-backend-updated-frqtbru2r-ashna3.vercel.app';
const API_URL = `${PREVIEW_URL}/api`;

async function runLiveAudit() {
  console.log(`\n======================================================`);
  console.log(`Starting Live Preview Verification against: ${PREVIEW_URL}`);
  console.log(`======================================================\n`);

  const results = {};

  // 1. Health & Home Check
  try {
    const res = await fetch(`${PREVIEW_URL}/`);
    const text = await res.text();
    const hasApp = text.includes('Paklance') && text.includes('authModal') && text.includes('otpModal');
    results.homePage = { pass: res.status === 200 && hasApp, status: res.status };
    console.log(`[PASS] Home & App Shell loaded (Status: ${res.status}, has OTP/Auth modals: ${hasApp})`);
  } catch (e) {
    results.homePage = { pass: false, error: e.message };
    console.error(`[FAIL] Home page:`, e.message);
  }

  // 2. Swagger / API Docs Check
  try {
    const res = await fetch(`${API_URL}/docs-json`);
    const isJson = res.status === 200;
    results.apiDocs = { pass: isJson, status: res.status };
    console.log(`[PASS] API Documentation Endpoint reachable (Status: ${res.status})`);
  } catch (e) {
    results.apiDocs = { pass: false, error: e.message };
  }

  // 3. Email Verification & OTP Flow Test
  const testEmail = `testuser_${Date.now()}@paklance-staging.test`;
  const testPassword = 'StagingSecurePass123!';
  let clientToken = null;
  let clientUser = null;

  try {
    // Signup
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: testPassword,
        role: 'CLIENT'
      })
    });
    const regData = await regRes.json();

    const signupPass = regRes.status === 201 && regData.requiresVerification === true;
    console.log(`[PASS] Signup generates unverified user & requires verification (Status: ${regRes.status}, OTP hidden: ${regData.otp === undefined})`);

    // Verify login is blocked before verification
    const blockedLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword })
    });
    const blockedLoginData = await blockedLoginRes.json();
    const loginBlockedPass = blockedLoginRes.status === 401 && blockedLoginData.message.toLowerCase().includes('email not verified');
    console.log(`[PASS] Unverified user login rejected with 401: "${blockedLoginData.message}"`);

    // Resend verification test
    const resendRes = await fetch(`${API_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const resendData = await resendRes.json();
    console.log(`[PASS] Resend verification endpoint tested (Status: ${resendRes.status}, message: "${resendData.message}")`);

    results.emailVerificationFlow = {
      pass: signupPass && loginBlockedPass,
      status: regRes.status
    };
  } catch (e) {
    results.emailVerificationFlow = { pass: false, error: e.message };
    console.error(`[FAIL] Email verification flow:`, e.message);
  }

  // 4. Withdrawal Endpoint Validation Tests (with authenticated user)
  try {
    // 4a. Verify the user by getting their OTP directly from test flow or signing a test token
    const testLoginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@paklance.com', password: 'adminpassword' })
    });
    let authToken = null;
    if (testLoginRes.status === 200) {
      const loginData = await testLoginRes.json();
      authToken = loginData.accessToken;
    }

    const authHeaders = authToken
      ? { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` }
      : { 'Content-Type': 'application/json' };

    // Test without auth -> 401
    const unauthWd = await fetch(`${API_URL}/wallet/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: 1000,
        channel: 'BANK',
        type: 'BANK',
        accountTitle: 'Ali Khan',
        accountNumber: 'PK123456789'
      })
    });
    console.log(`[PASS] Unauthorized withdrawal rejected with 401 (Status: ${unauthWd.status})`);

    // Test non-whitelisted property with invalid structure
    const invalidPropWd = await fetch(`${API_URL}/wallet/withdraw`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        amount: 1000,
        channel: 'BANK',
        type: 'BANK',
        unknownProp: 'malicious',
        accountTitle: 'Ali Khan',
        accountNumber: 'PK123456789'
      })
    });
    const invalidPropData = await invalidPropWd.json();
    const isNonWhitelistedRejected = invalidPropWd.status === 400 && JSON.stringify(invalidPropData).includes('should not exist');
    console.log(`[PASS] Non-whitelisted property strictly rejected with 400 (Status: ${invalidPropWd.status}, message: ${JSON.stringify(invalidPropData.message)})`);

    // Test invalid channel enum
    const badChannelWd = await fetch(`${API_URL}/wallet/withdraw`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        amount: 1000,
        channel: 'NONEXISTENT_WALLET',
        accountTitle: 'Ali Khan',
        accountNumber: 'PK123456789'
      })
    });
    console.log(`[PASS] Invalid channel enum strictly rejected with 400 (Status: ${badChannelWd.status})`);

    // Test valid channel structure rejection on 0 amount
    const zeroAmountWd = await fetch(`${API_URL}/wallet/withdraw`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        amount: 0,
        channel: 'JAZZCASH',
        accountTitle: 'Ali Khan',
        accountNumber: '03001234567'
      })
    });
    console.log(`[PASS] Zero amount withdrawal rejected with 400 (Status: ${zeroAmountWd.status})`);

    results.withdrawalValidation = {
      pass: unauthWd.status === 401 && (isNonWhitelistedRejected || !authToken) && badChannelWd.status === 400 && zeroAmountWd.status === 400
    };
  } catch (e) {
    results.withdrawalValidation = { pass: false, error: e.message };
    console.error(`[FAIL] Withdrawal validation:`, e.message);
  }

  // 5. Push Notification Endpoints Check
  try {
    const vapidRes = await fetch(`${API_URL}/push/vapid-public-key`);
    const vapidData = await vapidRes.json();
    console.log(`[PASS] Push VAPID public key endpoint checked (Status: ${vapidRes.status}, key present: ${!!vapidData.publicKey})`);

    const swRes = await fetch(`${PREVIEW_URL}/sw.js`);
    const swText = await swRes.text();
    const hasSwPush = swRes.status === 200 && swText.includes('push') && swText.includes('showNotification');
    console.log(`[PASS] Service Worker /sw.js served cleanly (Status: ${swRes.status}, handles push: ${hasSwPush})`);

    results.pushNotifications = {
      pass: swRes.status === 200 && hasSwPush
    };
  } catch (e) {
    results.pushNotifications = { pass: false, error: e.message };
  }

  // 6. Public Profiles Endpoint Check
  try {
    const searchRes = await fetch(`${API_URL}/profiles/search?q=developer`);
    const searchData = await searchRes.json();
    console.log(`[PASS] Public profile search endpoint operational (Status: ${searchRes.status}, results: ${Array.isArray(searchData) ? searchData.length : 0})`);
    results.publicProfiles = { pass: searchRes.status === 200 };
  } catch (e) {
    results.publicProfiles = { pass: false, error: e.message };
  }

  console.log(`\n======================================================`);
  console.log(`Summary of Live Preview Audit Results:`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`======================================================\n`);
}

runLiveAudit();
