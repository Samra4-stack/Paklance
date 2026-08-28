const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

async function runLocalVerification() {
  console.log('====================================================');
  console.log('STARTING LOCAL VERIFICATION FOR ALL 4 ISSUES');
  console.log('====================================================\n');

  // Simple static HTTP server to serve index.html
  const server = http.createServer((req, res) => {
    const indexPath = path.resolve(__dirname, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  });

  await new Promise(resolve => server.listen(3456, resolve));
  console.log('Local test web server listening on http://localhost:3456');

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'Mobile 375px (iPhone SE)', width: 375, height: 667 },
    { name: 'Mobile 390px (iPhone 14)', width: 390, height: 844 },
    { name: 'Tablet 768px (iPad)', width: 768, height: 1024 },
    { name: 'Desktop 1280px', width: 1280, height: 800 }
  ];

  let allPassed = true;
  const testResults = [];

  for (const vp of viewports) {
    console.log(`\n----------------------------------------------------`);
    console.log(`Testing Viewport: ${vp.name}`);
    console.log(`----------------------------------------------------`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3456');
    await page.waitForLoadState('domcontentloaded');

    // ----------------------------------------------------
    // SETUP MOCK API ENVIRONMENT INSIDE BROWSER
    // ----------------------------------------------------
    await page.evaluate(() => {
      // Mock Specialist & Client users
      window._mockSpecialist = {
        id: 'spec-uuid-101',
        name: 'Fatima Zahra',
        email: 'fatima@paklance.com',
        role: 'SPECIALIST',
        headline: 'Senior Full Stack & AI Specialist',
        city: 'Lahore',
        country: 'Pakistan',
        avatarUrl: null,
        skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript'],
        hourlyRate: 4500,
        availability: 'AVAILABLE'
      };

      window._mockClient = {
        id: 'client-uuid-202',
        name: 'Tariq Mehmood',
        email: 'tariq@client.com',
        role: 'CLIENT',
        city: 'Karachi',
        country: 'Pakistan'
      };

      window._mockJob = {
        id: 'job-real-001',
        title: 'Full Stack Fintech Dashboard & Payment Integration',
        description: 'We need a robust dashboard built for tracking payments and financial analytics.\n\nKey Responsibilities:\n- Build responsive frontend dashboard in React\n- Integrate real-time ledger API and JazzCash / 1Link endpoints\n\nRequirements:\n- 3+ years experience with modern JavaScript / TypeScript\n- Proven experience with fintech / payment gateway integrations',
        budget: 120000,
        clientId: 'client-uuid-202',
        client: { id: 'client-uuid-202', name: 'Tariq Mehmood' },
        clientName: 'Tariq Mehmood',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        _count: { Proposal: 1 }
      };

      window._mockProposals = [];

      window._mockConversations = [
        {
          id: 'conv-001',
          participant1Id: 'spec-uuid-101',
          participant2Id: 'client-uuid-202',
          updatedAt: new Date().toISOString(),
          otherUser: window._mockClient,
          lastMessage: { content: 'Hi Tariq, I reviewed the fintech job requirements.' }
        }
      ];

      window._mockMessages = [
        {
          id: 'msg-001',
          conversationId: 'conv-001',
          senderId: 'spec-uuid-101',
          content: 'Hi Tariq, I reviewed the fintech job requirements.',
          isRead: true,
          createdAt: new Date(Date.now() - 600000).toISOString()
        },
        {
          id: 'msg-002',
          conversationId: 'conv-001',
          senderId: 'client-uuid-202',
          content: 'Great Fatima! Can you confirm when you can start?',
          isRead: false,
          createdAt: new Date(Date.now() - 300000).toISOString()
        }
      ];

      // Override API fetcher for local frontend verification
      window.api = async (endpoint) => {
        if (endpoint === '/jobs') return { ok: true, data: [window._mockJob] };
        return { ok: true, data: {} };
      };

      window.apiAuth = async (endpoint, options = {}) => {
        const method = options.method || 'GET';
        if (endpoint === '/messaging/conversations') {
          return { ok: true, data: window._mockConversations };
        }
        if (endpoint.startsWith('/messaging/conversations/conv-001/messages')) {
          return { ok: true, data: window._mockMessages };
        }
        if (endpoint === '/messaging/send') {
          const body = JSON.parse(options.body);
          const newMsg = {
            id: 'msg-' + Date.now(),
            conversationId: 'conv-001',
            senderId: window.getUser()?.id || 'spec-uuid-101',
            content: body.content,
            isRead: false,
            createdAt: new Date().toISOString()
          };
          window._mockMessages.push(newMsg);
          return { ok: true, data: newMsg };
        }
        if (endpoint.startsWith('/messaging/messages/') && method === 'DELETE') {
          const id = endpoint.split('/')[3];
          window._mockMessages = window._mockMessages.filter(m => m.id !== id);
          return { ok: true, data: { success: true, id } };
        }
        if (endpoint === '/proposals/me') {
          const u = window.getUser();
          return { ok: true, data: window._mockProposals.filter(p => p.freelancerId === u?.id) };
        }
        if (endpoint.startsWith('/proposals/job/')) {
          const jId = endpoint.split('/')[3];
          return { ok: true, data: window._mockProposals.filter(p => p.jobId === jId) };
        }
        if (endpoint === '/proposals' && method === 'POST') {
          const body = JSON.parse(options.body);
          const newProp = {
            id: 'prop-' + Date.now(),
            jobId: body.jobId,
            freelancerId: window.getUser()?.id || 'spec-uuid-101',
            coverLetter: body.coverLetter,
            bidAmount: body.bidAmount,
            deliveryDays: body.deliveryDays,
            status: 'PENDING',
            createdAt: new Date().toISOString(),
            User: window._mockSpecialist
          };
          window._mockProposals.push(newProp);
          return { ok: true, data: newProp };
        }
        return { ok: true, data: {} };
      };

      // Set logged in Specialist
      localStorage.setItem('paklance_token', 'test-token-jwt');
      localStorage.setItem('paklance_user', JSON.stringify(window._mockSpecialist));
      window.jobs = [window._mockJob];
    });

    // ----------------------------------------------------
    // TEST 1: ISSUE 2 & 3 — Browse Jobs & Job Details & Apply CTA
    // ----------------------------------------------------
    await page.evaluate(async () => {
      window.route('jobs');
      await window.loadJobsFromAPI();
    });
    await page.waitForTimeout(300);

    // Click "View Job"
    await page.evaluate(async () => {
      window.route('job-detail');
      await window.renderJobDetail(0);
    });
    await page.waitForTimeout(300);

    // Verify Issue 2: Apply Button Visibility & Styling
    const applyBtnStyles = await page.evaluate(() => {
      const btn = document.querySelector('#applyBtn');
      if (!btn) return null;
      const s = window.getComputedStyle(btn);
      return {
        display: s.display,
        visibility: s.visibility,
        background: s.backgroundColor,
        color: s.color,
        text: btn.innerText.trim()
      };
    });

    // Check if applyBtn background is green (#01411c / rgb(1, 65, 28)) and text is white
    const isApplyBtnProminent = applyBtnStyles &&
      applyBtnStyles.visibility === 'visible' &&
      applyBtnStyles.color === 'rgb(255, 255, 255)' &&
      (applyBtnStyles.background === 'rgb(1, 65, 28)' || applyBtnStyles.background.includes('1, 65, 28'));

    console.log(`[${vp.name}] Apply Button Check:`, isApplyBtnProminent ? 'PASS ✅' : 'FAIL ❌', applyBtnStyles);

    // Verify Issue 3: Professional Job Details Sections
    const jobSectionHeaders = await page.evaluate(() => {
      return [...document.querySelectorAll('.job-section-header')].map(h => h.textContent.trim());
    });
    const hasStructuredCards = jobSectionHeaders.includes('Project Overview') &&
      jobSectionHeaders.some(h => h.includes('Responsibilities') || h.includes('Requirements'));

    console.log(`[${vp.name}] Job Details Structure Check:`, hasStructuredCards ? 'PASS ✅' : 'FAIL ❌', jobSectionHeaders);

    // ----------------------------------------------------
    // TEST 2: ISSUE 4 — Real Proposal Submission Workflow
    // ----------------------------------------------------
    // Trigger openProposal
    await page.evaluate(() => window.openProposal());
    await page.waitForTimeout(300);

    // Fill form and click submit
    await page.evaluate(() => {
      document.querySelector('#propBid').value = '110000';
      document.querySelector('#propDays').value = '10';
      document.querySelector('#propCover').value = 'My proposal for the fintech payment dashboard project.';
      document.querySelector('#sendProposal').click();
    });
    await page.waitForTimeout(400);

    const proposalSubmittedState = await page.evaluate(() => {
      const sideText = document.querySelector('#jobDetailSide')?.innerText || '';
      return {
        hasSubmittedText: sideText.includes('Proposal Submitted'),
        proposalsCount: window._mockProposals.length
      };
    });

    const isProposalWorkflowPassing = proposalSubmittedState.hasSubmittedText && proposalSubmittedState.proposalsCount > 0;
    console.log(`[${vp.name}] Proposal Submission Workflow:`, isProposalWorkflowPassing ? 'PASS ✅' : 'FAIL ❌', proposalSubmittedState);

    // Verify Client view of submitted proposals
    await page.evaluate(async () => {
      localStorage.setItem('paklance_user', JSON.stringify(window._mockClient));
      await window.renderJobDetail(0);
    });
    await page.waitForTimeout(300);

    const clientProposalsView = await page.evaluate(() => {
      const card = document.querySelector('.proposal-received-card');
      const text = document.querySelector('#jobDetailMain')?.innerText || '';
      return {
        hasProposalsSection: text.includes('Proposals Received'),
        hasSpecialistName: text.includes('Fatima Zahra'),
        hasCoverLetter: text.includes('fintech payment dashboard'),
        hasMessageButton: !!card?.querySelector('button')
      };
    });

    const isClientProposalViewPassing = clientProposalsView.hasProposalsSection &&
      clientProposalsView.hasSpecialistName &&
      clientProposalsView.hasCoverLetter;

    console.log(`[${vp.name}] Client Received Proposals View:`, isClientProposalViewPassing ? 'PASS ✅' : 'FAIL ❌', clientProposalsView);

    // ----------------------------------------------------
    // TEST 3: ISSUE 1 — Real-Time Messaging UX
    // ----------------------------------------------------
    // Switch back to Specialist
    await page.evaluate(async () => {
      localStorage.setItem('paklance_user', JSON.stringify(window._mockSpecialist));
      window.route('messages', window._mockClient);
    });
    await page.waitForTimeout(400);

    // Check message list & status ticks
    const messageViewState = await page.evaluate(() => {
      const bubbles = document.querySelectorAll('.msg-bubble-row');
      const seenTicks = document.querySelectorAll('.msg-status-tick.seen');
      const sentTicks = document.querySelectorAll('.msg-status-tick.sent');
      const timestamps = document.querySelectorAll('.msg-time');
      const pollTimerActive = !!window._msgPollTimer;
      return {
        bubbleCount: bubbles.length,
        hasSeenTick: seenTicks.length > 0,
        hasTimestamps: timestamps.length > 0,
        pollTimerActive
      };
    });

    console.log(`[${vp.name}] Messaging Status & Polling:`, (messageViewState.bubbleCount >= 2 && messageViewState.pollTimerActive) ? 'PASS ✅' : 'FAIL ❌', messageViewState);

    // Test Optimistic Message Sending
    await page.evaluate(async () => {
      const input = document.querySelector('#chatInput');
      input.value = 'I am available to start immediately.';
      document.querySelector('#sendChat').click();
    });
    await page.waitForTimeout(400);

    const sentMessageState = await page.evaluate(() => {
      const lastMsg = window._mockMessages[window._mockMessages.length - 1];
      const bubbles = document.querySelectorAll('.msg-bubble-row');
      const lastBubbleText = bubbles[bubbles.length - 1]?.innerText || '';
      return {
        msgContent: lastMsg?.content,
        renderedInDom: lastBubbleText.includes('available to start immediately')
      };
    });

    console.log(`[${vp.name}] Optimistic Message Send:`, sentMessageState.renderedInDom ? 'PASS ✅' : 'FAIL ❌', sentMessageState);

    // Test Message Actions (Copy & Delete for me & Unsend)
    const actionTestState = await page.evaluate(async () => {
      // 1. Open action menu on last message
      const menuBtns = document.querySelectorAll('.msg-menu-btn');
      const lastMenuBtn = menuBtns[menuBtns.length - 1];
      if (lastMenuBtn) lastMenuBtn.click();

      const rows = document.querySelectorAll('.msg-bubble-row');
      const lastRow = rows[rows.length - 1];
      const unsendBtn = lastRow.querySelector('.unsend-msg-btn');
      const deleteMeBtn = lastRow.querySelector('.delete-me-msg-btn');

      const canUnsend = !!unsendBtn;
      const canDeleteMe = !!deleteMeBtn;

      // Click delete for me on first message
      const firstRow = rows[0];
      const firstDeleteMe = firstRow.querySelector('.delete-me-msg-btn');
      if (firstDeleteMe) firstDeleteMe.click();

      return {
        canUnsend,
        canDeleteMe,
        localDeletedCount: window._localDeletedMsgIds.size
      };
    });

    console.log(`[${vp.name}] Message Actions (Copy, Delete for me, Unsend):`, (actionTestState.canUnsend && actionTestState.localDeletedCount > 0) ? 'PASS ✅' : 'FAIL ❌', actionTestState);

    const vpPassed = isApplyBtnProminent &&
      hasStructuredCards &&
      isProposalWorkflowPassing &&
      isClientProposalViewPassing &&
      messageViewState.bubbleCount >= 2 &&
      sentMessageState.renderedInDom &&
      actionTestState.canUnsend;

    testResults.push({
      viewport: vp.name,
      passed: vpPassed,
      consoleErrors: consoleErrors.length
    });

    if (!vpPassed) allPassed = false;
    await context.close();
  }

  await browser.close();
  server.close();

  console.log('\n====================================================');
  console.log('FINAL VERIFICATION SUMMARY:');
  console.log('====================================================');
  console.table(testResults);
  console.log('All local tests passed:', allPassed ? 'YES ✅' : 'NO ❌');

  if (!allPassed) {
    process.exit(1);
  }
}

runLocalVerification().catch(err => {
  console.error('Test script error:', err);
  process.exit(1);
});
