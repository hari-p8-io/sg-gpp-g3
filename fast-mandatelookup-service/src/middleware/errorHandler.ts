import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function errorHandler(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    next(error);
    return;
  }

  const errorMessage = error instanceof Error ? error.message : 'Internal server error';
  const errorStack = error instanceof Error ? error.stack : undefined;

  logger.error('Unhandled error in request', {
    error: errorMessage,
    stack: errorStack,
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    clientIp: req.ip,
    body: req.body
  });

  // Determine status code
  let statusCode = 500;
  let errorCode = 'INTERNAL_ERROR';

  if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    errorCode = 'UNAUTHORIZED';
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
    errorCode = 'FORBIDDEN';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    errorCode = 'NOT_FOUND';
  } else if (error.name === 'TimeoutError') {
    statusCode = 408;
    errorCode = 'TIMEOUT';
  } else if (error.name === 'TooManyRequestsError') {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
  } else if (error.name === 'ServiceUnavailableError') {
    statusCode = 503;
    errorCode = 'SERVICE_UNAVAILABLE';
  }

  const errorResponse = {
    error: {
      code: errorCode,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
    },
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method
  };

  res.status(statusCode).json(errorResponse);
} 