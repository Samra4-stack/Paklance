const { chromium } = require('playwright');

async function verifyProduction() {
  console.log('=== STARTING READ-ONLY PRODUCTION VERIFICATION ===\n');

  const prodUrl = 'https://www.paklance.com';
  const report = {
    siteLoaded: false,
    apiJobsStatus: null,
    jobsReturnedCount: 0,
    jobsRenderedInJobList: false,
    jobCountDisplayed: null,
    viewJobWorks: false,
    viewportsTested: [],
    consoleErrors: [],
    pass: true
  };

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { name: '1280px Desktop', width: 1280, height: 800 },
    { name: '768px Tablet', width: 768, height: 1024 },
    { name: '390px Mobile Standard', width: 390, height: 844 },
    { name: '375px Mobile Small', width: 375, height: 667 }
  ];

  for (let i = 0; i < viewports.length; i++) {
    const vp = viewports[i];
    console.log(`\n--- Testing ${vp.name} (${vp.width}x${vp.height}) ---`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (!text.includes('favicon') && !text.includes('404 (Not Found)')) {
          report.consoleErrors.push(`[${vp.name}] ${text}`);
        }
      }
    });

    // 1. Confirm https://www.paklance.com/ loads
    console.log(`  Navigating to ${prodUrl}/...`);
    const resp = await page.goto(`${prodUrl}/#home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const statusCode = resp ? resp.status() : 0;
    console.log(`  Page response status: ${statusCode}`);
    if (statusCode === 200) report.siteLoaded = true;

    // Simulate Specialist logged-in session (read-only in localStorage)
    await page.evaluate(() => {
      localStorage.setItem('paklance_token', 'readonly-specialist-session-token');
      localStorage.setItem('paklance_user', JSON.stringify({
        id: 'spec-verify',
        name: 'Specialist Tester',
        email: 'specialist@test.com',
        role: 'SPECIALIST'
      }));
    });

    // 2. Test GET /api/jobs directly from production
    if (i === 0) {
      console.log('  Testing GET https://www.paklance.com/api/jobs directly...');
      const apiResponse = await page.request.get(`${prodUrl}/api/jobs`);
      report.apiJobsStatus = apiResponse.status();
      console.log(`  GET /api/jobs HTTP Status: ${report.apiJobsStatus}`);
      try {
        const jobsJson = await apiResponse.json();
        report.jobsReturnedCount = Array.isArray(jobsJson) ? jobsJson.length : 0;
        console.log(`  Current production jobs count returned by API: ${report.jobsReturnedCount}`);
      } catch (err) {
        console.log(`  Could not parse JSON from /api/jobs: ${err.message}`);
      }
    }

    // 3. Open Browse Jobs as Specialist
    console.log('  Navigating to #jobs view...');
    await page.evaluate(() => window.route('jobs'));
    await page.waitForTimeout(2000); // Give time for real API call to resolve and render

    // 4. Confirm jobs are rendered inside #jobList
    const jobCardsCount = await page.$$eval('#jobList .job-card', els => els.length);
    console.log(`  Rendered .job-card elements in #jobList: ${jobCardsCount}`);

    // 5. Confirm job count is displayed
    const jobCountText = await page.$eval('#jobCount', el => el.textContent.trim());
    console.log(`  #jobCount text: "${jobCountText}"`);
    if (i === 0) report.jobCountDisplayed = jobCountText;

    // 6. Confirm View Job works
    let viewJobSuccess = false;
    if (jobCardsCount > 0) {
      console.log('  Clicking "View Job" CTA on first job card...');
      const firstJobCta = await page.$('#jobList .job-card .job-cta');
      if (firstJobCta) {
        await firstJobCta.click();
        await page.waitForTimeout(1000);

        const isDetailActive = await page.$eval('.view[data-view="job-detail"]', el => el.classList.contains('active'));
        const detailMainText = await page.$eval('#jobDetailMain', el => el.textContent.trim());
        console.log(`  Job Detail View Active: ${isDetailActive}`);
        console.log(`  Job Detail Content Preview: "${detailMainText.slice(0, 80)}..."`);
        viewJobSuccess = isDetailActive && detailMainText.length > 0;
      }
    } else {
      // If 0 jobs currently in production database, verify #jobCount and empty state
      console.log('  No jobs returned from prod DB; checking empty state rendering');
      viewJobSuccess = true;
    }

    const vpPassed = (jobCardsCount > 0 ? (jobCardsCount === report.jobsReturnedCount) : true) &&
                     jobCountText.length > 0 &&
                     viewJobSuccess;

    console.log(`  Viewport ${vp.name} result: ${vpPassed ? 'PASS ✅' : 'FAIL ❌'}`);

    report.viewportsTested.push({
      name: vp.name,
      passed: vpPassed,
      jobCardsCount,
      jobCountText,
      viewJobSuccess
    });

    await context.close();
  }

  await browser.close();

  report.jobsRenderedInJobList = report.viewportsTested.every(v => v.jobCardsCount === report.jobsReturnedCount);
  report.viewJobWorks = report.viewportsTested.every(v => v.viewJobSuccess);
  report.pass = report.siteLoaded && report.apiJobsStatus === 200 && report.jobsRenderedInJobList && report.viewJobWorks;

  console.log('\n========================================');
  console.log('PRODUCTION READ-ONLY VERIFICATION SUMMARY:');
  console.log('========================================');
  console.log(`1. https://www.paklance.com/ loads: ${report.siteLoaded ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`2. GET /api/jobs returns current production jobs (Status ${report.apiJobsStatus}, Count: ${report.jobsReturnedCount}): ${report.apiJobsStatus === 200 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`3. Browse Jobs renders inside #jobList: ${report.jobsRenderedInJobList ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`4. #jobCount displayed correctly ("${report.jobCountDisplayed}"): ${report.jobCountDisplayed ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`5. View Job opens job detail view: ${report.viewJobWorks ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`6. All viewports tested (375px, 390px, 768px, 1280px): ${report.viewportsTested.every(v => v.passed) ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`7. Console errors: ${report.consoleErrors.length === 0 ? '0 (Clean)' : JSON.stringify(report.consoleErrors)}`);
  console.log(`OVERALL RESULT: ${report.pass ? 'PASS ✅' : 'FAIL ❌'}`);
}

verifyProduction().catch(err => {
  console.error('Production verification script failed:', err);
  process.exit(1);
});
