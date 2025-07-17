import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  
  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    clientIp: req.ip,
    contentLength: req.get('Content-Length'),
    contentType: req.get('Content-Type')
  });

  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk?: any, encoding?: any): Response {
    const processingTime = Date.now() - startTime;
    
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      processingTime,
      contentLength: res.get('Content-Length'),
      userAgent: req.get('User-Agent'),
      clientIp: req.ip
    });

    // Call original end method
    originalEnd.call(this, chunk, encoding);
    return this;
  };

  next();
} 