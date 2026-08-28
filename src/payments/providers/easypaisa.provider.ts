import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';

export interface EasypaisaCheckoutPayload {
  storeId: string;
  amount: string;
  postBackURL: string;
  orderRefNum: string;
  expiryDate: string;
  merchantHashedReq?: string;
  autoRedirect: string;
  paymentMethod: string;
  emailAddr?: string;
  mobileNum?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class EasypaisaProvider {
  private get storeId(): string {
    return process.env.EASYPAISA_STORE_ID || '';
  }

  private get hashKey(): string {
    return process.env.EASYPAISA_HASH_KEY || '';
  }

  get isConfigured(): boolean {
    return !!(this.storeId && this.hashKey);
  }

  get checkoutUrl(): string {
    const isProd = process.env.EASYPAISA_ENVIRONMENT === 'production';
    return isProd
      ? 'https://easypay.easypaisa.com.pk/easypay/Index.jsf'
      : 'https://easypaystg.easypaisa.com.pk/easypay/Index.jsf';
  }

  /**
   * Generates hash for Easypaisa hosted checkout
   */
  generateHashedReq(params: Record<string, string>): string {
    if (!this.hashKey) return '';
    // Format: amount=1500.0&autoRedirect=1&expiryDate=...&orderRefNum=...&postBackURL=...&storeId=...
    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'merchantHashedReq' && params[k] !== undefined && params[k] !== '')
      .sort();

    const paramString = sortedKeys.map((k) => `${k}=${params[k]}`).join('&');

    return crypto
      .createHmac('sha256', this.hashKey)
      .update(paramString)
      .digest('hex');
  }

  /**
   * Builds the official checkout payload for Easypaisa
   */
  createCheckoutPayload(params: {
    referenceId: string;
    amount: number;
    description: string;
    returnUrl: string;
  }): { url: string; payload: EasypaisaCheckoutPayload; isConfigured: boolean } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const exp = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const expiryDate = `${exp.getFullYear()}${pad(exp.getMonth() + 1)}${pad(exp.getDate())} ${pad(exp.getHours())}${pad(exp.getMinutes())}${pad(exp.getSeconds())}`;

    const payload: EasypaisaCheckoutPayload = {
      storeId: this.storeId || 'STORE_PENDING_ONBOARDING',
      amount: params.amount.toFixed(1),
      postBackURL: params.returnUrl,
      orderRefNum: params.referenceId,
      expiryDate,
      autoRedirect: '1',
      paymentMethod: 'MA_PAYMENT_METHOD',
    };

    if (this.isConfigured) {
      payload.merchantHashedReq = this.generateHashedReq(payload as Record<string, string>);
    }

    return {
      url: this.checkoutUrl,
      payload,
      isConfigured: this.isConfigured,
    };
  }

  /**
   * Verifies incoming Easypaisa webhook/callback
   */
  verifyCallback(payload: Record<string, string>): {
    valid: boolean;
    status: string;
    desc: string;
    orderRefNum: string;
    amount: number;
    transactionId: string;
  } {
    const status = payload.status || payload.auth_status || '';
    const desc = payload.desc || payload.message || '';
    const orderRefNum = payload.orderRefNum || payload.order_id || '';
    const amount = Number(payload.amount || payload.paid_amount || '0');
    const transactionId = payload.transaction_id || payload.tx_id || '';

    let valid = false;
    if (this.isConfigured) {
      const receivedHash = payload.merchantHashedReq || payload.checksum || '';
      const calculatedHash = this.generateHashedReq(payload);
      valid = calculatedHash === receivedHash;
    } else {
      valid = !!orderRefNum;
    }

    return {
      valid,
      status,
      desc,
      orderRefNum,
      amount,
      transactionId,
    };
  }
}
