export class SingaporeValidator {
  /**
   * Basic Singapore market validation - just check for presence of SGD and SG
   * Detailed validation will be handled by the validation service
   */
  static validateBasicSingaporeMarket(xmlContent: string): ValidationResult {
    const warnings: string[] = [];
    
    // Basic checks for Singapore market indicators
    const hasSGD = xmlContent.includes('Ccy="SGD"') || xmlContent.includes('SGD');
    const hasSG = xmlContent.includes('Ctry>SG</') || xmlContent.includes('<Ctry>SG</Ctry>');
    
    // Just warn if not found, don't fail the request
    if (!hasSGD) {
      warnings.push('No SGD currency detected in message');
    }
    
    if (!hasSG) {
      warnings.push('No SG country code detected in message');
    }
    
    // Always pass - detailed validation will happen in validation service
    const result: ValidationResult = {
      isValid: true,
    };
    
    if (warnings.length > 0) {
      result.warnings = warnings;
    }
    
    return result;
  }
}

export interface ValidationResult {
  isValid: boolean;
  warnings?: string[];
} 