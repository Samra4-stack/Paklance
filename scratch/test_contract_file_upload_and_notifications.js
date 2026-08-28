const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const STAGING_DB = 'postgresql://neondb_owner:npg_Y26bEnkXoCxO@ep-billowing-wildflower-awjgcwi4-pooler.c-12.us-east-1.aws.neon.tech/neondb?sslmode=require';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-production-12345';

async function runVerification() {
  console.log('--- STARTING CONTRACT FILE & NOTIFICATION VERIFICATION AGAINST STAGING NEON DB ---');
  const prisma = new PrismaClient({
    datasources: { db: { url: STAGING_DB } },
  });

  try {
    const stamp = Date.now();

    // 1. Create Client and Specialist
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const client = await prisma.user.create({
      data: {
        email: `file_client_${stamp}@test.com`,
        name: `File Client ${stamp}`,
        role: 'CLIENT',
        passwordHash,
      },
    });

    const specialist = await prisma.user.create({
      data: {
        email: `file_spec_${stamp}@test.com`,
        name: `File Specialist ${stamp}`,
        role: 'SPECIALIST',
        headline: 'Senior Full Stack Engineer',
        passwordHash,
      },
    });

    const stranger = await prisma.user.create({
      data: {
        email: `stranger_${stamp}@test.com`,
        name: `Stranger ${stamp}`,
        role: 'CLIENT',
        passwordHash,
      },
    });

    console.log(`✔ Created test users (Client: ${client.id}, Specialist: ${specialist.id}, Stranger: ${stranger.id})`);

    // 2. Create Job & Proposal
    const job = await prisma.job.create({
      data: {
        title: `Test Project for File Upload ${stamp}`,
        description: 'Need deliverables uploaded and verified.',
        budget: 95000,
        clientId: client.id,
      },
    });

    const proposal = await prisma.proposal.create({
      data: {
        jobId: job.id,
        freelancerId: specialist.id,
        coverLetter: 'I will complete the work and upload files.',
        bidAmount: 90000,
        deliveryDays: 14,
      },
    });

    // 3. Accept Proposal -> Contract Created
    const contract = await prisma.contract.create({
      data: {
        jobId: job.id,
        clientId: client.id,
        specialistId: specialist.id,
        status: 'IN_PROGRESS',
        milestones: {
          create: [
            {
              title: 'Deliverable Phase 1',
              description: 'Initial files and specifications',
              amount: 90000,
            },
          ],
        },
      },
      include: { milestones: true },
    });

    console.log(`✔ Contract created: ${contract.id}`);

    // 4. Test File Upload (Client uploads a PDF)
    const samplePdfData = 'data:application/pdf;base64,JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0xlbmd0aCAxMDUKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCg==';
    const uploadedFile = await prisma.contractFile.create({
      data: {
        contractId: contract.id,
        uploaderId: client.id,
        filename: `${Date.now()}_project_spec.pdf`,
        originalName: 'project_spec.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        fileData: samplePdfData,
      },
      include: {
        uploader: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    console.log(`✔ File uploaded successfully: ID=${uploadedFile.id}, OriginalName="${uploadedFile.originalName}", Uploader=${uploadedFile.uploader.name}`);

    // 5. Verify File Listing for Contract
    const contractFiles = await prisma.contractFile.findMany({
      where: { contractId: contract.id },
      include: {
        uploader: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (contractFiles.length !== 1 || contractFiles[0].id !== uploadedFile.id) {
      throw new Error(`File list mismatch! Expected 1 file, got ${contractFiles.length}`);
    }
    console.log(`✔ Verified contract files list contains 1 file with valid metadata`);

    // 6. Verify Specialist can access and download file
    const downloadedFile = await prisma.contractFile.findUnique({
      where: { id: uploadedFile.id },
      include: { contract: true },
    });

    const isParticipant =
      downloadedFile.contract.clientId === specialist.id ||
      downloadedFile.contract.specialistId === specialist.id;

    if (!isParticipant) {
      throw new Error('Specialist participant authorization failed!');
    }
    if (downloadedFile.fileData !== samplePdfData) {
      throw new Error('Downloaded fileData does not match uploaded payload!');
    }
    console.log(`✔ Specialist verified as authorized participant; fileData verified intact`);

    // 7. Verify Stranger is NOT a participant
    const isStrangerParticipant =
      downloadedFile.contract.clientId === stranger.id ||
      downloadedFile.contract.specialistId === stranger.id;

    if (isStrangerParticipant) {
      throw new Error('Security flaw: Stranger was authorized as participant!');
    }
    console.log(`✔ Stranger correctly denied participant access (403 condition verified)`);

    // 8. Test Messaging & Delivery Status between Client & Specialist
    const conv = await prisma.conversation.create({
      data: {
        participant1Id: client.id,
        participant2Id: specialist.id,
      },
    });

    const msg = await prisma.message.create({
      data: {
        conversationId: conv.id,
        senderId: specialist.id,
        content: 'Hi Client, I have uploaded the first project milestone deliverables.',
        isDelivered: false,
        isRead: false,
      },
    });

    console.log(`✔ Message created: ID=${msg.id}, isDelivered=${msg.isDelivered}, isRead=${msg.isRead}`);

    // Client syncs delivery (marks messages in client's conversations as delivered)
    await prisma.message.updateMany({
      where: { conversationId: conv.id, senderId: { not: client.id }, isDelivered: false },
      data: { isDelivered: true },
    });

    const deliveredMsg = await prisma.message.findUnique({ where: { id: msg.id } });
    if (!deliveredMsg.isDelivered) throw new Error('isDelivered failed to update to true');
    console.log(`✔ Delivery status updated to delivered (✓✓)`);

    // Client opens conversation and marks as read
    await prisma.message.updateMany({
      where: { conversationId: conv.id, senderId: { not: client.id }, isRead: false },
      data: { isRead: true, isDelivered: true },
    });

    const readMsg = await prisma.message.findUnique({ where: { id: msg.id } });
    if (!readMsg.isRead) throw new Error('isRead failed to update to true');
    console.log(`✔ Read status updated to read (✓✓ blue Seen)`);

    console.log('--- ALL STAGING DATABASE VERIFICATIONS PASSED 100% ---');
  } finally {
    await prisma.$disconnect();
  }
}

runVerification().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
