import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private initialized = false;

  constructor(private readonly prisma: PrismaService) {
    this.initVapid();
  }

  private initVapid() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:support@paklance.com';

    if (!publicKey || !privateKey) {
      this.logger.warn(
        'VAPID keys not configured — Web Push notifications disabled. ' +
          'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in env.',
      );
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.initialized = true;
    this.logger.log('Web Push / VAPID initialized');
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY || '';
  }

  isEnabled(): boolean {
    return this.initialized;
  }

  /** Save or update a push subscription for a user. */
  async saveSubscription(
    userId: string,
    subscription: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    },
  ) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
  }

  /** Remove a push subscription (user unsubscribed). */
  async deleteSubscription(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { success: true };
  }

  /**
   * Send a Web Push notification to all registered subscriptions
   * for a given user. Automatically removes expired subscriptions.
   */
  async sendPushToUser(
    userId: string,
    payload: {
      title: string;
      body: string;
      tag?: string;
      data?: Record<string, unknown>;
    },
  ) {
    if (!this.initialized) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    if (subscriptions.length === 0) return;

    const payloadStr = JSON.stringify(payload);

    await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payloadStr,
          );
        } catch (err: any) {
          // 410 Gone or 404 = subscription expired / device unregistered — clean up
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            this.logger.log(
              `Removing expired push subscription for user ${userId}`,
            );
            await this.prisma.pushSubscription
              .delete({ where: { id: sub.id } })
              .catch(() => {});
          } else {
            this.logger.warn(
              `Push send failed for user ${userId}: ${err?.message}`,
            );
          }
        }
      }),
    );
  }
}
