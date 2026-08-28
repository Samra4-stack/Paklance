import {
  Controller,
  Post,
  Delete,
  Body,
  Get,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushService } from './push.service';

class SaveSubscriptionDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

class DeleteSubscriptionDto {
  endpoint: string;
}

@ApiTags('Push Notifications')
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /** Public — frontend fetches this to configure the PushManager subscription. */
  @ApiOperation({ summary: 'Get VAPID public key for push subscription' })
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  /** Authenticated — save push subscription to DB. */
  @ApiOperation({ summary: 'Register a push subscription for the current user' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  @HttpCode(HttpStatus.CREATED)
  subscribe(@Req() req: Request, @Body() dto: SaveSubscriptionDto) {
    const userId = (req as any).user.id;
    return this.pushService.saveSubscription(userId, dto);
  }

  /** Authenticated — remove push subscription from DB. */
  @ApiOperation({ summary: 'Unregister a push subscription' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('unsubscribe')
  @HttpCode(HttpStatus.OK)
  unsubscribe(@Req() req: Request, @Body() dto: DeleteSubscriptionDto) {
    const userId = (req as any).user.id;
    return this.pushService.deleteSubscription(userId, dto.endpoint);
  }
}
