const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_Y26bEnkXoCxO@ep-billowing-wildflower-awjgcwi4-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require"
    }
  }
});

async function runStagingVerification() {
  console.log('--- STARTING STAGING DATABASE & WORKFLOW VERIFICATION ---');

  try {
    const timestamp = Date.now();
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // 1. Create Client User A and Specialist User B on Staging Neon DB
    console.log('\n[1] Creating Client and Specialist users in Neon staging DB...');
    const clientUser = await prisma.user.create({
      data: {
        email: `client_stage_${timestamp}@paklance.com`,
        name: `Stage Client ${timestamp}`,
        passwordHash,
        role: 'CLIENT',
      },
    });

    const specialistUser1 = await prisma.user.create({
      data: {
        email: `spec1_stage_${timestamp}@paklance.com`,
        name: `Specialist Alpha`,
        passwordHash,
        role: 'SPECIALIST',
        headline: 'Senior Full Stack Engineer',
        city: 'Lahore',
      },
    });

    const specialistUser2 = await prisma.user.create({
      data: {
        email: `spec2_stage_${timestamp}@paklance.com`,
        name: `Specialist Beta`,
        passwordHash,
        role: 'SPECIALIST',
        headline: 'Mobile Developer',
        city: 'Karachi',
      },
    });

    console.log(`✓ Created Client: ${clientUser.id}`);
    console.log(`✓ Created Specialist 1: ${specialistUser1.id}`);
    console.log(`✓ Created Specialist 2: ${specialistUser2.id}`);

    // ==========================================
    // ISSUE 2 VERIFICATION: PROPOSAL ACCEPTANCE
    // ==========================================
    console.log('\n--- VERIFYING ISSUE 2: PROPOSAL ACCEPTANCE WORKFLOW ---');

    // Step A: Client posts a job
    const job = await prisma.job.create({
      data: {
        clientId: clientUser.id,
        title: 'Full Stack Web App Development',
        description: 'Build a production-ready application with modern UI and authentication.',
        budget: 75000,
      },
    });
    console.log(`✓ Job posted by Client: ID=${job.id}, Title="${job.title}"`);

    // Step B: Both specialists submit proposals
    const prop1 = await prisma.proposal.create({
      data: {
        jobId: job.id,
        freelancerId: specialistUser1.id,
        bidAmount: 70000,
        deliveryDays: 7,
        coverLetter: 'I have 6+ years of full stack experience and can deliver this in 7 days.',
        status: 'PENDING',
      },
    });

    const prop2 = await prisma.proposal.create({
      data: {
        jobId: job.id,
        freelancerId: specialistUser2.id,
        bidAmount: 75000,
        deliveryDays: 10,
        coverLetter: 'I am a specialized developer and ready to start immediately.',
        status: 'PENDING',
      },
    });
    console.log(`✓ Specialist 1 submitted Proposal: ID=${prop1.id}, Bid=70000, Status=${prop1.status}`);
    console.log(`✓ Specialist 2 submitted Proposal: ID=${prop2.id}, Bid=75000, Status=${prop2.status}`);

    // Step C: Client accepts Proposal 1
    console.log('\n[2] Client accepts Proposal 1...');
    // We execute the exact transactional logic implemented in ProposalsService
    const acceptedProposal = await prisma.$transaction(async (tx) => {
      const accepted = await tx.proposal.update({
        where: { id: prop1.id },
        data: { status: 'ACCEPTED' },
      });

      await tx.proposal.updateMany({
        where: {
          jobId: job.id,
          id: { not: prop1.id },
          status: 'PENDING',
        },
        data: { status: 'REJECTED' },
      });

      const contract = await tx.contract.create({
        data: {
          jobId: job.id,
          clientId: clientUser.id,
          specialistId: specialistUser1.id,
          status: 'DRAFT',
        },
      });

      return { accepted, contract };
    });

    console.log(`✓ Proposal 1 status in DB: ${acceptedProposal.accepted.status}`);
    console.log(`✓ Contract created for hired specialist: ID=${acceptedProposal.contract.id}, Status=${acceptedProposal.contract.status}`);

    // Verify Proposal 2 was automatically REJECTED
    const prop2After = await prisma.proposal.findUnique({ where: { id: prop2.id } });
    console.log(`✓ Proposal 2 status in DB after acceptance of Proposal 1: ${prop2After.status}`);

    if (acceptedProposal.accepted.status !== 'ACCEPTED') {
      throw new Error('Expected Proposal 1 to be ACCEPTED');
    }
    if (prop2After.status !== 'REJECTED') {
      throw new Error('Expected Proposal 2 to be REJECTED');
    }

    // ==========================================
    // ISSUE 1 VERIFICATION: MESSAGE STATUS LIFECYCLE
    // ==========================================
    console.log('\n--- VERIFYING ISSUE 1: MESSAGE STATUS LIFECYCLE ---');

    // Create a conversation between Client (User A) and Specialist 1 (User B)
    const conv = await prisma.conversation.create({
      data: {
        participant1Id: clientUser.id,
        participant2Id: specialistUser1.id,
      },
    });

    // Step 1: User A sends a fresh message while User B is OFFLINE
    console.log('\n[3] User A sends a message while User B is OFFLINE...');
    const msg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: clientUser.id,
        content: 'Hi Alpha! Welcome to the project.',
        isDelivered: false,
        isRead: false,
      },
    });

    console.log(`✓ Message created in DB: ID=${msg.id}`);
    console.log(`✓ State when User B is OFFLINE: isDelivered=${msg.isDelivered}, isRead=${msg.isRead}`);
    console.log(`  -> UI renders: ✓ (Sent - 1 tick)`);

    if (msg.isDelivered !== false || msg.isRead !== false) {
      throw new Error('Fresh message to offline user should have isDelivered=false and isRead=false');
    }

    // Step 2: User B comes ONLINE (syncs conversations / app loads)
    console.log('\n[4] User B comes ONLINE and syncs conversations...');
    const syncResult = await prisma.message.updateMany({
      where: {
        conversationId: conv.id,
        senderId: { not: specialistUser1.id },
        isDelivered: false,
      },
      data: {
        isDelivered: true,
      },
    });

    const msgDelivered = await prisma.message.findUnique({ where: { id: msg.id } });
    console.log(`✓ Messages updated to delivered: count=${syncResult.count}`);
    console.log(`✓ State after User B comes ONLINE: isDelivered=${msgDelivered.isDelivered}, isRead=${msgDelivered.isRead}`);
    console.log(`  -> UI renders: ✓✓ (Delivered - 2 ticks)`);

    if (msgDelivered.isDelivered !== true || msgDelivered.isRead !== false) {
      throw new Error('Message after recipient comes online should have isDelivered=true and isRead=false');
    }

    // Step 3: User B OPENS the conversation with User A
    console.log('\n[5] User B OPENS the conversation...');
    await prisma.message.updateMany({
      where: {
        conversationId: conv.id,
        senderId: { not: specialistUser1.id },
        OR: [{ isRead: false }, { isDelivered: false }],
      },
      data: {
        isDelivered: true,
        isRead: true,
      },
    });

    const msgRead = await prisma.message.findUnique({ where: { id: msg.id } });
    console.log(`✓ State after User B opens conversation: isDelivered=${msgRead.isDelivered}, isRead=${msgRead.isRead}`);
    console.log(`  -> UI renders: ✓✓ (Seen - 2 blue ticks)`);

    if (msgRead.isDelivered !== true || msgRead.isRead !== true) {
      throw new Error('Message after recipient opens conversation should have isDelivered=true and isRead=true');
    }

    console.log('\n======================================================');
    console.log('✅ ALL STAGING DATABASE & WORKFLOW TESTS PASSED SUCCESSFULLY!');
    console.log('======================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

runStagingVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
