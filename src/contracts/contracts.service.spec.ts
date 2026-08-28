import { Test, TestingModule } from '@nestjs/testing';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('ContractsService File Operations', () => {
  let service: ContractsService;
  let prisma: PrismaService;

  const mockPrisma = {
    contract: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    contractFile: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  const mockContract = {
    id: 'contract-123',
    clientId: 'client-1',
    specialistId: 'spec-1',
    status: 'ACTIVE',
  };

  it('should upload a valid file when user is the client', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(mockContract);
    mockPrisma.contractFile.create.mockResolvedValue({
      id: 'file-1',
      contractId: 'contract-123',
      uploaderId: 'client-1',
      filename: '123_test.pdf',
      originalName: 'test.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      fileData: 'data:application/pdf;base64,AAAA',
      createdAt: new Date(),
    });

    const result = await service.uploadContractFile('client-1', 'contract-123', {
      originalname: 'test.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      fileData: 'data:application/pdf;base64,AAAA',
    });

    expect(result.id).toBe('file-1');
    expect(mockPrisma.contractFile.create).toHaveBeenCalled();
  });

  it('should reject file upload when user is not a participant', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(mockContract);

    await expect(
      service.uploadContractFile('stranger-999', 'contract-123', {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        fileData: 'data:application/pdf;base64,AAAA',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject file upload when file size exceeds 3MB', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(mockContract);

    await expect(
      service.uploadContractFile('client-1', 'contract-123', {
        originalname: 'big_video.mp4',
        mimetype: 'video/mp4',
        size: 10 * 1024 * 1024,
        fileData: 'data:video/mp4;base64,AAAA',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject file upload with unsupported extension', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(mockContract);

    await expect(
      service.uploadContractFile('client-1', 'contract-123', {
        originalname: 'script.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
        fileData: 'data:application/octet-stream;base64,AAAA',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should retrieve contract files for a participant', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(mockContract);
    mockPrisma.contractFile.findMany.mockResolvedValue([
      { id: 'f-1', originalName: 'deliverable.pdf' },
    ]);

    const files = await service.getContractFiles('spec-1', 'contract-123');
    expect(files.length).toBe(1);
    expect(files[0].originalName).toBe('deliverable.pdf');
  });

  it('should reject getContractFiles for non-participant', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(mockContract);

    await expect(
      service.getContractFiles('stranger-999', 'contract-123'),
    ).rejects.toThrow(ForbiddenException);
  });
});
