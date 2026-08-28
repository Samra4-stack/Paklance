import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    email: string;
    password: string;
    role?: Role;
    isEmailVerified?: boolean;
    emailVerifyOtp?: string;
    emailVerifyExpires?: Date;
    emailVerifyLastSentAt?: Date;
  }): Promise<Omit<User, 'passwordHash'>> {
    await this.prisma.ensureSchemaMigrated?.();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    let user: any;
    try {
      user = await this.prisma.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: data.role || Role.SPECIALIST,
          isEmailVerified: data.isEmailVerified ?? false,
          emailVerifyOtp: data.emailVerifyOtp,
          emailVerifyExpires: data.emailVerifyExpires,
          emailVerifyLastSentAt: data.emailVerifyLastSentAt,
        },
      });
    } catch (createErr: any) {
      if (createErr?.code === 'P2002' || createErr instanceof ConflictException) {
        throw new ConflictException('User with this email already exists');
      }
      try {
        user = await this.prisma.user.create({
          data: {
            email: data.email,
            passwordHash,
            role: data.role || Role.SPECIALIST,
          },
        });
      } catch (fallbackErr: any) {
        throw createErr;
      }
    }

    const { passwordHash: _, ...result } = user;
    return result;
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findByEmail(email: string) {
    await this.prisma.ensureSchemaMigrated?.();
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async update(
    id: string,
    data: { email?: string; role?: Role; password?: string },
  ) {
    await this.findOne(id);

    const updateData: any = {};
    if (data.email) updateData.email = data.email;
    if (data.role) updateData.role = data.role;
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.user.delete({
      where: { id },
      select: {
        id: true,
        email: true,
      },
    });
  }
}
