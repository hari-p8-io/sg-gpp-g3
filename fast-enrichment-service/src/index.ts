import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request ID middleware
app.use((req, res, next) => {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.headers['x-request-id']);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    service: 'fast-enrichment-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id']
  });
});

// Enrichment endpoint
app.post('/api/v1/enrich', async (req, res) => {
  const requestId = req.headers['x-request-id'];
  
  try {
    // Basic request validation
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({
        error: 'Invalid request body',
        requestId,
        timestamp: new Date().toISOString()
      });
    }

    // Simulate data enrichment
    const enrichedData = {
      ...req.body,
      enrichedAt: new Date().toISOString(),
      enrichmentData: {
        customerSegment: 'premium',
        riskScore: Math.floor(Math.random() * 100),
        geoLocation: 'US-East',
        accountType: 'business',
        creditRating: 'A+',
        lastTransactionTime: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString()
      },
      service: 'fast-enrichment-service'
    };

    res.status(200).json({
      success: true,
      data: enrichedData,
      requestId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error enriching data:', error);
    res.status(500).json({
      error: 'Internal server error',
      requestId,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 fast-enrichment-service is running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app; 