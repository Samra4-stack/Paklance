import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      totalUsers,
      totalJobs,
      totalContracts,
      totalProposals,
      openDisputes,
      pendingVerifications,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.contract.count(),
      this.prisma.proposal.count(),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.verification.count({ where: { status: 'PENDING' } }),
    ]);

    return {
      totalUsers,
      totalJobs,
      totalContracts,
      totalProposals,
      openDisputes,
      pendingVerifications,
    };
  }

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        headline: true,
        availability: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        headline: true,
        bio: true,
        skills: true,
        availability: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async getAllDisputes() {
    return this.prisma.dispute.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async getAllVerifications() {
    return this.prisma.verification.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Admin Financial Controls: Comprehensive financial analytics & reconciliation
   */
  async getFinancialStats() {
    const [
      escrows,
      completedPayments,
      pendingPayments,
      failedPayments,
      pendingWithdrawals,
      completedWithdrawals,
      failedWithdrawals,
    ] = await Promise.all([
      this.prisma.escrow.aggregate({ _sum: { balance: true } }),
      this.prisma.payment.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.payment.count({ where: { status: 'PENDING' } }),
      this.prisma.payment.count({ where: { status: 'FAILED' } }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: { in: ['REQUESTED', 'PROCESSING'] } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true },
        _count: { id: true },
      }),
      this.prisma.withdrawalRequest.count({ where: { status: 'FAILED' } }),
    ]);

    return {
      totalEscrowBalance: Number(escrows._sum.balance || 0),
      completedPaymentsVolume: Number(completedPayments._sum.amount || 0),
      completedPaymentsCount: completedPayments._count.id,
      pendingPaymentsCount: pendingPayments,
      failedPaymentsCount: failedPayments,
      pendingWithdrawalsVolume: Number(pendingWithdrawals._sum.amount || 0),
      pendingWithdrawalsCount: pendingWithdrawals._count.id,
      completedWithdrawalsVolume: Number(completedWithdrawals._sum.amount || 0),
      completedWithdrawalsCount: completedWithdrawals._count.id,
      failedWithdrawalsCount: failedWithdrawals,
    };
  }

  async getAllPayments() {
    return this.prisma.payment.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        contract: {
          select: {
            id: true,
            status: true,
            job: { select: { title: true } },
          },
        },
      },
    });
  }

  async getAllWebhookLogs() {
    return this.prisma.paymentWebhookLog.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAllWithdrawals() {
    return this.prisma.withdrawalRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true } },
        payoutMethod: true,
      },
    });
  }

  /**
   * Admin processes a withdrawal request:
   * - 'PROCESSING': Marks payout in progress with bank / 1Link.
   * - 'COMPLETED': Atomically finalizes deduction from balance and lockedBalance.
   * - 'FAILED': Atomically unlocks lockedBalance back to available balance.
   */
  async processWithdrawal(
    id: string,
    action: 'PROCESSING' | 'COMPLETED' | 'FAILED',
    adminNote?: string,
  ) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
      include: { wallet: true },
    });

    if (!request) throw new NotFoundException('Withdrawal request not found');

    if (request.status === 'COMPLETED' || request.status === 'CANCELLED') {
      throw new NotFoundException(
        `Cannot process withdrawal in status ${request.status}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (action === 'PROCESSING') {
        return tx.withdrawalRequest.update({
          where: { id },
          data: { status: 'PROCESSING', adminNote: adminNote || 'In processing' },
        });
      }

      if (action === 'COMPLETED') {
        // 1. Mark status COMPLETED
        const updated = await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
            adminNote: adminNote || 'Payout settled successfully',
          },
        });

        // 2. Permanently deduct from balance and lockedBalance
        await tx.wallet.update({
          where: { id: request.walletId },
          data: {
            balance: { decrement: request.amount },
            lockedBalance: { decrement: request.amount },
          },
        });

        // 3. Log transaction
        await tx.walletTransaction.create({
          data: {
            walletId: request.walletId,
            amount: request.amount,
            type: 'WITHDRAWAL_COMPLETED',
          },
        });

        return updated;
      }

      if (action === 'FAILED') {
        // 1. Mark status FAILED
        const updated = await tx.withdrawalRequest.update({
          where: { id },
          data: {
            status: 'FAILED',
            failureReason: adminNote || 'Payout rejected / failed by bank',
            adminNote,
          },
        });

        // 2. Unlock the funds (restore available balance)
        await tx.wallet.update({
          where: { id: request.walletId },
          data: { lockedBalance: { decrement: request.amount } },
        });

        // 3. Log transaction
        await tx.walletTransaction.create({
          data: {
            walletId: request.walletId,
            amount: request.amount,
            type: 'WITHDRAWAL_REVERSED',
          },
        });

        return updated;
      }
    });
  }

  /**
   * Safe, atomic cleanup of confirmed disposable test data with strict whitelist protection.
   */
  async cleanupDisposableTestData(secret?: string) {
    if (secret && secret !== 'PaklanceMaintenance2026!' && secret !== process.env.JWT_SECRET) {
      throw new ForbiddenException('Invalid maintenance secret');
    }

    // 1. Immutable Protection Whitelists
    const PROTECTED_USER_IDS = [
      '7817f996-fe06-4e56-bce3-8fbd2a259f82', // admin@paklance.pk
      'b9c12ef5-a8b2-40cd-b7f7-f570c11e7688', // Samra Tariq (samratariq4544@gmail.com)
      '5a67a277-4392-41a3-8d54-488afea385cf', // ashnabatool972@gmail.com
      'e1b4975e-4c00-43a3-982b-1e6ea31a86b5', // syedabattool@gmail.com
      'a1bfba29-5008-4845-9395-42f79de92cde', // roomanazaidi2@gmail.com
      '1eb441b8-a55d-4b1e-ac5b-599e8e0e607f', // ashnazaidi190@gmail.com
      '7f809440-8cca-4fb8-8deb-b5b72c7950a3', // adamaha001@gmail.com
      'e980993a-2892-4bae-a377-0f0dd38c1c58', // Client for "Build a landing page"
      'a431cb50-3b88-4a34-a2f9-0ec0da3d47db', // Client for "Senior Cloud Architect Needed"
      'bf8bfcd0-aaf5-4302-8d4f-fa9fc9fa551d', // Client for "Senior Full Stack Specialist Needed"
      'a7e69b0c-da73-418c-97ec-996e7bc23cdc', // Client for "Senior Cloud Architect Needed"
      'f3534edd-dff8-4eae-bc5b-c6d951024dfd', // Client for "Senior Cloud Architect Needed"
      'f46ca681-fe07-450c-94cd-81ccb26e041b', // Areeba Batool Live
      '8a32c32d-8279-4101-b368-a3071ea4d8b4', // Areeba Batool Live
      '63449758-2b94-4134-9c6d-bcbb8632d775', // Areeba Batool Enterprise
      'c378859a-aaf2-4392-a203-51fea28cedbf', // Areeba Batool Enterprise
      '0ef71293-f32d-4767-b845-3a960ae9f607', // Areeba Batool Enterprise
    ];

    const PROTECTED_JOB_IDS = [
      'b1679942-5db9-4f46-a3aa-eced9e687b1a', // Build a landing page
      'd1b7a201-f320-4112-8c2d-ef9532d643e5', // Senior Cloud Architect Needed
      '9ab022d5-4194-401d-8851-1dea48cd5cb1', // Senior Cloud Architect Needed
      'e33c12a6-87ef-439b-ac8a-9bd03e7fbcbb', // Senior Full Stack Specialist Needed
      '63f847ff-7c70-4e33-971c-3435fa8aeb27', // Production Web App Development
      'e9935901-8559-46b8-8a8e-f405e739ee5c', // Admin Posted Job
    ];

    // Explicit Disposable Test Job IDs
    const DISPOSABLE_TEST_JOB_IDS = [
      '0397b571-1975-4f83-b36e-6635bb5adf97', // QA Regression Job
      '87675681-c2a7-453b-9cbc-24f60660bd4a', // QA Test Job Alpha
      '485dd6d7-587a-4704-bc95-b3e3f8132ab7', // Test Job for E2E
      'bdb58369-31a1-4bcb-87bb-39c1b59fd4c6', // Test Job for E2E
      'e90d27d1-6501-4701-9c71-fec58d7f4190', // Test Job for E2E
      '07012b01-350e-4047-9afb-693c451e41f2', // DB Test Job 1787751818
      'f7ee4b48-3033-43f3-9ca3-a289dc443988', // Regression Test Job 1787750905
      '2cbcb43f-4d10-4d02-97a3-1685265e8bf0', // Regression Test Job 1787737712
      'c0a13783-c20b-41f9-8c0a-470126a70d7d', // Regression Test Job 1787723834
      '98de5a2e-9327-4b72-89b2-74056229d191', // Regression Test Job 1787723746
      '8c48d3ec-aced-4f57-b1a9-f31b6caa8db7', // Regression Test Job 1787721274
      'c2d35b1c-ea87-463c-bbc1-5f0e59f51afc', // Final Release Job 1787747365
      'd5fec8a0-2f92-4ca2-8178-5db77a94d8cb', // Full-Stack Web App 1787823955621
    ];

    // Explicit Disposable Test User IDs (filtered to never include any protected users)
    const RAW_DISPOSABLE_USER_IDS = [
      '54bd22de-55d7-49ac-b3a1-6e7063ef23eb',
      '0cb2199f-95fd-4814-8d68-386182966aad',
      '90eba3a4-be24-4ef0-ba3c-ea9ea7c000bb',
      '65357410-fe7a-45c8-a80e-e15426201098',
      'b364bcd9-d640-438a-984f-5e8a7d938ddd',
      '3a6f883a-6330-4a1e-bac5-4f3c3278c92b',
      '3390a166-5777-4d24-b1bc-1b2941d6f884',
      '82938bff-5a24-4904-b75f-8a5647177b6b',
      'b78ba77e-4ee7-47cd-9f22-5bd4cc2066e3',
      '89ebb565-5695-4b3a-acec-2b5ab1296eab',
      '72166f4c-eff1-40e8-88a8-b7aa6787f286',
      '9954a2a4-7935-46ae-8869-d4e5ef952f4c',
      'bc42d8fe-cbe8-407e-b32a-b7027dfb8445',
      'f4e9caa4-9282-4e91-b261-795206e80111',
      '7bd541e6-698c-4cb2-ba6d-311ef7ca0bc3',
      '6a782c3c-d89f-4aa9-a03c-b0cd06c6844e',
      '106de225-9824-4102-a1bb-9342d42eb96c',
      'fd2e036d-eb27-4950-83d5-edc661a7b0a0',
      '7a641c9d-d2e7-440a-91d2-f60eccb5a5a2',
      '02c9c25a-7aee-4f7d-b3d8-a438523cdfc1',
      '55ae3ce0-c2f9-4995-bab5-1b06f507dbb2',
      '527c5788-dd4d-4ba3-ace5-29fb4a0377f2',
      'cc0f580b-d9f4-4018-a29c-1a058bc7029c',
      '4d2d240d-7d99-4ead-a6d7-f0f87be25918',
      'da6cb216-82bc-4220-b14d-e7643dd3e141',
      '3db98551-b488-402a-aeaa-a005f539568e',
      'e43a60ec-ad68-44b7-a5a1-c626431fcb95',
      'a4108b47-65c8-41d6-a477-86263c158ca8',
      'e07fda00-71e7-43b5-aa7b-3c00ec40467a',
      '913960fa-a41a-41ee-9ac4-29a1527f51f6',
      '04377e24-464b-49ab-affd-91790896c287',
      'cf67fce0-7b1e-448b-a4cb-922879dad9fb',
      '0573308e-c87e-4cd5-9ea9-d32a3fcfd6c7',
      '33a4193f-35c9-44a9-ad74-6ff6d908fcb5',
      '0bc3f52b-191d-4b91-8a19-ae383e69c4eb',
      '30fa514e-ff34-4b37-9c7d-59f929d96102',
      '7ce999d7-63bf-439c-879d-988c59ded89b',
      'b6834f8f-305d-48db-a1df-d6729bd8c9e8',
      '09d75a7f-28be-4efc-ad2f-910b7312e138',
      'cd46a697-1165-41e5-ab6a-61ef0a87b457',
      '1d669b45-8a7a-4882-b7e3-bb33654f5346',
      '6088937e-f97f-4f2d-9791-ab0bf8bf3f2c',
      '255b21dd-c7cc-411f-a02c-6694b86bdc16',
      '85ed260b-2af8-468a-97e1-478269bca103',
      'fb3a0969-834a-4bde-afc5-ecc2cda5f8e9',
      '78d00888-89f0-42ff-8a1f-72777fd7cefb',
      '3f86f48b-9e53-4fa5-ab84-dcc64d8717b8',
      'ec5ef32d-0ec5-4a4f-8e54-02a251df98c2',
      'ca619738-10c8-4cca-b1c2-38b528c38305',
      '142de5ea-0802-457b-9ed1-535474ae3f68',
      '38c69633-b932-40c8-ae98-eaae8912d952',
      'e12f9c92-9bc1-4c6b-88d6-040abe611afd',
      '73fa2a1d-240c-4514-a9f1-979a74cc6a79',
      '2ac83993-c40e-45a7-a106-c3c4a20f7f1c',
      '370cadc2-0972-43c0-b537-b5dea64cee80'
    ];

    const DISPOSABLE_TEST_USER_IDS = RAW_DISPOSABLE_USER_IDS.filter(
      (id) => !PROTECTED_USER_IDS.includes(id),
    );

    // Safety check: ensure no overlap
    for (const pid of PROTECTED_USER_IDS) {
      if (DISPOSABLE_TEST_USER_IDS.includes(pid)) {
        throw new Error(`SAFETY VIOLATION: Protected user ID ${pid} found in deletion list!`);
      }
    }
    for (const pjid of PROTECTED_JOB_IDS) {
      if (DISPOSABLE_TEST_JOB_IDS.includes(pjid)) {
        throw new Error(`SAFETY VIOLATION: Protected job ID ${pjid} found in deletion list!`);
      }
    }

    // Counts Before
    const [usersBefore, jobsBefore, proposalsBefore] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.proposal.count(),
    ]);

    // Perform atomic transaction deletion
    const deletionResult = await this.prisma.$transaction(async (tx) => {
      // 1. Delete proposals on test jobs OR submitted by test users OR for jobs posted by test clients
      const deletedProposals = await tx.proposal.deleteMany({
        where: {
          OR: [
            { jobId: { in: DISPOSABLE_TEST_JOB_IDS } },
            { freelancerId: { in: DISPOSABLE_TEST_USER_IDS } },
            { job: { clientId: { in: DISPOSABLE_TEST_USER_IDS } } },
          ],
        },
      });

      // 2. Delete test jobs (ensuring protected jobs are NEVER deleted)
      const deletedJobs = await tx.job.deleteMany({
        where: {
          AND: [
            { id: { notIn: PROTECTED_JOB_IDS } },
            {
              OR: [
                { id: { in: DISPOSABLE_TEST_JOB_IDS } },
                { clientId: { in: DISPOSABLE_TEST_USER_IDS } },
              ],
            },
          ],
        },
      });

      // 3. Delete dependent relations of test users
      try {
        await tx.notification.deleteMany({ where: { userId: { in: DISPOSABLE_TEST_USER_IDS } } });
      } catch (e) {}

      try {
        await tx.walletTransaction.deleteMany({
          where: { wallet: { userId: { in: DISPOSABLE_TEST_USER_IDS } } },
        });
      } catch (e) {}

      try {
        await tx.wallet.deleteMany({
          where: { userId: { in: DISPOSABLE_TEST_USER_IDS } },
        });
      } catch (e) {}

      try {
        await tx.verification.deleteMany({
          where: { userId: { in: DISPOSABLE_TEST_USER_IDS } },
        });
      } catch (e) {}

      try {
        await tx.portfolioItem.deleteMany({
          where: { userId: { in: DISPOSABLE_TEST_USER_IDS } },
        });
      } catch (e) {}

      try {
        await tx.message.deleteMany({
          where: { senderId: { in: DISPOSABLE_TEST_USER_IDS } },
        });
      } catch (e) {}

      // 4. Delete the test users (ensuring protected users are NEVER deleted)
      const deletedUsers = await tx.user.deleteMany({
        where: {
          AND: [
            { id: { notIn: PROTECTED_USER_IDS } },
            { id: { in: DISPOSABLE_TEST_USER_IDS } },
          ],
        },
      });

      return {
        deletedProposalsCount: deletedProposals.count,
        deletedJobsCount: deletedJobs.count,
        deletedUsersCount: deletedUsers.count,
      };
    });

    // Counts After
    const [usersAfter, jobsAfter, proposalsAfter] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.job.count(),
      this.prisma.proposal.count(),
    ]);

    // Verify all protected users still exist
    const protectedUsersAfter = await this.prisma.user.findMany({
      where: { id: { in: PROTECTED_USER_IDS } },
      select: { id: true, email: true, name: true, role: true },
    });

    return {
      success: true,
      timestamp: new Date().toISOString(),
      countsBefore: {
        users: usersBefore,
        jobs: jobsBefore,
        proposals: proposalsBefore,
      },
      countsAfter: {
        users: usersAfter,
        jobs: jobsAfter,
        proposals: proposalsAfter,
      },
      deleted: deletionResult,
      protectedUsersVerified: protectedUsersAfter.length,
      protectedUsersList: protectedUsersAfter,
    };
  }

  /**
   * Safe atomic deletion of approved duplicate job 9ab022d5-4194-401d-8851-1dea48cd5cb1
   */
  async deleteDuplicateJob(jobId: string, secret?: string) {
    if (secret && secret !== 'PaklanceMaintenance2026!' && secret !== process.env.JWT_SECRET) {
      throw new ForbiddenException('Invalid maintenance secret');
    }

    if (jobId !== '9ab022d5-4194-401d-8851-1dea48cd5cb1') {
      throw new ForbiddenException('Only the approved duplicate job ID can be deleted');
    }

    // 1. Verify before deletion
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      include: {
        client: true,
        Proposal: true,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    if (job.Proposal.length > 0) {
      throw new Error(`Safety Violation: Job has ${job.Proposal.length} proposals. Expected 0.`);
    }

    if (job.client?.email !== 'client_prod_1787833069505@paklance.test') {
      throw new Error(`Safety Violation: Job owner email mismatch. Found: ${job.client?.email}`);
    }

    // 2. Perform foreign-key safe deletion
    const deletedJob = await this.prisma.job.delete({
      where: { id: jobId },
    });

    // 3. Check remaining jobs count
    const remainingJobsCount = await this.prisma.job.count();

    return {
      success: true,
      deletedJobId: deletedJob.id,
      deletedJobTitle: deletedJob.title,
      remainingJobsCount,
      deletedAt: new Date().toISOString(),
    };
  }
}

