export class MarketValidator {
  /**
   * Basic market validation - checks for market-specific indicators based on metadata
   * Detailed validation will be handled by the validation service
   */
  static validateBasicMarket(xmlContent: string, metadata: Record<string, string> = {}): ValidationResult {
    const warnings: string[] = [];
    const market = metadata.market || metadata.country || 'SG';
    
    // Currently only Singapore is supported
    if (market === 'SG') {
      return this.validateSingaporeMarket(xmlContent);
    } else {
      // For future markets, provide a helpful warning
      warnings.push(`Market ${market} not yet supported. Defaulting to Singapore validation.`);
      return this.validateSingaporeMarket(xmlContent);
    }
  }

  private static validateSingaporeMarket(xmlContent: string): ValidationResult {
    const warnings: string[] = [];
    
    // Basic checks for Singapore market indicators
    const hasSGD = xmlContent.includes('Ccy="SGD"') || xmlContent.includes('SGD');
    const hasSG = xmlContent.includes('Ctry>SG</') || xmlContent.includes('<Ctry>SG</Ctry>');
    
    if (!hasSGD) {
      warnings.push('No SGD currency detected in message');
    }
    
    if (!hasSG) {
      warnings.push('No SG country code detected in message');
    }
    
    return {
      isValid: true,
      ...(warnings.length > 0 && { warnings }),
    };
  }
}

export interface ValidationResult {
  isValid: boolean;
  warnings?: string[];
} 