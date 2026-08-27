import { Controller, Get, Patch, Param, UseGuards, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Get all my notifications' })
  @Get('me')
  getMyNotifications(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.notificationsService.getMyNotifications(userId);
  }

  @ApiOperation({ summary: 'Mark all notifications as read' })
  @Patch('read-all')
  markAllAsRead(@Req() req: Request) {
    const userId = (req as any).user.id;
    return this.notificationsService.markAllAsRead(userId);
  }

  @ApiOperation({ summary: 'Mark a single notification as read' })
  @Patch(':id/read')
  markAsRead(@Req() req: Request, @Param('id') id: string) {
    const userId = (req as any).user.id;
    return this.notificationsService.markAsRead(userId, id);
  }
}
