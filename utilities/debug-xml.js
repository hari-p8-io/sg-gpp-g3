const { XMLParser } = require('fast-xml-parser');

const TEST_XML_PAYLOAD = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.02">
  <FIToFICstmrCdtTrf>
    <CdtTrfTxInf>
      <IntrBkSttlmAmt Ccy="SGD">1000.00</IntrBkSttlmAmt>
      <CdtrAcct>
        <Id>
          <Othr>
            <Id>123456789</Id>
          </Othr>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>
          <PstlAdr>
            <Ctry>SG</Ctry>
          </PstlAdr>
        </FinInstnId>
      </CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => {
    if (key.includes('?')) {
      const cleanKey = key.replace('?', '');
      return current && current[cleanKey];
    }
    return current && current[key];
  }, obj);
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true
});

console.log('Parsing XML...');
const parsed = parser.parse(TEST_XML_PAYLOAD);

console.log('Parsed structure:');
console.log(JSON.stringify(parsed, null, 2));

console.log('\nTesting currency extraction paths:');
const currencyPaths = [
  'FIToFICstmrCdtTrf?.CdtTrfTxInf?.IntrBkSttlmAmt?.@_Ccy',
  'FIToFICstmrCdtTrf?.CdtTrfTxInf?.InstdAmt?.@_Ccy',
  'CstmrCdtTrfInitn?.CdtTrfTxInf?.IntrBkSttlmAmt?.@_Ccy',
  'CstmrCdtTrfInitn?.CdtTrfTxInf?.InstdAmt?.@_Ccy'
];

currencyPaths.forEach(path => {
  const value = getNestedValue(parsed.Document, path);
  console.log(`${path}: ${value}`);
});

console.log('\nTesting country extraction paths:');
const countryPaths = [
  'FIToFICstmrCdtTrf?.CdtTrfTxInf?.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry',
  'FIToFICstmrCdtTrf?.CdtTrfTxInf?.DbtrAgt?.FinInstnId?.PstlAdr?.Ctry',
  'CstmrCdtTrfInitn?.CdtTrfTxInf?.CdtrAgt?.FinInstnId?.PstlAdr?.Ctry',
  'CstmrCdtTrfInitn?.CdtTrfTxInf?.DbtrAgt?.FinInstnId?.PstlAdr?.Ctry'
];

countryPaths.forEach(path => {
  const value = getNestedValue(parsed.Document, path);
  console.log(`${path}: ${value}`);
}); 