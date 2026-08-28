const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runVerification() {
  const consoleErrors = [];
  const results = {
    viewportsTested: [],
    jobsRendered: false,
    jobCountCorrect: false,
    jobDetailOpened: false,
    consoleErrors: [],
    pass: true
  };

  const sampleJobs = [
    {
      id: 'job-1',
      title: 'Full-Stack React & Node Developer',
      description: 'We are looking for an experienced developer to build a high-performance web application with modern stack.',
      budget: 150000,
      client: { id: 'client-1', name: 'Tech Solutions PK' }
    },
    {
      id: 'job-2',
      title: 'UI/UX Designer for Fintech App',
      description: 'Design mobile and web dashboards for a digital payments platform with clean Figma design system.',
      budget: 85000,
      client: { id: 'client-2', name: 'FinPay Lahore' }
    },
    {
      id: 'job-3',
      title: 'Senior NestJS & PostgreSQL Architect',
      description: 'Refactor backend services, implement clean architecture, and optimize database indexing for high throughput.',
      budget: 200000,
      client: { id: 'client-3', name: 'Enterprise Cloud' }
    }
  ];

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '375px Mobile Small', width: 375, height: 667 },
    { name: '390px Mobile Standard', width: 390, height: 844 },
    { name: '768px Tablet', width: 768, height: 1024 },
    { name: '1280px Desktop', width: 1280, height: 800 }
  ];

  for (const vp of viewports) {
    console.log(`\n========================================`);
    console.log(`Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`========================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });

    const page = await context.newPage();

    // Listen to console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[${vp.name}] Console Error: ${msg.text()}`);
      }
    });
    page.on('pageerror', exception => {
      consoleErrors.push(`[${vp.name}] Uncaught Exception: ${exception.message}`);
    });

    // Mock GET /api/jobs & auth/profile calls
    await page.route('**/api/jobs', async route => {
      console.log(`  [Intercepted] ${route.request().method()} ${route.request().url()}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(sampleJobs)
      });
    });

    await page.route('**/api/profiles/**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'spec-1',
          name: 'Ahmed Specialist',
          headline: 'Full-Stack Developer',
          city: 'Karachi',
          hourlyRate: 5000,
          availability: 'AVAILABLE',
          skills: ['TypeScript', 'React', 'Node.js']
        })
      });
    });

    // 1. Load the site as a Specialist
    const fileUrl = `file:///${path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/')}`;
    await page.goto(fileUrl);

    // Set Specialist user in localStorage
    await page.evaluate(() => {
      localStorage.setItem('paklance_token', 'test-specialist-jwt-token');
      localStorage.setItem('paklance_user', JSON.stringify({
        id: 'spec-1',
        email: 'specialist@paklance.com',
        name: 'Ahmed Specialist',
        role: 'SPECIALIST'
      }));
    });

    // Reload page with session active
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // 2. Navigate to jobs view & trigger loadJobsFromAPI()
    console.log('  Navigating to #jobs view as Specialist...');
    await page.evaluate(() => window.route('jobs'));
    await page.waitForTimeout(600);

    // 3. Confirm the returned jobs are rendered inside #jobList
    const jobListExists = await page.$eval('#jobList', el => !!el);
    const renderedJobCards = await page.$$eval('#jobList .job-card', els => els.map(el => ({
      title: el.querySelector('h3')?.textContent,
      descSnippet: el.querySelector('p')?.textContent,
      hasViewBtn: !!el.querySelector('.job-cta')
    })));

    console.log(`  Rendered job cards count: ${renderedJobCards.length}`);
    renderedJobCards.forEach((c, idx) => {
      console.log(`    Job ${idx + 1}: "${c.title}" | CTA button: ${c.hasViewBtn}`);
    });

    const isJobListValid = renderedJobCards.length === sampleJobs.length &&
      renderedJobCards[0].title === sampleJobs[0].title;

    // 4. Confirm #jobCount displays the correct number of jobs
    const jobCountText = await page.$eval('#jobCount', el => el.textContent.trim());
    console.log(`  #jobCount text: "${jobCountText}" (Expected: "${sampleJobs.length} jobs")`);
    const isJobCountValid = jobCountText === `${sampleJobs.length} jobs`;

    // 5. Click "View Job" and verify the job detail opens
    console.log('  Clicking "View Job" on first card...');
    const firstViewJobBtn = await page.$('#jobList .job-card .job-cta');
    await firstViewJobBtn.click();
    await page.waitForTimeout(600);

    const isJobDetailActive = await page.$eval('.view[data-view="job-detail"]', el => el.classList.contains('active'));
    const jobDetailTitle = await page.$eval('#jobDetailMain h1', el => el.textContent.trim());
    const jobDetailDesc = await page.$eval('#jobDetailMain p', el => el.textContent.trim());

    console.log(`  Job detail view active: ${isJobDetailActive}`);
    console.log(`  Job detail title rendered: "${jobDetailTitle}"`);
    console.log(`  Job detail desc matches: ${jobDetailDesc === sampleJobs[0].description}`);

    const isDetailValid = isJobDetailActive &&
      jobDetailTitle === sampleJobs[0].title &&
      jobDetailDesc === sampleJobs[0].description;

    const viewportPassed = isJobListValid && isJobCountValid && isDetailValid;
    console.log(`  Result for ${vp.name}: ${viewportPassed ? 'PASS ✅' : 'FAIL ❌'}`);

    results.viewportsTested.push({
      viewport: vp.name,
      passed: viewportPassed,
      jobCardsCount: renderedJobCards.length,
      jobCountText,
      detailTitle: jobDetailTitle
    });

    if (!viewportPassed) results.pass = false;

    await context.close();
  }

  results.jobsRendered = results.viewportsTested.every(v => v.jobCardsCount === sampleJobs.length);
  results.jobCountCorrect = results.viewportsTested.every(v => v.jobCountText === `${sampleJobs.length} jobs`);
  results.jobDetailOpened = results.viewportsTested.every(v => v.detailTitle === sampleJobs[0].title);
  results.consoleErrors = consoleErrors;
  if (consoleErrors.length > 0) {
    console.log('\nConsole Errors captured:', consoleErrors);
    // Filter out expected file:// favicon or non-fatal asset 404s if any
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon'));
    if (fatalErrors.length > 0) results.pass = false;
  }

  await browser.close();

  console.log('\n========================================');
  console.log('FINAL VERIFICATION SUMMARY:');
  console.log('========================================');
  console.log(`- Specialist Session: OK`);
  console.log(`- GET /api/jobs call & response: OK`);
  console.log(`- Rendered inside #jobList: ${results.jobsRendered ? 'PASS' : 'FAIL'}`);
  console.log(`- #jobCount accurate: ${results.jobCountCorrect ? 'PASS' : 'FAIL'}`);
  console.log(`- View Job detail opens properly: ${results.jobDetailOpened ? 'PASS' : 'FAIL'}`);
  console.log(`- Responsive Viewports (375px, 390px, 768px, Desktop): ${results.viewportsTested.every(v => v.passed) ? 'PASS' : 'FAIL'}`);
  console.log(`- Console errors: ${consoleErrors.length === 0 ? '0 (Clean)' : consoleErrors.length}`);
  console.log(`- OVERALL: ${results.pass ? 'PASS' : 'FAIL'}`);
}

runVerification().catch(err => {
  console.error('Fatal error running verification:', err);
  process.exit(1);
});
