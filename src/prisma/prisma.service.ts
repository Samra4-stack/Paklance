import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
    try {
      await this.$executeRawUnsafe(`
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT DEFAULT '';
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'SPECIALIST';
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isEmailVerified" BOOLEAN DEFAULT false;
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyOtp" TEXT;
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyExpires" TIMESTAMP(3);
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifyLastSentAt" TIMESTAMP(3);
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
      `);
    } catch (migErr) {
      console.warn('Prisma auto-migration notice:', migErr);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
