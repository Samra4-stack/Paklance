const PREVIEW_URL = 'https://paklance-backend-updated-ci4d1wh7u-ashna3.vercel.app/api';

async function testLivePreviewUpload() {
  console.log('--- TESTING LIVE PREVIEW FILE UPLOAD ---');
  const stamp = Date.now();
  const email = `upload_tester_${stamp}@test.com`;
  const password = 'Password123!';

  // 1. Register Client
  console.log('Registering client...');
  const regRes = await fetch(`${PREVIEW_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role: 'CLIENT' })
  });
  const regJson = await regRes.json();
  console.log('Register result:', regRes.status, regJson);

  // 2. Login Client
  console.log('Logging in...');
  const loginRes = await fetch(`${PREVIEW_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const loginJson = await loginRes.json();
  console.log('Login result:', loginRes.status);
  const token = loginJson.accessToken;

  // 3. Register & Login Specialist
  const specEmail = `spec_tester_${stamp}@test.com`;
  await fetch(`${PREVIEW_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: specEmail, password, role: 'SPECIALIST' })
  });
  const specLogin = await (await fetch(`${PREVIEW_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: specEmail, password })
  })).json();
  const specToken = specLogin.accessToken;
  const specId = specLogin.user.id;

  // 4. Post Job
  console.log('Posting job...');
  const jobRes = await fetch(`${PREVIEW_URL}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      title: `File Test Job ${stamp}`,
      description: 'Testing live file upload and download.',
      budget: 80000
    })
  });
  const jobJson = await jobRes.json();
  console.log('Job post result:', jobRes.status, jobJson.id);
  const jobId = jobJson.id;

  // 5. Submit Proposal
  console.log('Submitting proposal...');
  const propRes = await fetch(`${PREVIEW_URL}/proposals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${specToken}` },
    body: JSON.stringify({
      jobId,
      bidAmount: 75000,
      deliveryDays: 7,
      coverLetter: 'Ready to work and share project files.'
    })
  });
  const propJson = await propRes.json();
  console.log('Proposal result:', propRes.status, propJson.id);

  // 6. Create / Accept Contract
  console.log('Creating contract...');
  const contractRes = await fetch(`${PREVIEW_URL}/contracts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      jobId,
      specialistId: specId,
      milestones: [{ title: 'Milestone 1', description: 'Deliverable 1', amount: 75000 }]
    })
  });
  const contractJson = await contractRes.json();
  console.log('Contract result:', contractRes.status, contractJson.id);
  const contractId = contractJson.id;

  // 7. Upload File
  console.log(`Uploading file to contract ${contractId}...`);
  const samplePdf = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0xlbmd0aCAxMDUKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCg==';
  
  const uploadRes = await fetch(`${PREVIEW_URL}/contracts/${contractId}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      filename: 'test_document.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      fileData: samplePdf
    })
  });
  const uploadStatus = uploadRes.status;
  const uploadText = await uploadRes.text();
  console.log('Upload HTTP status:', uploadStatus);
  console.log('Upload response body:', uploadText);
}

testLivePreviewUpload().catch(console.error);
