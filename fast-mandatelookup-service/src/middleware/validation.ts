import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateMandateLookupRequest(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  const errors: ValidationError[] = [];
  const body = req.body;

  // Required fields validation
  if (!body.messageId || typeof body.messageId !== 'string' || body.messageId.trim().length === 0) {
    errors.push({ field: 'messageId', message: 'messageId is required and must be a non-empty string' });
  }

  if (!body.puid || typeof body.puid !== 'string' || body.puid.trim().length === 0) {
    errors.push({ field: 'puid', message: 'puid is required and must be a non-empty string' });
  }

  if (!body.messageType || typeof body.messageType !== 'string' || body.messageType.trim().length === 0) {
    errors.push({ field: 'messageType', message: 'messageType is required and must be a non-empty string' });
  }

  if (!body.debtorAccount || typeof body.debtorAccount !== 'string' || body.debtorAccount.trim().length === 0) {
    errors.push({ field: 'debtorAccount', message: 'debtorAccount is required and must be a non-empty string' });
  }

  if (!body.creditorAccount || typeof body.creditorAccount !== 'string' || body.creditorAccount.trim().length === 0) {
    errors.push({ field: 'creditorAccount', message: 'creditorAccount is required and must be a non-empty string' });
  }

  if (!body.amount || typeof body.amount !== 'string' || parseFloat(body.amount) <= 0) {
    errors.push({ field: 'amount', message: 'amount is required and must be a positive number string' });
  }

  if (!body.currency || typeof body.currency !== 'string' || body.currency.trim().length !== 3) {
    errors.push({ field: 'currency', message: 'currency is required and must be a 3-character currency code' });
  }

  // Optional fields validation
  if (body.mandateId !== undefined && (typeof body.mandateId !== 'string' || body.mandateId.trim().length === 0)) {
    errors.push({ field: 'mandateId', message: 'mandateId must be a non-empty string if provided' });
  }

  if (body.xmlPayload !== undefined && typeof body.xmlPayload !== 'string') {
    errors.push({ field: 'xmlPayload', message: 'xmlPayload must be a string if provided' });
  }

  if (body.metadata !== undefined && (typeof body.metadata !== 'object' || Array.isArray(body.metadata))) {
    errors.push({ field: 'metadata', message: 'metadata must be an object if provided' });
  }

  // Business logic validation
  if (body.messageType === 'PACS.003' && (!body.mandateId || body.mandateId.trim().length === 0)) {
    errors.push({ field: 'mandateId', message: 'mandateId is required for PACS.003 (DDI) message type' });
  }

  // Account number format validation (basic)
  if (body.debtorAccount && !/^\d{8,20}$/.test(body.debtorAccount)) {
    errors.push({ field: 'debtorAccount', message: 'debtorAccount must be 8-20 digits' });
  }

  if (body.creditorAccount && !/^\d{8,20}$/.test(body.creditorAccount)) {
    errors.push({ field: 'creditorAccount', message: 'creditorAccount must be 8-20 digits' });
  }

  // Currency validation (Singapore focus)
  const supportedCurrencies = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD'];
  if (body.currency && !supportedCurrencies.includes(body.currency.toUpperCase())) {
    errors.push({ field: 'currency', message: `currency must be one of: ${supportedCurrencies.join(', ')}` });
  }

  // Amount validation
  if (body.amount) {
    const amount = parseFloat(body.amount);
    if (amount > 1000000) {
      errors.push({ field: 'amount', message: 'amount cannot exceed 1,000,000' });
    }
    if (!/^\d+(\.\d{1,2})?$/.test(body.amount)) {
      errors.push({ field: 'amount', message: 'amount must be in format 0.00 with up to 2 decimal places' });
    }
  }

  if (errors.length > 0) {
    logger.warn('Mandate lookup request validation failed', {
      messageId: body.messageId,
      errors: errors.map(e => `${e.field}: ${e.message}`),
      userAgent: req.get('User-Agent'),
      clientIp: req.ip
    });

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: errors.map(e => `${e.field}: ${e.message}`)
      },
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method
    });
    return;
  }

  // Set defaults for optional fields
  if (!body.metadata) {
    body.metadata = {};
  }

  if (!body.xmlPayload) {
    body.xmlPayload = '';
  }

  logger.debug('Mandate lookup request validation passed', {
    messageId: body.messageId,
    messageType: body.messageType,
    debtorAccount: body.debtorAccount,
    mandateId: body.mandateId
  });

  next();
} 