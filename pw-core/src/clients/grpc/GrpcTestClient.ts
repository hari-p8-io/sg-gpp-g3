import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';

export interface HealthCheckResponse {
  status: number | string;
  timestamp: number;
  message?: string;
}

export interface ServiceConfig {
  serviceName: string;
  serviceUrl: string;
  protoPath: string;
  packageName: string;
  timeout?: number;
}

export class GrpcTestClient<TClient = any> {
  private client: TClient | null = null;
  private connected: boolean = false;
  private config: ServiceConfig;

  constructor(config: ServiceConfig) {
    this.config = {
      timeout: 30000,
      ...config
    };
    this.initializeClient();
  }

  private initializeClient(): void {
    try {
      // Load proto definition
      const packageDefinition = protoLoader.loadSync(this.config.protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
      });

      const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
      
      // Navigate to the service using the package name
      const serviceConstructor = this.getServiceConstructor(protoDescriptor, this.config.packageName);
      
      this.client = new serviceConstructor(
        this.config.serviceUrl,
        grpc.credentials.createInsecure()
      );
      
      this.connected = true;
    } catch (error: any) {
      throw new Error(`Failed to initialize gRPC client: ${error?.message || error}`);
    }
  }

  private getServiceConstructor(protoDescriptor: any, packageName: string): any {
    const parts = packageName.split('.');
    let current = protoDescriptor;
    
    for (const part of parts) {
      if (!current[part]) {
        throw new Error(`Package path ${packageName} not found in proto definition`);
      }
      current = current[part];
    }
    
    return current;
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }
    
    this.initializeClient();
  }

  async disconnect(): Promise<void> {
    if (this.client && typeof (this.client as any).close === 'function') {
      (this.client as any).close();
    }
    this.connected = false;
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    return new Promise((resolve, reject) => {
      if (!this.client || typeof (this.client as any).HealthCheck !== 'function') {
        reject(new Error('HealthCheck method not available'));
        return;
      }

      (this.client as any).HealthCheck({}, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  async waitForServiceReady(timeoutMs: number = this.config.timeout!): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      try {
        await this.healthCheck();
        return;
      } catch (error) {
        // Wait 1 second before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Service ${this.config.serviceName} not ready after ${timeoutMs}ms`);
  }

  // Generic method calling
  async call<TRequest, TResponse>(
    methodName: string,
    request: TRequest
  ): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      if (!this.client || typeof (this.client as any)[methodName] !== 'function') {
        reject(new Error(`Method ${methodName} not available on client`));
        return;
      }

      (this.client as any)[methodName](request, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }

  // Get the raw client for service-specific methods
  getClient(): TClient | null {
    return this.client;
  }

  getConfig(): ServiceConfig {
    return this.config;
  }

  isConnected(): boolean {
    return this.connected;
  }
} 