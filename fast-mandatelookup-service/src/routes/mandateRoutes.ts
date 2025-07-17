import { Router } from 'express';
import { MandateLookupController } from '../controllers/mandateLookupController';
import { validateMandateLookupRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/asyncHandler';

const router = Router();
const mandateLookupController = new MandateLookupController();

// Mandate lookup endpoint
router.post('/mandates/lookup', 
  validateMandateLookupRequest, 
  asyncHandler(mandateLookupController.lookupMandate.bind(mandateLookupController))
);

// Service information endpoint
router.get('/info', 
  asyncHandler(mandateLookupController.getServiceInfo.bind(mandateLookupController))
);

export { router as mandateRoutes }; 