const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

async function runFreshMessageVerification() {
  console.log('============================================================');
  console.log('STARTING FRESH MESSAGE REAL-TIME STATUS PROGRESSION TESTS');
  console.log('============================================================\n');

  const server = http.createServer((req, res) => {
    const indexPath = path.resolve(__dirname, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(content);
  });

  await new Promise(resolve => server.listen(3458, resolve));
  console.log('Local test server listening on http://localhost:3458\n');

  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'Mobile 375px (iPhone SE)', width: 375, height: 667 },
    { name: 'Mobile 390px (iPhone 14)', width: 390, height: 844 },
    { name: 'Tablet 768px (iPad)', width: 768, height: 1024 },
    { name: 'Desktop 1280px', width: 1280, height: 800 }
  ];

  let overallPassed = true;
  const resultsTable = [];

  for (const vp of viewports) {
    console.log(`------------------------------------------------------------`);
    console.log(`Testing Viewport: ${vp.name}`);
    console.log(`------------------------------------------------------------`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[Browser Console Error]:`, msg.text());
        consoleErrors.push(msg.text());
      }
    });

    // In-memory Database for this viewport session
    const userA = {
      id: 'user-a-111',
      name: 'Tariq Mehmood',
      email: 'tariq@client.com',
      role: 'CLIENT'
    };

    const userB = {
      id: 'user-b-222',
      name: 'Fatima Zahra',
      email: 'fatima@specialist.com',
      role: 'SPECIALIST',
      headline: 'Senior Full Stack Specialist'
    };

    let messagesDb = [];
    const conversationsDb = [
      {
        id: 'conv-live-01',
        participant1Id: 'user-a-111',
        participant2Id: 'user-b-222',
        otherUser: userB,
        updatedAt: new Date().toISOString(),
        lastMessage: null
      }
    ];

    // Intercept all API network requests with real HTTP responses
    await page.route('**/api/**', async (route) => {
      const req = route.request();
      const url = req.url();
      const method = req.method();

      if (url.includes('/api/jobs')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }

      if (url.includes('/api/profiles/search')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
      }

      if (url.includes('/api/messaging/conversations') && !url.includes('/messages')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(conversationsDb) });
      }

      if (url.includes('/api/messaging/conversations/conv-live-01/messages')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(messagesDb) });
      }

      if (url.includes('/api/messaging/send') && method === 'POST') {
        const postData = req.postDataJSON() || {};
        // Add 120ms latency to observe optimistic sending state
        await new Promise(r => setTimeout(r, 120));

        const newMsg = {
          id: 'msg-live-' + Date.now(),
          conversationId: 'conv-live-01',
          senderId: 'user-a-111',
          content: postData.content,
          isRead: false,
          createdAt: new Date().toISOString()
        };

        messagesDb.push(newMsg);
        conversationsDb[0].lastMessage = newMsg;
        conversationsDb[0].updatedAt = newMsg.createdAt;

        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(newMsg) });
      }

      if (url.includes('/api/messaging/messages/') && method === 'DELETE') {
        const parts = url.split('/messages/');
        const delId = parts[1];
        messagesDb = messagesDb.filter(m => m.id !== delId);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, id: delId }) });
      }

      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    // Seed session in localStorage before load
    await page.addInitScript((u) => {
      localStorage.setItem('paklance_token', 'test-jwt-token-a');
      localStorage.setItem('paklance_user', JSON.stringify(u));
    }, userA);

    await page.goto('http://localhost:3458');
    await page.waitForLoadState('domcontentloaded');

    // 1. Open messages route for User A
    await page.evaluate((other) => {
      window.route('messages', other);
    }, userB);

    await page.waitForSelector('#chatInput', { timeout: 4000 });

    // 2. Type a fresh message
    const freshMessageText = `Hello Fatima! Live test message @ ${Date.now()}`;
    await page.evaluate((text) => {
      const input = document.querySelector('#chatInput');
      input.value = text;
    }, freshMessageText);

    // 3. Click Send and IMMEDIATELY check Sending state (⏳)
    await page.evaluate(() => {
      document.querySelector('#sendChat').click();
    });

    const sendingState = await page.evaluate(() => {
      const sendingTick = document.querySelector('.msg-status-tick.sending');
      const bubble = document.querySelector('.bubble.me.sending');
      const row = document.querySelector('.msg-bubble-row.me');
      return {
        hasSendingTick: !!sendingTick,
        sendingTickText: sendingTick ? sendingTick.textContent.trim() : null,
        isOutgoingBubble: !!bubble && !!row
      };
    });

    console.log(`[${vp.name}] 1. Sending State (⏳):`, sendingState.hasSendingTick ? 'PASS ✅' : 'FAIL ❌', sendingState);

    // 4. Wait for API to acknowledge and verify Delivered State (✓✓ Delivered)
    await page.waitForTimeout(350);

    const deliveredState = await page.evaluate(() => {
      const deliveredTick = document.querySelector('.msg-status-tick.delivered');
      const bubble = document.querySelector('.bubble.me');
      const time = document.querySelector('.msg-time');
      const tickStyle = deliveredTick ? window.getComputedStyle(deliveredTick) : null;
      return {
        hasDeliveredTick: !!deliveredTick,
        deliveredTickText: deliveredTick ? deliveredTick.textContent.trim() : null,
        deliveredTickTitle: deliveredTick ? deliveredTick.getAttribute('title') : null,
        deliveredColor: tickStyle ? tickStyle.color : null,
        hasVisibleTimestamp: !!time && time.textContent.trim().length > 0,
        bubbleIsOutgoing: bubble && !bubble.classList.contains('sending')
      };
    });

    console.log(`[${vp.name}] 2. Delivered State (✓✓ Delivered):`, deliveredState.hasDeliveredTick ? 'PASS ✅' : 'FAIL ❌', deliveredState);

    // 5. Simulate User B (recipient) opening the conversation -> marks isRead = true
    messagesDb.forEach(m => {
      if (m.senderId === 'user-a-111') {
        m.isRead = true;
      }
    });

    // Wait for the next 2.5s polling cycle
    await page.waitForTimeout(2800);

    const seenState = await page.evaluate(() => {
      const seenTick = document.querySelector('.msg-status-tick.seen');
      const tickStyle = seenTick ? window.getComputedStyle(seenTick) : null;
      return {
        hasSeenTick: !!seenTick,
        seenTickText: seenTick ? seenTick.textContent.trim() : null,
        seenTickTitle: seenTick ? seenTick.getAttribute('title') : null,
        seenColor: tickStyle ? tickStyle.color : null
      };
    });

    console.log(`[${vp.name}] 3. Seen State (✓✓ Seen in blue):`, seenState.hasSeenTick ? 'PASS ✅' : 'FAIL ❌', seenState);

    // 6. Test Message Actions on the live message (Copy, Delete for me, Unsend)
    const actionMenuState = await page.evaluate(() => {
      const menuBtn = document.querySelector('.msg-menu-btn');
      if (menuBtn) menuBtn.click();
      const menu = document.querySelector('.msg-action-menu');
      return {
        menuOpened: menu && menu.classList.contains('open'),
        hasCopy: !!document.querySelector('.copy-msg-btn'),
        hasDeleteMe: !!document.querySelector('.delete-me-msg-btn'),
        hasUnsend: !!document.querySelector('.unsend-msg-btn')
      };
    });

    // Test Unsend
    await page.evaluate(async () => {
      const unsend = document.querySelector('.unsend-msg-btn');
      if (unsend) unsend.click();
    });
    await page.waitForTimeout(300);

    const remainingRowsInDom = await page.evaluate(() => {
      return document.querySelectorAll('.msg-bubble-row').length;
    });

    const unsendResult = {
      remainingRowsInDom,
      inDbCount: messagesDb.length
    };

    console.log(`[${vp.name}] 4. Message Actions & Unsend:`, (unsendResult.remainingRowsInDom === 0 && unsendResult.inDbCount === 0) ? 'PASS ✅' : 'FAIL ❌', unsendResult);

    const vpPassed = sendingState.hasSendingTick &&
      deliveredState.hasDeliveredTick &&
      seenState.hasSeenTick &&
      actionMenuState.hasCopy &&
      actionMenuState.hasUnsend &&
      unsendResult.remainingRowsInDom === 0 &&
      consoleErrors.length === 0;

    if (!vpPassed) overallPassed = false;

    resultsTable.push({
      viewport: vp.name,
      sending: sendingState.hasSendingTick,
      delivered: deliveredState.hasDeliveredTick,
      seen: seenState.hasSeenTick,
      actions: actionMenuState.hasCopy && actionMenuState.hasUnsend,
      consoleErrors: consoleErrors.length,
      passed: vpPassed
    });

    await context.close();
  }

  await browser.close();
  server.close();

  console.log('\n============================================================');
  console.log('FINAL FRESH MESSAGE VERIFICATION RESULTS');
  console.log('============================================================');
  console.table(resultsTable);
  console.log(`All Viewports Passed: ${overallPassed ? 'YES ✅' : 'NO ❌'}\n`);

  if (!overallPassed) {
    process.exit(1);
  }
}

runFreshMessageVerification().catch(err => {
  console.error('Test run error:', err);
  process.exit(1);
});
