import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static migrationPromise: Promise<void> | null = null;

  async onModuleInit() {
    await this.$connect();
    await this.ensureSchemaMigrated();
  }

  async ensureSchemaMigrated() {
    if (PrismaService.migrationPromise) return PrismaService.migrationPromise;
    PrismaService.migrationPromise = (async () => {
      const sqlQueries = [
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT DEFAULT '';`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'SPECIALIST';`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "isEmailVerified" BOOLEAN DEFAULT false;`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "emailVerifyOtp" TEXT;`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "emailVerifyExpires" TIMESTAMP(3);`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "emailVerifyLastSentAt" TIMESTAMP(3);`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`,
        `ALTER TABLE IF EXISTS "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT DEFAULT '';`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "role" TEXT DEFAULT 'SPECIALIST';`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "isEmailVerified" BOOLEAN DEFAULT false;`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "emailVerifyOtp" TEXT;`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "emailVerifyExpires" TIMESTAMP(3);`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "emailVerifyLastSentAt" TIMESTAMP(3);`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`,
        `ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;`,
      ];
      for (const q of sqlQueries) {
        try {
          await this.$executeRawUnsafe(q);
        } catch (e) {
          // ignore individual statement errors
        }
      }
    })();
    return PrismaService.migrationPromise;
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
