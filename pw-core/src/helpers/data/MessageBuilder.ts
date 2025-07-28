export interface TestMessage {
  messageType: string;
  xmlPayload: string;
  metadata?: Record<string, string>;
  expectedFields?: Record<string, any>;
}

export class MessageBuilder {
  private messageData: Partial<TestMessage> = {};

  withMessageType(type: string): MessageBuilder {
    this.messageData.messageType = type;
    return this;
  }

  withXmlPayload(xmlPayload: string): MessageBuilder {
    this.messageData.xmlPayload = xmlPayload;
    return this;
  }

  withAccount(accountId: string): MessageBuilder {
    if (this.messageData.xmlPayload) {
      this.messageData.xmlPayload = this.messageData.xmlPayload.replace(
        /<Id>.*?<\/Id>/,
        `<Id>${accountId}</Id>`
      );
    }
    return this;
  }

  withAmount(amount: number): MessageBuilder {
    if (this.messageData.xmlPayload) {
      this.messageData.xmlPayload = this.messageData.xmlPayload.replace(
        /(\d+\.\d+)/,
        amount.toFixed(2)
      );
    }
    return this;
  }

  withCurrency(currency: string): MessageBuilder {
    if (this.messageData.xmlPayload) {
      this.messageData.xmlPayload = this.messageData.xmlPayload.replace(
        /Ccy="[^"]*"/,
        `Ccy="${currency}"`
      );
    }
    if (!this.messageData.metadata) {
      this.messageData.metadata = {};
    }
    this.messageData.metadata.currency = currency;
    return this;
  }

  withCountry(country: string): MessageBuilder {
    if (this.messageData.xmlPayload) {
      this.messageData.xmlPayload = this.messageData.xmlPayload.replace(
        /<Ctry>.*?<\/Ctry>/,
        `<Ctry>${country}</Ctry>`
      );
    }
    if (!this.messageData.metadata) {
      this.messageData.metadata = {};
    }
    this.messageData.metadata.country = country;
    return this;
  }

  withMetadata(metadata: Record<string, string>): MessageBuilder {
    this.messageData.metadata = { ...this.messageData.metadata, ...metadata };
    return this;
  }

  withSingaporeDefaults(): MessageBuilder {
    return this.withCurrency('SGD').withCountry('SG');
  }

  withUniqueId(id: number): MessageBuilder {
    if (this.messageData.xmlPayload) {
      // Add unique identifier to message ID
      this.messageData.xmlPayload = this.messageData.xmlPayload.replace(
        /<MsgId>.*?<\/MsgId>/,
        `<MsgId>TEST_${Date.now()}_${id}</MsgId>`
      );
    }
    return this;
  }

  build(): TestMessage {
    if (!this.messageData.messageType) {
      throw new Error('Message type is required');
    }
    if (!this.messageData.xmlPayload) {
      throw new Error('XML payload is required');
    }

    return {
      messageType: this.messageData.messageType,
      xmlPayload: this.messageData.xmlPayload,
      metadata: this.messageData.metadata || {},
      expectedFields: this.extractExpectedFields()
    };
  }

  private extractExpectedFields(): Record<string, any> {
    const fields: Record<string, any> = {};
    
    if (this.messageData.xmlPayload) {
      // Extract currency
      const currencyMatch = this.messageData.xmlPayload.match(/Ccy="([^"]*)"/) || 
                           this.messageData.xmlPayload.match(/<Ccy>([^<]*)<\/Ccy>/);
      if (currencyMatch) {
        fields.currency = currencyMatch[1];
      }

      // Extract country
      const countryMatch = this.messageData.xmlPayload.match(/<Ctry>([^<]*)<\/Ctry>/);
      if (countryMatch) {
        fields.country = countryMatch[1];
      }

      // Extract amount
      const amountMatch = this.messageData.xmlPayload.match(/(\d+\.\d+)/);
      if (amountMatch) {
        fields.amount = amountMatch[1];
      }

      // Extract account ID
      const accountMatch = this.messageData.xmlPayload.match(/<Id>([^<]*)<\/Id>/);
      if (accountMatch) {
        fields.accountId = accountMatch[1];
      }
    }

    return fields;
  }
} 