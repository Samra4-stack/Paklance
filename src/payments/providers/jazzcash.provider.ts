import * as crypto from 'crypto';
import { Injectable } from '@nestjs/common';

export interface JazzCashCheckoutPayload {
  pp_Version: string;
  pp_TxnType: string;
  pp_Language: string;
  pp_MerchantID: string;
  pp_Password: string;
  pp_TxnRefNo: string;
  pp_Amount: string;
  pp_TxnCurrency: string;
  pp_TxnDateTime: string;
  pp_BillReference: string;
  pp_Description: string;
  pp_TxnExpiryDateTime: string;
  pp_ReturnURL: string;
  pp_SecureHash?: string;
  [key: string]: string | undefined;
}

@Injectable()
export class JazzCashProvider {
  private get merchantId(): string {
    return process.env.JAZZCASH_MERCHANT_ID || '';
  }

  private get password(): string {
    return process.env.JAZZCASH_PASSWORD || '';
  }

  private get integritySalt(): string {
    return process.env.JAZZCASH_INTEGRITY_SALT || '';
  }

  get isConfigured(): boolean {
    return !!(this.merchantId && this.password && this.integritySalt);
  }

  get checkoutUrl(): string {
    const isProd = process.env.JAZZCASH_ENVIRONMENT === 'production';
    return isProd
      ? 'https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/'
      : 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
  }

  /**
   * Generates official HMAC-SHA256 secure hash for JazzCash
   * Algorithm: Sort keys alphabetically, concatenate salt with values separated by '&', then compute HMAC-SHA256 using salt as key.
   */
  generateSecureHash(params: Record<string, string>): string {
    if (!this.integritySalt) return '';

    const sortedKeys = Object.keys(params)
      .filter((k) => k !== 'pp_SecureHash' && params[k] !== undefined && params[k] !== '')
      .sort();

    let stringToHash = this.integritySalt;
    for (const key of sortedKeys) {
      stringToHash += `&${params[key]}`;
    }

    return crypto
      .createHmac('sha256', this.integritySalt)
      .update(stringToHash)
      .digest('hex')
      .toUpperCase();
  }

  /**
   * Builds the official checkout form payload for JazzCash redirection
   */
  createCheckoutPayload(params: {
    referenceId: string;
    amount: number;
    description: string;
    returnUrl: string;
  }): { url: string; payload: JazzCashCheckoutPayload; isConfigured: boolean } {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const txnDateTime = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

    const exp = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours expiry
    const expiryDateTime = `${exp.getFullYear()}${pad(exp.getMonth() + 1)}${pad(exp.getDate())}${pad(exp.getHours())}${pad(exp.getMinutes())}${pad(exp.getSeconds())}`;

    // JazzCash requires amount without decimal point (e.g. PKR 1000 is 100000)
    const amountPaisa = Math.round(params.amount * 100).toString();

    const payload: JazzCashCheckoutPayload = {
      pp_Version: '1.1',
      pp_TxnType: 'MPAY',
      pp_Language: 'EN',
      pp_MerchantID: this.merchantId || 'MERCHANT_PENDING_ONBOARDING',
      pp_Password: this.password || 'PASSWORD_PENDING',
      pp_TxnRefNo: params.referenceId,
      pp_Amount: amountPaisa,
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: txnDateTime,
      pp_BillReference: params.referenceId,
      pp_Description: params.description.slice(0, 100),
      pp_TxnExpiryDateTime: expiryDateTime,
      pp_ReturnURL: params.returnUrl,
    };

    if (this.isConfigured) {
      payload.pp_SecureHash = this.generateSecureHash(payload as Record<string, string>);
    }

    return {
      url: this.checkoutUrl,
      payload,
      isConfigured: this.isConfigured,
    };
  }

  /**
   * Verifies incoming JazzCash webhook/callback signature
   */
  verifyCallback(payload: Record<string, string>): {
    valid: boolean;
    responseCode: string;
    responseMessage: string;
    txnRefNo: string;
    amount: number;
    gatewayTxnId: string;
  } {
    const receivedHash = payload.pp_SecureHash || '';
    const responseCode = payload.pp_ResponseCode || '';
    const responseMessage = payload.pp_ResponseMessage || '';
    const txnRefNo = payload.pp_TxnRefNo || payload.pp_BillReference || '';
    const rawAmount = Number(payload.pp_Amount || '0');
    const amount = rawAmount > 0 ? rawAmount / 100 : 0;
    const gatewayTxnId = payload.pp_RetreivalReferenceNo || payload.pp_TxnRefNo || '';

    let valid = false;
    if (this.isConfigured) {
      const calculatedHash = this.generateSecureHash(payload);
      valid = calculatedHash.toUpperCase() === receivedHash.toUpperCase();
    } else {
      // In test/development mode without merchant salt, check presence of ref
      valid = !!txnRefNo;
    }

    return {
      valid,
      responseCode,
      responseMessage,
      txnRefNo,
      amount,
      gatewayTxnId,
    };
  }
}
