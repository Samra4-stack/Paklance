const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkTestRecords() {
  try {
    const users = await prisma.user.findMany({
      where: { email: { contains: 'client_jobs_' } },
      include: {
        jobs: true,
        contractsAsClient: true,
        contractsAsSpecialist: true,
        disputesRaised: true,
        escrows: true,
        portfolioItems: true,
        Proposal: true,
        wallets: true
      }
    });

    console.log(`Found ${users.length} test users in production.`);
    for (const u of users) {
      console.log(`\nUser ID: ${u.id}`);
      console.log(`Email: ${u.email} | Role: ${u.role}`);
      console.log(`Created: ${u.createdAt}`);
      console.log(`Dependencies:`);
      console.log(`- Jobs: ${u.jobs.length}`);
      u.jobs.forEach(j => console.log(`  -> Job ID: ${j.id} | Title: ${j.title} | Created: ${j.createdAt}`));
      console.log(`- Contracts (Client): ${u.contractsAsClient.length}`);
      console.log(`- Contracts (Specialist): ${u.contractsAsSpecialist.length}`);
      console.log(`- Disputes: ${u.disputesRaised.length}`);
      console.log(`- Escrows: ${u.escrows.length}`);
      console.log(`- Portfolio Items: ${u.portfolioItems.length}`);
      console.log(`- Proposals: ${u.Proposal.length}`);
      console.log(`- Wallets: ${u.wallets.length}`);
    }
  } catch (e) {
    console.error('Error querying DB:', e);
  } finally {
    await prisma.$disconnect();
  }
}

checkTestRecords();
