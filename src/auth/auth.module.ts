import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './strategies/jwt.strategy';

import { PrismaModule } from '../prisma/prisma.module';
import { EmailService } from './email.service';

/**
 * Resolves the JWT secret from the environment and throws a descriptive error
 * at startup if it is missing. This prevents the application from running with
 * an insecure hard-coded fallback secret.
 */
function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error(
      '[AuthModule] JWT_SECRET environment variable is not set. ' +
        'Refusing to start with an insecure default. ' +
        'Set JWT_SECRET in your .env file or deployment environment.',
    );
  }
  return secret;
}

@Module({
  imports: [
    UsersModule,
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: resolveJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, EmailService],
  exports: [AuthService, EmailService],
})
export class AuthModule {}
