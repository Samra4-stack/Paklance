import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from './email.service';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Register creates an unverified user account, generates a secure 6-digit OTP,
   * sends it via EmailService, and requires verification before activation.
   * OTP is NEVER returned in the API response.
   */
  async register(data: { email: string; password: string; role?: Role }) {
    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes validity
    const now = new Date();

    const user = await this.usersService.create({
      email: data.email.toLowerCase().trim(),
      password: data.password,
      role: data.role || Role.SPECIALIST,
      isEmailVerified: false,
      emailVerifyOtp: otp,
      emailVerifyExpires: expiresAt,
      emailVerifyLastSentAt: now,
    });

    try {
      await this.emailService.sendVerificationOtp(user.email, otp);
    } catch (emailErr) {
      console.warn('[EmailService] Dispatch notice:', emailErr);
    }

    return {
      message: 'Verification code sent to your email. Please enter the 6-digit code to activate your account.',
      email: user.email,
      requiresVerification: true,
    };
  }

  /**
   * Verify single-use OTP, validate expiration, activate account, and issue JWT.
   */
  async verifyEmail(data: { email: string; otp: string }) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new NotFoundException('Account not found');
    }

    if (user.isEmailVerified) {
      const token = this.jwtService.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      return {
        message: 'Account is already verified.',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.name,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        accessToken: token,
      };
    }

    if (!user.emailVerifyOtp || !user.emailVerifyExpires) {
      throw new BadRequestException('No verification request found. Please request a new code.');
    }

    if (new Date() > new Date(user.emailVerifyExpires)) {
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    if (user.emailVerifyOtp.trim() !== data.otp.trim()) {
      throw new BadRequestException('Invalid verification code.');
    }

    // Activate user and clear single-use OTP
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerifyOtp: null,
        emailVerifyExpires: null,
      },
    });

    const token = this.jwtService.sign({
      sub: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
    });

    return {
      message: 'Email verified successfully. Account is now active.',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        name: updatedUser.name,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
      accessToken: token,
    };
  }

  /**
   * Resend verification OTP with strict 60-second rate limiting.
   */
  async resendVerification(data: { email: string }) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Return neutral message to prevent user enumeration
      return {
        message: 'If the email exists and is unverified, a new verification code has been dispatched.',
      };
    }

    if (user.isEmailVerified) {
      return {
        message: 'This email account is already verified. Please proceed to log in.',
      };
    }

    const now = Date.now();
    if (user.emailVerifyLastSentAt) {
      const elapsedMs = now - new Date(user.emailVerifyLastSentAt).getTime();
      if (elapsedMs < 60000) {
        const remainingSec = Math.ceil((60000 - elapsedMs) / 1000);
        throw new BadRequestException(
          `Please wait ${remainingSec} seconds before requesting another verification code.`,
        );
      }
    }

    const otp = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(now + 15 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifyOtp: otp,
        emailVerifyExpires: expiresAt,
        emailVerifyLastSentAt: new Date(now),
      },
    });

    try {
      await this.emailService.sendVerificationOtp(user.email, otp);
    } catch (emailErr) {
      console.warn('[EmailService] Resend dispatch notice:', emailErr);
    }

    return {
      message: 'A new 6-digit verification code has been sent to your email.',
    };
  }

  async login(data: { email: string; password: string }) {
    const normalizedEmail = data.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Email not verified. Please verify your email before logging in.',
      );
    }

    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken: token,
    };
  }
}

