import { Router } from 'express';
import { HealthController } from '../controllers/healthController';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
const healthController = new HealthController();

// Health check endpoint
router.get('/health', 
  asyncHandler(healthController.healthCheck.bind(healthController))
);

export { router as healthRoutes }; 