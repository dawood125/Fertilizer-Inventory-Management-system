// Verification of COGS, Net Profit, and Sales Ledger Math
function testCalculations() {
  console.log('Testing Inventory and Financial Calculations...\n');

  // 1. Box vs Carton COGS Unit Conversion Test
  const productA = {
    id: 'p1',
    name: 'Biscuit Box A',
    purchase_price: 2400, // Rs. 2400 per carton
    cost_price: 2400,
    retail_price: 3600,
    carton_to_box: 24, // 24 boxes per carton -> Rs. 100 cost/box, Rs. 150 retail/box
  };

  // Sold 12 boxes at Rs. 150/box = Rs. 1800
  const orderItemBox = {
    product_id: 'p1',
    product_name: 'Biscuit Box A',
    quantity: 12,
    unit: 'box',
    unit_price: 150,
    total: 1800,
  };

  const cartonPacking = Number(productA.carton_to_box || 0);
  const isBox = (String(orderItemBox.unit || '').toLowerCase() === 'box') && cartonPacking > 0;
  const rawQty = Number(orderItemBox.quantity || 0);
  const cartons = isBox ? rawQty / cartonPacking : rawQty;
  const unitCartonCost = Number(productA.cost_price || productA.purchase_price || 0);
  const correctCogs = unitCartonCost * cartons;
  const revenue = orderItemBox.total;
  const grossProfit = revenue - correctCogs;

  console.log('Scenario 1: Box Sale (12 boxes out of 24/carton)');
  console.log(`Cartons equivalent: ${cartons} cartons`);
  console.log(`Revenue: Rs. ${revenue}`);
  console.log(`COGS (Correct): Rs. ${correctCogs} (Expected: 1200)`);
  console.log(`Gross Profit: Rs. ${grossProfit} (Expected: 600)`);
  if (correctCogs !== 1200 || grossProfit !== 600) {
    throw new Error('Scenario 1 Failed!');
  }
  console.log('✓ Scenario 1 Passed!\n');

  // 2. Sales Returns & Net Profit Test
  const grossSales = 10000;
  const salesReturns = 1500;
  const returnedCost = 900;
  const totalCogsBeforeReturn = 6000;
  const netCogs = totalCogsBeforeReturn - returnedCost; // 5100
  const netSales = grossSales - salesReturns; // 8500
  const actualGrossProfit = netSales - netCogs; // 3400
  const operatingExpenses = 1400;
  const netProfit = actualGrossProfit - operatingExpenses; // 2000
  const netMargin = ((netProfit / netSales) * 100).toFixed(1);

  console.log('Scenario 2: Sales Returns & P&L');
  console.log(`Net Sales: Rs. ${netSales}`);
  console.log(`Net COGS: Rs. ${netCogs}`);
  console.log(`Gross Profit: Rs. ${actualGrossProfit} (Expected: 3400)`);
  console.log(`Operating Expenses: Rs. ${operatingExpenses}`);
  console.log(`Net Profit: Rs. ${netProfit} (Expected: 2000)`);
  console.log(`Net Margin: ${netMargin}% (Expected: 23.5%)`);
  if (actualGrossProfit !== 3400 || netProfit !== 2000) {
    throw new Error('Scenario 2 Failed!');
  }
  console.log('✓ Scenario 2 Passed!\n');

  // 3. Customer Sales Ledger Running Balance & Aging Test
  const customer = {
    id: 'c1',
    name: 'Al-Madina Store',
    opening_balance: 5000,
  };

  const priorInvoices = [
    { total: 10000, date: '2026-01-05' }
  ];
  const priorPayments = [
    { amount: 7000, date: '2026-01-08' }
  ];

  const priorBalance = customer.opening_balance + 10000 - 7000; // 8000

  // Transactions in current period:
  const periodTxs = [
    { type: 'invoice', docNo: 'INV-101', debit: 6000, credit: 0, date: '2026-01-15' },
    { type: 'payment', docNo: 'REC-201', debit: 0, credit: 5000, date: '2026-01-20' },
    { type: 'return', docNo: 'RET-301', debit: 0, credit: 1000, date: '2026-01-22' },
    { type: 'invoice', docNo: 'INV-102', debit: 4500, credit: 0, date: '2026-01-25' },
  ];

  let running = priorBalance;
  const ledgerEntries = periodTxs.map(t => {
    running = running + t.debit - t.credit;
    return { ...t, balance: running };
  });

  const totalDebit = periodTxs.reduce((s, t) => s + t.debit, 0); // 10500
  const totalCredit = periodTxs.reduce((s, t) => s + t.credit, 0); // 6000
  const closingBalance = running; // 8000 + 10500 - 6000 = 12500

  console.log('Scenario 3: Sales Ledger Running Balance');
  console.log(`Starting Balance: Rs. ${priorBalance}`);
  console.log(`Total Debits: Rs. ${totalDebit}`);
  console.log(`Total Credits: Rs. ${totalCredit}`);
  console.log(`Closing Balance: Rs. ${closingBalance} (Expected: 12500)`);
  if (closingBalance !== 12500) {
    throw new Error('Scenario 3 Failed!');
  }
  console.log('✓ Scenario 3 Passed!\n');

  // 4. Customer Opening Balance Isolation Test
  // Customer Wali has opening balance of Rs. 10,000.
  // Order OB-20260923-6395 was generated with 0 cost.
  // Period has trade sales of Rs. 805,370 with COGS of Rs. 718,296.
  {
    const isOpeningBalanceOrder = (o) =>
      Boolean(o && (o.order_number?.startsWith('OB-') || o.note?.includes('Opening Balance') || o.note?.includes('Previous Pending Due')));
    const isOpeningBalanceItem = (it) =>
      Boolean(it && (it.unit === 'balance' || it.product_name?.includes('Opening Balance') || it.product_name?.includes('Previous Pending Due') || (it.product_id == null && Number(it.cost_price || 0) === 0 && String(it.product_name || '').toLowerCase().includes('balance'))));

    const allOrders = [
      { id: 'ob-1', order_number: 'OB-20260923-6395', total: 10000, customer_id: 'cust-wali', created_at: '2026-09-23T10:00:00Z', status: 'completed', payment_status: 'unpaid' },
      { id: 'ord-1', order_number: 'SO-1001', total: 805370, customer_id: 'cust-ali', created_at: '2026-09-23T11:00:00Z', status: 'completed', payment_status: 'paid' },
    ];

    const allOrderItems = [
      { id: 'it-ob', order_id: 'ob-1', product_name: 'Opening Balance / Previous Pending Due', unit: 'balance', quantity: 1, cost_price: 0, total_cost: 0, total: 10000 },
      { id: 'it-trade', order_id: 'ord-1', product_name: 'Biscuit Super Pack', unit: 'carton', quantity: 200, cost_price: 3591.48, total_cost: 718296, total: 805370 },
    ];

    const tradeOrders = allOrders.filter(o => !isOpeningBalanceOrder(o));
    const tradeOrderIds = new Set(tradeOrders.map(o => o.id));
    const tradeItems = allOrderItems.filter(it => tradeOrderIds.has(it.order_id) && !isOpeningBalanceItem(it));

    const tradeGrossSales = tradeItems.reduce((s, it) => s + Number(it.total), 0);
    const tradeCogs = tradeItems.reduce((s, it) => s + Number(it.total_cost), 0);
    const grossProfit = tradeGrossSales - tradeCogs; // 805370 - 718296 = 87074
    const expenses = 5000;
    const netProfit = grossProfit - expenses; // 87074 - 5000 = 82074

    console.log('Scenario 4: Customer Opening Balance Isolation from P&L');
    console.log(`Trade Orders count: ${tradeOrders.length} (Expected: 1, excluded OB)`);
    console.log(`Trade Gross Sales: Rs. ${tradeGrossSales} (Expected: 805370, NOT 815370)`);
    console.log(`Trade COGS: Rs. ${tradeCogs} (Expected: 718296)`);
    console.log(`Gross Profit: Rs. ${grossProfit} (Expected: 87074)`);
    console.log(`Net Profit: Rs. ${netProfit} (Expected: 82074, Rs. 10000 OB profit removed)`);

    if (tradeGrossSales !== 805370 || grossProfit !== 87074 || netProfit !== 82074) {
      throw new Error('Scenario 4 Failed: Opening balance leaked into P&L!');
    }

    // Verify Wali's Ledger & Pending Payments
    const waliOpeningBal = 10000;
    const waliOrders = allOrders.filter(o => o.customer_id === 'cust-wali');
    const waliOBOrders = waliOrders.filter(o => isOpeningBalanceOrder(o));
    const waliPriorBalance = Math.max(waliOpeningBal, waliOBOrders.reduce((s, o) => s + o.total, 0));
    const waliPeriodInvoices = waliOrders.filter(o => !isOpeningBalanceOrder(o));

    console.log(`Wali Starting Ledger Balance: Rs. ${waliPriorBalance} (Expected: 10000)`);
    console.log(`Wali Period Sales Invoices: ${waliPeriodInvoices.length} (Expected: 0, OB not duplicated)`);

    if (waliPriorBalance !== 10000 || waliPeriodInvoices.length !== 0) {
      throw new Error('Scenario 4 Failed: Wali ledger handling incorrect!');
    }
    console.log('✓ Scenario 4 Passed!\n');
  }

  console.log('ALL MATHEMATICAL VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

testCalculations();
