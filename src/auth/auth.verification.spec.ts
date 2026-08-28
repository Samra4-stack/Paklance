import { BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

describe('AuthService - Email Verification & Login Tests', () => {
  let authService: AuthService;
  let usersService: Partial<UsersService>;
  let jwtService: Partial<JwtService>;
  let prisma: any;
  let emailService: Partial<EmailService>;

  const passwordPlain = 'SecurePass123!';
  let passwordHashed: string;

  beforeAll(async () => {
    passwordHashed = await bcrypt.hash(passwordPlain, 10);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    usersService = {
      create: jest.fn().mockImplementation(async (data) => {
        return {
          id: 'user-uuid-1',
          email: data.email,
          role: data.role || Role.SPECIALIST,
          isEmailVerified: data.isEmailVerified ?? false,
          emailVerifyOtp: data.emailVerifyOtp,
          emailVerifyExpires: data.emailVerifyExpires,
          emailVerifyLastSentAt: data.emailVerifyLastSentAt,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token-xyz'),
    };

    emailService = {
      sendVerificationOtp: jest.fn().mockResolvedValue(undefined),
    };

    authService = new AuthService(
      usersService as UsersService,
      jwtService as JwtService,
      prisma as PrismaService,
      emailService as EmailService,
    );
  });

  describe('Registration Flow', () => {
    it('should register user with unverified state, generate 6-digit OTP, and dispatch email without exposing OTP', async () => {
      const res = await authService.register({
        email: 'test@example.com',
        password: passwordPlain,
        role: Role.SPECIALIST,
      });

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          isEmailVerified: false,
          emailVerifyOtp: expect.stringMatching(/^\d{6}$/),
          emailVerifyExpires: expect.any(Date),
        }),
      );

      expect(emailService.sendVerificationOtp).toHaveBeenCalledWith(
        'test@example.com',
        expect.stringMatching(/^\d{6}$/),
      );

      // Verify OTP is NEVER exposed in the response
      expect(res.requiresVerification).toBe(true);
      expect(res.email).toBe('test@example.com');
      expect((res as any).otp).toBeUndefined();
      expect((res as any).emailVerifyOtp).toBeUndefined();
    });
  });

  describe('Login Restriction for Unverified Accounts', () => {
    it('should reject login for unverified accounts with 401 error', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'unverified@example.com',
        passwordHash: passwordHashed,
        isEmailVerified: false,
        role: Role.SPECIALIST,
      });

      await expect(
        authService.login({
          email: 'unverified@example.com',
          password: passwordPlain,
        }),
      ).rejects.toThrow(new UnauthorizedException('Email not verified. Please verify your email before logging in.'));
    });

    it('should allow login for verified accounts', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'verified@example.com',
        passwordHash: passwordHashed,
        isEmailVerified: true,
        role: Role.SPECIALIST,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await authService.login({
        email: 'verified@example.com',
        password: passwordPlain,
      });

      expect(res.accessToken).toBe('mock-jwt-token-xyz');
      expect(res.user.email).toBe('verified@example.com');
    });
  });

  describe('Email Verification Flow', () => {
    it('should verify OTP, activate account, clear OTP, and issue JWT', async () => {
      const validOtp = '654321';
      const futureExpiry = new Date(Date.now() + 10 * 60 * 1000);

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'verify@example.com',
        isEmailVerified: false,
        emailVerifyOtp: validOtp,
        emailVerifyExpires: futureExpiry,
        role: Role.SPECIALIST,
      });

      prisma.user.update.mockResolvedValueOnce({
        id: 'user-1',
        email: 'verify@example.com',
        isEmailVerified: true,
        role: Role.SPECIALIST,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await authService.verifyEmail({
        email: 'verify@example.com',
        otp: validOtp,
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          isEmailVerified: true,
          emailVerifyOtp: null,
          emailVerifyExpires: null,
        },
      });

      expect(res.accessToken).toBe('mock-jwt-token-xyz');
      expect(res.user.email).toBe('verify@example.com');
    });

    it('should reject invalid OTP with 400 error', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'verify@example.com',
        isEmailVerified: false,
        emailVerifyOtp: '111111',
        emailVerifyExpires: new Date(Date.now() + 10 * 60 * 1000),
      });

      await expect(
        authService.verifyEmail({
          email: 'verify@example.com',
          otp: '999999',
        }),
      ).rejects.toThrow(new BadRequestException('Invalid verification code.'));
    });

    it('should reject expired OTP with 400 error', async () => {
      const expiredTime = new Date(Date.now() - 1000); // in the past

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'verify@example.com',
        isEmailVerified: false,
        emailVerifyOtp: '111111',
        emailVerifyExpires: expiredTime,
      });

      await expect(
        authService.verifyEmail({
          email: 'verify@example.com',
          otp: '111111',
        }),
      ).rejects.toThrow(new BadRequestException('Verification code has expired. Please request a new one.'));
    });
  });

  describe('Resend Verification & Rate Limiting', () => {
    it('should enforce 60-second rate limit between resend requests', async () => {
      const recentSentAt = new Date(Date.now() - 20 * 1000); // 20s ago

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'rate@example.com',
        isEmailVerified: false,
        emailVerifyLastSentAt: recentSentAt,
      });

      await expect(
        authService.resendVerification({ email: 'rate@example.com' }),
      ).rejects.toThrow(/Please wait \d+ seconds before requesting another verification code\./);
    });

    it('should allow resend after 60 seconds have elapsed', async () => {
      const pastSentAt = new Date(Date.now() - 65 * 1000); // 65s ago

      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        email: 'rate@example.com',
        isEmailVerified: false,
        emailVerifyLastSentAt: pastSentAt,
      });

      prisma.user.update.mockResolvedValueOnce({ id: 'user-1' });

      const res = await authService.resendVerification({ email: 'rate@example.com' });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            emailVerifyOtp: expect.stringMatching(/^\d{6}$/),
            emailVerifyExpires: expect.any(Date),
            emailVerifyLastSentAt: expect.any(Date),
          }),
        }),
      );

      expect(emailService.sendVerificationOtp).toHaveBeenCalled();
      expect(res.message).toMatch(/verification code has been sent/);
    });
  });
});
