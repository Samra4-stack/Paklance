import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagingService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreateConversation(userId: string, otherUserId: string) {
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { participant1Id: userId, participant2Id: otherUserId },
          { participant1Id: otherUserId, participant2Id: userId },
        ],
      },
    });
    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: { participant1Id: userId, participant2Id: otherUserId },
      });
    }
    return conversation;
  }

  async sendMessage(senderId: string, dto: SendMessageDto) {
    const conversation = await this.findOrCreateConversation(
      senderId,
      dto.receiverId,
    );
    return this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId,
        content: dto.content,
      },
    });
  }

  async getMyConversations(userId: string) {
    return this.prisma.conversation.findMany({
      where: {
        OR: [{ participant1Id: userId }, { participant2Id: userId }],
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getConversationMessages(userId: string, conversationId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const isParticipant =
      conversation.participant1Id === userId ||
      conversation.participant2Id === userId;
    if (!isParticipant) throw new ForbiddenException('Not your conversation');

    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
