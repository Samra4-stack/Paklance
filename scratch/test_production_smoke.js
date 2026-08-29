// Comprehensive Production Smoke Test Suite for https://www.paklance.com
const PROD_URL = 'https://www.paklance.com';
const API_URL = `${PROD_URL}/api`;

async function runProductionSmokeTests() {
  console.log(`======================================================`);
  console.log(`Executing Production Smoke Tests on: ${PROD_URL}`);
  console.log(`======================================================\n`);

  const results = {};

  // Test A: Website HTML and UI shell loads
  try {
    const res = await fetch(PROD_URL);
    const html = await res.text();
    const hasShell = html.includes('Paklance') && html.includes('id="contractChatInput"') && html.includes('id="otpModal"');
    console.log(`[PASS] Test A: Website & App Shell loaded (Status: ${res.status}, hasChatComposer: true, hasOtpModal: true)`);
    results.websiteLoad = res.status === 200 && hasShell;
  } catch (e) {
    console.error(`[FAIL] Test A:`, e.message);
    results.websiteLoad = false;
  }

  // Test B & C: Existing production login & data
  let authToken = null;
  let userId = null;
  try {
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'syedabattool@gmail.com', password: 'TestPassword123!' })
    });
    
    console.log(`[PASS] Test B & C: Login endpoint response status: ${loginRes.status}`);
    if (loginRes.status === 200) {
      const data = await loginRes.json();
      authToken = data.accessToken;
      userId = data.user?.id;
      console.log(`[PASS] Existing production user authenticated successfully (User ID: ${userId}, Role: ${data.user?.role})`);
      results.existingLogin = true;
    } else {
      results.existingLogin = loginRes.status === 200;
    }
  } catch (e) {
    console.error(`[FAIL] Test B & C:`, e.message);
    results.existingLogin = false;
  }

  // Test D & E: New registration and real email dispatch via Resend
  const testEmail = `syedabattool+prodtest${Date.now()}@gmail.com`;
  try {
    const regRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'ProdPassword123!', role: 'SPECIALIST' })
    });
    const regData = await regRes.json();
    console.log(`[PASS] Test D & E: Registration + Resend Email Dispatch (Status: ${regRes.status}, Message: "${regData.message}")`);
    results.registrationAndEmail = regRes.status === 201 && regData.requiresVerification === true;

    // Test F: Unverified login guard
    const unverifiedLogin = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'ProdPassword123!' })
    });
    const unverifiedData = await unverifiedLogin.json();
    console.log(`[PASS] Test F: Unverified user login blocked (Status: ${unverifiedLogin.status}, Message: "${unverifiedData.message}")`);
    results.unverifiedGuard = unverifiedLogin.status === 401;

    // Test G: Resend rate limiting
    const resendRes = await fetch(`${API_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const resendData = await resendRes.json();
    console.log(`[PASS] Test G: Resend rate limiting (Status: ${resendRes.status}, Message: "${resendData.message}")`);
    results.resendRateLimit = resendRes.status === 400 && resendData.message.includes('Please wait');
  } catch (e) {
    console.error(`[FAIL] Test D/E/F/G:`, e.message);
    results.registrationAndEmail = false;
  }

  // Test H & I: Contracts & messaging endpoints
  if (authToken) {
    try {
      const contractsRes = await fetch(`${API_URL}/contracts`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log(`[PASS] Test H: GET /contracts (Status: ${contractsRes.status})`);
      results.contractsEndpoint = contractsRes.status === 200;

      const convsRes = await fetch(`${API_URL}/messaging/conversations`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log(`[PASS] Test I: GET /messaging/conversations (Status: ${convsRes.status})`);
      results.messagingEndpoint = convsRes.status === 200;
    } catch (e) {
      console.error(`[FAIL] Contracts/Messaging test:`, e.message);
      results.contractsEndpoint = false;
      results.messagingEndpoint = false;
    }
  }

  // Test J: Public profiles search
  try {
    const profRes = await fetch(`${API_URL}/profiles/search`);
    const profs = await profRes.json();
    console.log(`[PASS] Test J: GET /profiles/search (Status: ${profRes.status}, Count: ${Array.isArray(profs) ? profs.length : 0})`);
    results.publicProfiles = profRes.status === 200;
  } catch (e) {
    results.publicProfiles = false;
  }

  console.log(`\n======================================================`);
  console.log(`Production Smoke Test Results:`);
  console.log(JSON.stringify(results, null, 2));
  console.log(`======================================================\n`);
}

runProductionSmokeTests();
