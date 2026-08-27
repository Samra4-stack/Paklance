/**
 * Paklance — Admin User Seed Script
 *
 * Reads credentials exclusively from environment variables.
 * Never hardcodes credentials in source code.
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=SecurePass! npx ts-node prisma/seed.ts
 *   OR set variables in .env.seed (not committed to version control)
 */

import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error(
      '\nERROR: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.\n' +
      'Example:\n' +
      '  $env:ADMIN_EMAIL="admin@paklance.pk"\n' +
      '  $env:ADMIN_PASSWORD="YourSecurePassword!"\n' +
      '  npx ts-node prisma/seed.ts\n',
    );
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('ERROR: ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  console.log(`\nSeeding admin user: ${email}`);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    if (existing.role === Role.ADMIN) {
      console.log('✅ Admin user already exists — updating password hash.');
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.update({
        where: { email },
        data: { passwordHash },
      });
      console.log('✅ Password updated successfully.');
    } else {
      console.error(
        `ERROR: A user with email "${email}" already exists with role "${existing.role}". ` +
        'Choose a different email for the admin account.',
      );
      process.exit(1);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: Role.ADMIN,
      name: 'Paklance Admin',
      headline: 'Platform Administrator',
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
    },
  });

  console.log('\n✅ Admin user created successfully:');
  console.log(`   ID:    ${admin.id}`);
  console.log(`   Email: ${admin.email}`);
  console.log(`   Role:  ${admin.role}`);
  console.log(`   At:    ${admin.createdAt.toISOString()}`);
  console.log('\nStore these credentials securely. They will not be shown again.\n');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
