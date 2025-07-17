import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { config } from '../config/default';
import { MandateLookupService } from '../services/mandateLookupService';

export class HealthController {
  private mandateLookupService: MandateLookupService;
  private startTime: Date;

  constructor() {
    this.mandateLookupService = new MandateLookupService();
    this.startTime = new Date();
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const healthResult = await this.mandateLookupService.healthCheck();
      
      const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
      const uptimeFormatted = this.formatUptime(uptime);

      const healthResponse = {
        status: healthResult.status === 'SERVING' ? 'healthy' : 'unhealthy',
        message: healthResult.message,
        serviceVersion: '1.0.0',
        mockMode: config.useMockMandates,
        timestamp: new Date().toISOString(),
        uptime: uptimeFormatted,
        environment: config.environment,
        port: config.port
      };

      // Return 200 for healthy, 503 for unhealthy
      const statusCode = healthResult.status === 'SERVING' ? 200 : 503;
      
      logger.debug('Health check requested', {
        status: healthResponse.status,
        uptime: uptimeFormatted,
        userAgent: req.get('User-Agent'),
        clientIp: req.ip
      });

      res.status(statusCode).json(healthResponse);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Health check failed', {
        error: errorMessage,
        userAgent: req.get('User-Agent'),
        clientIp: req.ip
      });

      const errorResponse = {
        status: 'unhealthy',
        message: `Health check failed: ${errorMessage}`,
        serviceVersion: '1.0.0',
        mockMode: config.useMockMandates,
        timestamp: new Date().toISOString(),
        uptime: this.formatUptime(Math.floor((Date.now() - this.startTime.getTime()) / 1000)),
        environment: config.environment,
        port: config.port
      };

      res.status(503).json(errorResponse);
    }
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m ${secs}s`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
} 