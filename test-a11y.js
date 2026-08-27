const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('path');

async function checkAccessibility(page, stateName) {
  console.log(`\nScanning: ${stateName}...`);
  try {
    const results = await new AxeBuilder({ page }).analyze();
    
    if (results.violations.length === 0) {
      console.log(`✅ [${stateName}] Passed with 0 violations!`);
    } else {
      console.log(`❌ [${stateName}] Failed with ${results.violations.length} violations:`);
      results.violations.forEach((v) => {
        console.log(`  - [${v.impact}] ${v.id}: ${v.description}`);
        console.log(`    Help: ${v.helpUrl}`);
        v.nodes.forEach(n => console.log(`      Node: ${n.html}`));
      });
    }
  } catch (e) {
    console.error(`Error scanning ${stateName}:`, e);
  }
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Load local file
  const fileUrl = `file:///${path.resolve(__dirname, 'index.html').replace(/\\/g, '/')}`;
  await page.goto(fileUrl);
  await page.waitForLoadState('networkidle');

  // 1. Home
  await checkAccessibility(page, 'Home');

  // 2. Browse Jobs
  await page.evaluate(() => window.route('jobs'));
  await page.waitForTimeout(500); // give time for animation/render
  await checkAccessibility(page, 'Browse Jobs');

  // 3. Sign In
  // Close any open modals first
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
  });
  await page.evaluate(() => window.openModal('#authModal'));
  await page.waitForTimeout(500);
  await checkAccessibility(page, 'Sign In Modal');

  // 4. Sign Up
  // Click on "Sign up" button inside auth modal to swap to sign up view
  // auth modal has an action to switch to signup wizard, or we can just open #wizardModal or similar if it exists
  await page.evaluate(() => window.openModal('#roleModal')); // Paklance has role modal for signup?
  await page.waitForTimeout(500);
  await checkAccessibility(page, 'Sign Up / Role Selection Modal');

  // 5. Freelancer/Specialist Profile
  // Close modals
  await page.evaluate(() => {
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('open'));
  });
  await page.evaluate(() => window.route('profile'));
  await page.evaluate(() => {
    // Mock user and call renderProfile UI directly
    const f = {
      id: 1,
      initials: 'TU',
      name: 'Test User',
      role: 'Specialist',
      city: 'Test City',
      rate: 50,
      available: true,
      bio: 'Test bio',
      skills: ['Test'],
      badge: 'Verified',
      portfolio: []
    };
    window._renderProfileUI(f);
  });
  await page.waitForTimeout(500);
  await checkAccessibility(page, 'Freelancer/Specialist Profile');

  await browser.close();
}

run().catch(console.error);
