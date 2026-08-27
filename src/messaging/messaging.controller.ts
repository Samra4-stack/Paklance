import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MessagingService } from './messaging.service';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @ApiOperation({ summary: 'Send a message (creates conversation if needed)' })
  @Post('send')
  sendMessage(@Req() req: Request, @Body() dto: SendMessageDto) {
    const userId = (req as any).user.id;
    return this.messagingService.sendMessage(userId, dto);
  }

  @ApiOperation({ summary: 'Get my conversations' })
  @Get('conversations')
  getMyConversations(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.messagingService.getMyConversations(userId);
  }

  @ApiOperation({ summary: 'Get messages in a conversation' })
  @Get('conversations/:id/messages')
  getConversationMessages(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    return this.messagingService.getConversationMessages(userId, id);
  }
}
