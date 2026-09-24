/**
 * Lightweight, zero-dependency CSV parser, serializer, and downloader.
 * Handles quoted fields, escaped quotes, commas, CRLF / LF line endings, and UTF-8 BOM.
 */

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, ''); // strip UTF-8 BOM if present
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n in CRLF
      }
      currentRow.push(currentCell.trim());
      // Only push non-empty rows
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      currentCell += char;
    }
  }

  // Flush last cell/row
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export function generateCsv(headers: string[], rows: (string | number)[][]): string {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map((r) => r.map(escapeCell).join(','));
  return [headerLine, ...rowLines].join('\r\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Sample CSV for Products Import
export const PRODUCT_CSV_HEADERS = [
  'Product Name',
  'Brand',
  'Category',
  'Company',
  'Purchase Price',
  'Cost Price',
  'Retail Price',
  'Wholesale Price',
  'Dealer Price',
  'Pieces per Carton',
  'Stock Quantity',
  'Min Stock Level',
  'Unit',
  'SKU',
  'Barcode',
  'Description',
];

export const PRODUCT_CSV_SAMPLE_ROWS: (string | number)[][] = [
  ['MULTI CLEAN 360ML', 'Engro', 'Pesticides', 'Engro Fertilizers', 1000, 1000, 1400, 1300, 1220, 20, 160, 20, 'piece', 'MC-360', '896101001001', 'Multi Clean liquid fertilizer 360ml bottle'],
  ['ZORAVAR 1000ML', 'FMC', 'Fertilizer', 'FMC Chemicals', 1800, 1800, 2500, 2350, 2200, 12, 120, 15, 'piece', 'ZOR-1000', '896101002002', 'Zoravar growth booster 1000ml'],
  ['UREA SPECIAL 50KG', 'Fauji', 'Fertilizer', 'FFC', 3200, 3200, 3800, 3600, 3500, 1, 50, 10, 'piece', 'UREA-50', '896101003003', 'Urea granular 50kg bag'],
  ['SUPER PHOSPHATE 25KG', 'Fatima', 'Fertilizer', 'Fatima Fertilizer', 2400, 2400, 3100, 2900, 2800, 1, 80, 15, 'piece', 'SP-25', '896101004004', 'Super Phosphate single granular 25kg'],
];

// Sample CSV for Purchase Order Import
export const PO_ITEMS_CSV_HEADERS = [
  'Product Name',
  'Quantity (Cartons)',
  'Buy Rate / Pc',
  'SKU / Barcode (optional)',
];

export const PO_ITEMS_CSV_SAMPLE_ROWS: (string | number)[][] = [
  ['MULTI CLEAN 360ML', 8, 1000, 'MC-360'],
  ['ZORAVAR 1000ML', 5, 1800, 'ZOR-1000'],
  ['UREA SPECIAL 50KG', 20, 3200, 'UREA-50'],
];

// Sample CSV for Customer Import
export const CUSTOMER_CSV_HEADERS = [
  'Business Name',
  'Owner Name',
  'Phone',
  'CNIC',
  'NTN',
  'Area',
  'Address',
  'Customer Type',
  'Route',
  'Sales Rep',
  'Credit Limit',
  'Opening Balance',
  'Default Price Type',
  'Allow Manual Price Override',
  'Custom Price',
];

export const CUSTOMER_CSV_SAMPLE_ROWS: (string | number)[][] = [
  [
    'Al-Madina Super Store',
    'Muhammad Bilal',
    '0300-1234567',
    '35201-1234567-1',
    '1234567-8',
    'Housing Colony',
    'Main Bazar Road, Sheikhupura',
    'retailer',
    'City Main Route',
    'Ali Raza',
    100000,
    25000,
    'retail',
    'no',
    0,
  ],
  [
    'Bismillah Bakers & Sweets',
    'Haji Tariq',
    '0321-9876543',
    '35201-9876543-2',
    '',
    'Gulberg',
    'Shop #12, Near Water Tank, Gulberg',
    'wholesaler',
    'Gulberg Route',
    'Usman Khan',
    200000,
    50000,
    'wholesale',
    'yes',
    0,
  ],
  [
    'Subhan General Store',
    'Abdul Rehman',
    '0333-5551234',
    '',
    '',
    'Model Town',
    'Link Road, Block B',
    'dealer',
    'Model Town Route',
    'Ali Raza',
    150000,
    0,
    'dealer',
    'no',
    0,
  ],
  [
    'Madni Karyana Store',
    'Rashid Mehmood',
    '0345-7778899',
    '',
    '',
    'Civil Lines',
    'Railway Road, Civil Lines',
    'retailer',
    'City Main Route',
    'Usman Khan',
    50000,
    12000,
    'retail',
    'no',
    0,
  ],
];

