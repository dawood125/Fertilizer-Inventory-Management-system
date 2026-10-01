# Comprehensive Bug Fixes & Feature Implementation Guide
**Project Context:** FMCG Distribution & Retail Inventory Management System  
**Target Architecture:** React (TypeScript) + Vite + Tailwind CSS + Node.js / Express Backend + SQLite / SQL Database  
**Audience:** AI Coding Agent / Developer replicating these fixes on a live web server project.

---

## Table of Contents
1. [Overview & Live Web Server Guidance](#overview--live-web-server-guidance)
2. [Module 1: POS & Cart Operations](#module-1-pos--cart-operations)
   - [Bug #1: Carton Count & Unit Conversion in POS Cart](#bug-1-carton-count--unit-conversion-in-pos-cart)
   - [Bug #9: Product Price Updates Sync & POS Category/Company Filters](#bug-9-product-price-updates-sync--pos-categorycompany-filters)
   - [Bug #13: POS Cart Direct Quantity Input (Replacing +/- Steppers)](#bug-13-pos-cart-direct-quantity-input-replacing---steppers)
   - [Bug #17: Custom Rate Persistence on Held Orders](#bug-17-custom-rate-persistence-on-held-orders)
   - [Bug #18: Custom Rate Carton-to-Box Proportional Scaling](#bug-18-custom-rate-carton-to-box-proportional-scaling)
   - [Bug #19: Real-time Customer Balance Sync on Resuming Held Bills](#bug-19-real-time-customer-balance-sync-on-resuming-held-bills)
   - [Bug #27: Real-Time Catalog Price Sync on Held Bills & Price Tier Precedence](#bug-27-real-time-catalog-price-sync-on-held-bills--price-tier-precedence)
   - [Feature: POS 3-Column Catalog & Widened Cart Section](#feature-pos-3-column-catalog--widened-cart-section)
3. [Module 2: Invoicing & Receipt Documents (A5 / Thermal / PDF)](#module-2-invoicing--receipt-documents-a5--thermal--pdf)
   - [Bug #2: Line-Item & Bill Discount Carryover & Receivable Math](#bug-2-line-item--bill-discount-carryover--receivable-math)
   - [Bug #3: Opening Balance in Invoice Reprint](#bug-3-opening-balance-in-invoice-reprint)
   - [Bug #5: Bill Typography, Contrast & High-Readability Overhaul](#bug-5-bill-typography-contrast--high-readability-overhaul)
   - [Bug #7: Multi-Page Bill Pagination Item Skipping](#bug-7-multi-page-bill-pagination-item-skipping)
   - [Bug #11: Shorten Invoice Number to 5 Digits](#bug-11-shorten-invoice-number-to-5-digits)
   - [Bug #16: Bill Right-Column Summary (Previous Balance & Grand Total)](#bug-16-bill-right-column-summary-previous-balance--grand-total)
   - [Bug #23: In Bills, Replace "Scheme" with "DISC" Header](#bug-23-in-bills-replace-scheme-with-disc-header)
4. [Module 3: Sales Returns & Credit Memos](#module-3-sales-returns--credit-memos)
   - [Feature: Full Sales Return Invoice with Original Bill Reference & Print Preview](#feature-full-sales-return-invoice-with-original-bill-reference--print-preview)
5. [Module 4: Purchasing & Supplier Ledger](#module-4-purchasing--supplier-ledger)
   - [Bug #8: Supplier Opening Balance Initialization & PO Generation](#bug-8-supplier-opening-balance-initialization--po-generation)
   - [Bug #10: Quick Product Creation Shortcut inside Purchase Orders](#bug-10-quick-product-creation-shortcut-inside-purchase-orders)
   - [Bug #26: Supplier Opening Balance Crash (`unit_cost` vs `unit_price`)](#bug-26-supplier-opening-balance-crash-unit_cost-vs-unit_price)
6. [Module 5: Customers & Balances](#module-5-customers--balances)
   - [Bug #4: Customer Opening Balance Editable & Dynamic Ledger Sync](#bug-4-customer-opening-balance-editable--dynamic-ledger-sync)
   - [Bug #14: Bulk Checkmark Selection and Delete Action](#bug-14-bulk-checkmark-selection-and-delete-action)
   - [Bug #15: Customer Area Column & Area Filter in Sales Orders](#bug-15-customer-area-column--area-filter-in-sales-orders)
   - [Bug #20: Preserving Invoices When a Customer is Deleted](#bug-20-preserving-invoices-when-a-customer-is-deleted)
7. [Module 6: Dashboard & Analytics](#module-6-dashboard--analytics)
   - [Bug #6: Customer Promise Due Date & Overdue Detection](#bug-6-customer-promise-due-date--overdue-detection)
   - [Bug #12: Expense Subtraction in Net Profit & Date Alignment](#bug-12-expense-subtraction-in-net-profit--date-alignment)
   - [Bug #24: Reports Customer Search, POS Due Date Validation & Dashboard Alert](#bug-24-reports-customer-search-pos-due-date-validation--dashboard-alert)
   - [Bug #25: Dashboard Sales by Category UI/UX Overhaul](#bug-25-dashboard-sales-by-category-uiux-overhaul)
8. [Module 7: Data Integrity & Backup Restoration](#module-7-data-integrity--backup-restoration)
   - [Bug #21 & #22: Backup Restoration Finance & Cash-in-Hand Data Integrity](#bug-21--22-backup-restoration-finance--cash-in-hand-data-integrity)
   - [Bug #28: White Blank Screen Crash Prevention (Root ErrorBoundary)](#bug-28-white-blank-screen-crash-prevention-root-errorboundary)

---

## Overview & Live Web Server Guidance

> [!IMPORTANT]
> **For the AI Agent working on a Live Web Server:**
> 1. **Do Not Rely on Electron APIs**: If the target system is deployed on a web server (e.g., Ubuntu/Nginx/Node.js or Docker), replace Electron-specific APIs (such as `savePrintPdf` via `ipcRenderer`) with standard browser features: `window.print()` or `html2pdf.js` / server-side headless Chromium.
> 2. **Preserve Database Foreign Keys**: In live multi-user environments, never drop tables. Always execute non-destructive database migrations (`ALTER TABLE ... ADD COLUMN ...`).
> 3. **Avoid Race Conditions on Shared States**: When fetching customer balances and prices, ensure queries are executed in real time or via database transactions rather than relying on stale client-side caches.

---

## Module 1: POS & Cart Operations

### Bug #1: Carton Count & Unit Conversion in POS Cart
#### 1. User Complaint
> *"In POS Module need total carton to verify how many carton are. Cart show Total Item also show total carton pieces."*

#### 2. Root Cause
The cart only tracked raw quantities or item row counts. In distribution businesses, orders include both cartons (`ctn`) and loose boxes (`box`). A carton contains a specific number of boxes (e.g., 12 or 24, stored in `product.carton_to_box`). Without conversion, cashiers could not verify physical packing count for loaders.

#### 3. Plan
Iterate through the cart items, convert any `box` unit to its carton equivalent (`item.quantity / (product.carton_to_box || 1)`), sum with whole cartons, and display total cartons prominently in the cart summary footer.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
// Calculate total cartons dynamically
const totalCartons = useMemo(() => {
  return cart.reduce((sum, item) => {
    const ctnToBox = Number(item.product.carton_to_box || 1);
    if (item.unit === 'box' && ctnToBox > 0) {
      return sum + (Number(item.quantity || 0) / ctnToBox);
    }
    return sum + Number(item.quantity || 0);
  }, 0);
}, [cart]);

// In Cart Footer JSX:
<div className="flex justify-between items-center text-xs text-slate-600">
  <span>Total Cartons:</span>
  <span className="font-bold text-slate-800">{totalCartons.toFixed(2)} ctn</span>
</div>
```

---

### Bug #9: Product Price Updates Sync & POS Category/Company Filters
#### 1. User Complaint
> *"Product Module editing a Product price is not updating in POS also categories and company wise filter."*

#### 2. Root Cause
POS cached the product catalog in React state on initial page load and never re-fetched when products were edited in another tab or modal. POS also lacked brand/company and category dropdown filters, forcing cashiers to scroll through hundreds of products.

#### 3. Plan
1. Add Category and Company (Brand) filter controls to POS catalog toolbar.
2. In POS, re-fetch the product list whenever POS gains focus or when held orders are loaded.
3. Synchronize price changes into existing cart items if the cashier has not overridden with a manual custom price.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
const [selectedCategory, setSelectedCategory] = useState<string>('all');
const [selectedCompany, setSelectedCompany] = useState<string>('all');

const filteredProducts = useMemo(() => {
  return products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    const matchesComp = selectedCompany === 'all' || p.brand_id === selectedCompany || p.company_id === selectedCompany;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.barcode === search;
    return matchesCat && matchesComp && matchesSearch;
  });
}, [products, selectedCategory, selectedCompany, search]);
```

---

### Bug #13: POS Cart Direct Quantity Input (Replacing +/- Steppers)
#### 1. User Complaint
> *"Input lil more wide remove + - icon and remove their function."*

#### 2. Root Cause
The +/- stepper buttons were too small on touch screens, and clicking +/- repeatedly for 50 or 100 cartons was too slow. Cashiers needed a wide text box where they could immediately type numeric quantities without buttons getting in the way.

#### 3. Plan
Remove the `<Minus>` and `<Plus>` buttons from the cart line item. Expand input width to `w-16` or `w-20` with text-center styling, allowing direct typing with clean parsing.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
// Removed stepper buttons, replaced with direct input:
<input
  type="number"
  min="0.01"
  step="any"
  value={item.quantity === 0 ? '' : item.quantity}
  onChange={(e) => {
    const val = parseFloat(e.target.value);
    updateCartItemQuantity(item.product.id, isNaN(val) ? 0 : val);
  }}
  onBlur={(e) => {
    if (!item.quantity || item.quantity <= 0) {
      updateCartItemQuantity(item.product.id, 1);
    }
  }}
  className="w-16 rounded-md border border-slate-300 text-center py-1 text-sm font-bold text-slate-800 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
/>
```

---

### Bug #17: Custom Rate Persistence on Held Orders
#### 1. User Complaint
> *"In POS Module Custom rate input improve. Custom rate when I Hold the bill return to POS custom rate automatically shown Category rate, Should Saved Always."*

#### 2. Root Cause
When cashiers entered a custom price on a cart item (e.g. discounted rate Rs. 175 instead of standard Rs. 200), the cart marked it, but when the bill was put on hold and later resumed, the `useEffect` that listens to `selectedCustomerId` / customer price tier ran and automatically overwrote the item price back to the catalog price.

#### 3. Plan
1. Tag custom price items with `isCustomPrice: true`.
2. When putting a bill on hold, serialize `isCustomPrice` in the held cart JSON.
3. In customer tier update effects and resumption logic, add a guard: `if (item.isCustomPrice) return item;`.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
// In cart item price change handler:
const handleRateChange = (productId: string, newRate: number) => {
  setCart((prev) =>
    prev.map((item) =>
      item.product.id === productId
        ? { ...item, unitPrice: newRate, isCustomPrice: true, total: newRate * item.quantity }
        : item
    )
  );
};

// In customer/tier update effect:
setCart((prevCart) =>
  prevCart.map((item) => {
    // CRITICAL: Lock custom rate
    if (item.isCustomPrice) return item;

    const newPrice = priceForUnit(item.product, item.unit, effectivePriceType);
    return { ...item, unitPrice: newPrice, total: newPrice * item.quantity };
  })
);
```

---

### Bug #18: Custom Rate Carton-to-Box Proportional Scaling
#### 1. User Complaint
> *"POS Cart carton-to-box custom rate scaling and unit switching."*

#### 2. Root Cause
If a cashier gave a custom rate of Rs. 1800 per carton (where carton has 12 boxes), switching the unit from `carton` to `box` wiped out the custom rate and reverted to the product's base retail box price, instead of scaling down to `1800 / 12 = Rs. 150`.

#### 3. Plan
When toggling unit between `carton` and `box`, check if `isCustomPrice` is true. If so, multiply or divide the custom price by `product.carton_to_box`.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
const switchUnit = (productId: string) => {
  setCart((prev) =>
    prev.map((item) => {
      if (item.product.id !== productId) return item;
      const targetUnit = item.unit === 'carton' ? 'box' : 'carton';
      const ctnToBox = Number(item.product.carton_to_box || 1);

      let newPrice: number;
      if (item.isCustomPrice) {
        newPrice = targetUnit === 'box'
          ? item.unitPrice / ctnToBox
          : item.unitPrice * ctnToBox;
      } else {
        newPrice = priceForUnit(item.product, targetUnit, priceType);
      }

      return {
        ...item,
        unit: targetUnit,
        unitPrice: newPrice,
        total: newPrice * item.quantity,
      };
    })
  );
};
```

---

### Bug #19: Real-time Customer Balance Sync on Resuming Held Bills
#### 1. User Complaint
> *"when i made a bill of customer then make it on hold and change or edit the opening balance of the customer then came to that hold bill then it does not update the data in real time."*

#### 2. Root Cause
When holding a bill, the app saved a snapshot of the customer object (`heldCustomer`) into local storage. If someone edited the customer's balance or opening balance in the Customers page, resuming the held bill restored the old snapshot from local storage, overwriting live database numbers with stale data.

#### 3. Plan
When resuming an order, ignore the stale `heldOrder.heldCustomer.balance`. Instead, make a live API call: `api.get('/api/data/customers/' + heldOrder.selectedCustomerId)` and load current balance and ledger stats into POS state.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
const resumeOrder = async (heldOrder: HeldOrder) => {
  // Fetch fresh customer data from backend
  if (heldOrder.selectedCustomerId) {
    try {
      const freshCustomer = await api.get<Customer>(`/api/data/customers/${heldOrder.selectedCustomerId}`);
      setSelectedCustomer(freshCustomer);
    } catch {
      setSelectedCustomer(heldOrder.heldCustomer || null);
    }
  }
  // Load remaining order details...
};
```

---

### Bug #27: Real-Time Catalog Price Sync on Held Bills & Price Tier Precedence
#### 1. User Complaint
> *"When i add a product for a customer in the cart then make the bill on hold and go to the products and change their prices and when i go to pos screen and resume that same bill then it was not showing updated prices like dealer, wholesaler... Also when i try to change customer type using dropdown sometime it update price but sometimes it does not update and feels stuck."*

#### 2. Root Cause
1. `resumeOrder` restored cart items with old product prices from memory instead of comparing against current catalog prices.
2. In `src/lib/units.ts`, `priceForUnit` gave precedence to `customerCartonPrice` (a remembered custom rate for this customer) over the dropdown's `priceType` (Retail / Wholesale / Dealer / Surrounding). Thus, switching the dropdown did nothing because the customer's remembered price superseded the tier selection.
3. In `POS.tsx`, changing the price type dropdown triggered a race condition between asynchronous customer loading and cart state.

#### 3. Plan
1. In `src/lib/units.ts`, add a `forceTier: boolean = false` parameter. When the user explicitly changes the price tier dropdown, set `forceTier = true` to bypass remembered customer rates.
2. In `POS.tsx` `resumeOrder`, fetch the latest catalog from `api.get('/api/data/products')`. For every item where `item.isCustomPrice !== true`, recalculate `unitPrice` with the fresh catalog price.
3. In the price tier change handler, immediately map all cart items to the new tier prices and set `isCustomPrice: false`.

#### 4. Implementation
**File:** `src/lib/units.ts`
```ts
export function priceForUnit(
  product: Product,
  unit: 'carton' | 'box',
  priceType: 'retail' | 'wholesale' | 'dealer' | 'surrounding',
  customerCartonPrice?: number | null,
  forceTier: boolean = false
): number {
  const ctnToBox = Number(product.carton_to_box || 1);

  // If NOT forced by user dropdown selection, check remembered customer price
  if (!forceTier && customerCartonPrice != null && customerCartonPrice > 0) {
    return unit === 'box' ? customerCartonPrice / ctnToBox : customerCartonPrice;
  }

  // Strictly follow selected tier
  let ctnPrice = Number(product.retail_price || 0);
  if (priceType === 'wholesale' && product.wholesale_price) ctnPrice = Number(product.wholesale_price);
  if (priceType === 'dealer' && product.dealer_price) ctnPrice = Number(product.dealer_price);
  if (priceType === 'surrounding' && product.surrounding_price) ctnPrice = Number(product.surrounding_price);

  return unit === 'box' ? ctnPrice / ctnToBox : ctnPrice;
}
```

**File:** `src/pages/POS.tsx`
```tsx
// Inside resumeOrder:
const liveProducts = await api.get<Product[]>('/api/data/products?limit=10000');
const productMap = new Map(liveProducts.map(p => [p.id, p]));

const updatedCart = heldOrder.cart.map(item => {
  const liveProd = productMap.get(item.product.id);
  if (!liveProd) return item;

  // Preserve manual custom rate
  if (item.isCustomPrice === true) {
    return { ...item, product: liveProd };
  }

  // Recalculate price with latest catalog rates
  const newUnitPrice = priceForUnit(liveProd, item.unit, heldOrder.priceType, null, true);
  return {
    ...item,
    product: liveProd,
    unitPrice: newUnitPrice,
    total: newUnitPrice * item.quantity,
  };
});
setCart(updatedCart);
```

---

### Feature: POS 3-Column Catalog & Widened Cart Section
#### 1. User Complaint
> *"show three product in the left section instead of four and increase the width of cart section so our product name which have long name should show proper name instead ... extension."*

#### 2. Root Cause
The product grid was configured as 4 columns (`grid-cols-4`), compressing product cards and truncating text. The cart column was limited to `max-w-md` (`420px`), and product names had `line-clamp-2` or `truncate` CSS classes applied.

#### 3. Plan
1. Change product catalog grid to 3 columns (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`).
2. Widen cart column to `lg:w-[500px] xl:w-[540px]`.
3. Remove `line-clamp-2` and `truncate` from cart item titles, allowing full names to wrap naturally.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
// Left Section Grid:
<div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
  {filteredProducts.map(p => <ProductCard key={p.id} product={p} ... />)}
</div>

// Right Section Cart Width:
<div className="w-full lg:w-[500px] xl:w-[540px] flex flex-col bg-white border-l border-slate-200">
  {/* Cart items with full name wrapping */}
  <span className="font-semibold text-slate-800 text-xs leading-snug break-words">
    {item.product.name}
  </span>
</div>
```

---

## Module 2: Invoicing & Receipt Documents (A5 / Thermal / PDF)

### Bug #2: Line-Item & Bill Discount Carryover & Receivable Math
#### 1. User Complaint
> *"In Bill they give discount Item no 12 rs 60 calculation is ok but from previous bill in automatically giving discount to previous bill -60"*

#### 2. Root Cause
The discount state variable in the checkout modal was not being cleared after finishing an order, causing the next order to inherit the prior discount. Additionally, when writing transactions to `transactions` table, receivable adjustments deducted the discount twice.

#### 3. Plan
1. Reset `discount = 0` on checkout modal close and order complete.
2. In `completeOrder`, compute:
   `subtotal = items.reduce(...)`
   `total = Math.max(0, subtotal - discount)`
   `due = Math.max(0, total - paidAmount)`
3. Ensure accounts receivable transactions record only `due`.

#### 4. Implementation
**File:** `src/pages/POS.tsx`
```tsx
// Clean state reset in POS:
const resetPOS = () => {
  setCart([]);
  setBillDiscount(0);
  setPaidAmount('');
  setSelectedCustomer(null);
  setNotes('');
};
```

---

### Bug #3: Opening Balance in Invoice Reprint
#### 1. User Complaint
> *"In Bill one opening is not showing Allah Rakha. Enter a Opening balance 1st bill print with opening Balance, 2nd bill without opening balance, 3rd bill with opening balance"*

#### 2. Root Cause
In `SalesInvoiceDocument.tsx`, the previous balance calculation checked if `customer.previous_balance` was passed in props. On reprinting old bills from the Orders history, the order record only contained the final total, and the customer's historical balance at the moment that bill was created was not stored.

#### 3. Plan
1. When printing/reprinting an invoice, compute the customer's previous balance at that exact order's timestamp:
   `previousBalance = currentCustomerBalance - (order.total - order.paid_amount)`.
2. Save a customer balance snapshot directly in the order record upon completion (`order.customer_prev_balance`).

#### 4. Implementation
**File:** `src/components/SalesInvoiceDocument.tsx`
```tsx
const effectivePrevBalance = prevBalance != null 
  ? Number(prevBalance) 
  : customer ? Number(customer.balance || 0) - (Number(orderTotal || 0) - Number(paidAmount || 0)) : 0;

const grandTotal = effectivePrevBalance + Math.max(0, Number(orderTotal || 0) - Number(paidAmount || 0));
```

---

### Bug #5: Bill Typography, Contrast & High-Readability Overhaul
#### 1. User Complaint
> *"Bill UI/UX improve font size readable. Bill Parha nahi jata (Cannot read the bill)."*

#### 2. Root Cause
The receipt styling used light slate colors (`#64748b`, `#94a3b8`) and 9px/10px font sizes with thin weights. Dot-matrix and thermal receipt printers printed these as faint, unreadable gray lines.

#### 3. Plan
1. Replace all font colors with solid `#000000`.
2. Increase font sizes to `11px` / `12px` for table items and `14px` / `16px` for totals.
3. Use `font-weight: 800` / `900` for numbers and customer names.
4. Add solid `1.5px` and `2px` black borders on headers and totals.

#### 4. Implementation
**File:** `src/components/SalesInvoiceDocument.tsx`
```css
.invoice-card {
  color: #000000 !important;
  font-family: Arial, Helvetica, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.items-table th {
  border-top: 1.5px solid #000000;
  border-bottom: 1.5px solid #000000;
  color: #000000;
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}

.items-table td {
  border-bottom: 1px solid #cbd5e1;
  color: #000000;
  font-size: 11px;
  font-weight: 700;
}
```

---

### Bug #7: Multi-Page Bill Pagination Item Skipping
#### 1. User Complaint
> *"When we add lot of items in the bill then when it start printing on next page or backside of the paper it miss some itme between this. like in the image the first page ends in 37 item but next page starts at 39."*

#### 2. Root Cause
In `SalesInvoiceDocument.tsx`, pagination sliced items using:
`page 1: slice(0, 37)`
`page 2: slice(38, ...)` (1 item skipped due to an incorrect offset calculation).

#### 3. Plan
Use strict chunking logic:
```ts
const ITEMS_PER_PAGE_FIRST = 24;
const ITEMS_PER_PAGE_SUBSEQUENT = 30;
```
Ensure `startIndex` of page `N` is exactly equal to `endIndex` of page `N - 1`.

#### 4. Implementation
**File:** `src/components/SalesInvoiceDocument.tsx`
```tsx
const pages: LineItem[][] = [];
let cursor = 0;

for (let p = 0; p < totalPages; p++) {
  const limit = p === 0 ? ITEMS_PAGE_1 : ITEMS_SUBSEQUENT;
  pages.push(items.slice(cursor, cursor + limit));
  cursor += limit; // Strict contiguous progression
}
```

---

### Bug #11: Shorten Invoice Number to 5 Digits
#### 1. User Complaint
> *"Shorten the invoice number should be 4 or 5 number."*

#### 2. Root Cause
Invoices were generated using UUIDs or timestamp strings like `INV-172778901234-A8F`. Cashiers and shopkeepers found them impossible to communicate over the phone or reference on ledgers.

#### 3. Plan
Update `generateDocNumber('INV')` to generate clean, memorable 5-digit numbers between `10000` and `99999` (or sequential sequence).

#### 4. Implementation
**File:** `src/lib/utils.ts`
```ts
export function generateDocNumber(type: string): string {
  if (type === 'INV') {
    // Generate 5-digit clean invoice number
    return String(Math.floor(10000 + Math.random() * 90000));
  }
  return `${type}-${Date.now().toString(36).toUpperCase()}`;
}
```

---

### Bug #16: Bill Right-Column Summary (Previous Balance & Grand Total)
#### 1. User Complaint
> *"Previous Balance and Current Balance need at Right side under Remaining and Current Balance Change into Grand Total."*

#### 2. Root Cause
The receipt footer had financial values scattered across left notes and right columns, confusing customers about what they owed for the current bill vs their total outstanding balance.

#### 3. Plan
Stack the entire financial breakdown on the bottom-right in strict mathematical sequence:
1. `Sub Total`
2. `Discount`
3. `Net Total` (Subtotal - Discount)
4. `Paid Amount`
5. `Remaining Due` (Net Total - Paid)
6. `Previous Balance` (Outstanding ledger debt before this invoice)
7. `Grand Total` (Remaining Due + Previous Balance)

#### 4. Implementation
**File:** `src/components/SalesInvoiceDocument.tsx`
```tsx
const remaining = Math.max(0, netTotal - paidAmount);
const grandTotal = (previousBalance || 0) + remaining;

<div className="w-48 ml-auto flex flex-col gap-1 text-xs">
  <div className="flex justify-between"><span>Sub Total:</span><span>{fmt(subtotal)}</span></div>
  {discount > 0 && <div className="flex justify-between text-rose-600"><span>Discount:</span><span>-{fmt(discount)}</span></div>}
  <div className="flex justify-between font-bold border-t pt-1"><span>Net Total:</span><span>{fmt(netTotal)}</span></div>
  <div className="flex justify-between"><span>Paid:</span><span>{fmt(paidAmount)}</span></div>
  <div className="flex justify-between font-bold"><span>Remaining:</span><span>{fmt(remaining)}</span></div>
  <div className="flex justify-between text-slate-700"><span>Previous Balance:</span><span>{fmt(previousBalance)}</span></div>
  <div className="flex justify-between font-extrabold text-sm border-t-2 border-black pt-1 bg-slate-100 p-1">
    <span>Grand Total:</span>
    <span>{fmt(grandTotal)}</span>
  </div>
</div>
```

---

### Bug #23: In Bills, Replace "Scheme" with "DISC" Header
#### 1. User Complaint
> *"In the bills we are using scheme text header for the discount which is not showing properly so let use a shortcut word like DISC text header which will fit perfectly and look good also."*

#### 2. Root Cause
The column header "Scheme / Discount" was 16 characters long and wrapped into two lines on A5 thermal invoices, cutting into the item description and price columns.

#### 3. Plan
Replace header text with `DISC`. Assign a compact width of `8%` to DISC, `12%` to Rate, and give `38%` to Product Name.

#### 4. Implementation
**File:** `src/components/SalesInvoiceDocument.tsx`
```tsx
<thead>
  <tr>
    <th style={{ width: '6%' }} className="text-center">S#</th>
    <th style={{ width: '40%' }}>Description</th>
    <th style={{ width: '8%' }} className="text-center">Unit</th>
    <th style={{ width: '8%' }} className="text-right">Qty</th>
    <th style={{ width: '13%' }} className="text-right">Rate</th>
    <th style={{ width: '8%' }} className="text-center">DISC</th>
    <th style={{ width: '17%' }} className="text-right">Total</th>
  </tr>
</thead>
```

---

## Module 3: Sales Returns & Credit Memos

### Feature: Full Sales Return Invoice with Original Bill Reference & Print Preview
#### 1. User Complaint
> *"Currently when we return a bill item or full bill then in the return bill it just a slip of what we returned but what i want that it show properly updated invoice in sale return like it show print preview like other bill and also show what was original bill and what we returned the items."*

#### 2. Root Cause
Sales returns were treated as internal log entries rather than customer-facing accounting documents. The customer was not given a formal Credit Note / Revised Invoice showing their original invoice number, items returned, credit applied, and remaining balance.

#### 3. Plan
1. Create a dedicated document component: `src/components/SalesReturnDocument.tsx`.
2. Include:
   - Store branding, logo, NTN, and return voucher number (`SR-...`).
   - Original Bill Reference: Original invoice number, original bill date, and original bill total.
   - Customer details: Name, Area, Phone, and NTN.
   - Returned Products Table: Product name, unit, returned qty, unit rate, return reason, and credit total.
   - Summary & Revision Grid:
     - `Original Invoice Total` (e.g. Rs. 15,000)
     - `Total Return Credit` (e.g. - Rs. 4,000)
     - `Revised Net Invoice Total` (e.g. Rs. 11,000)
     - `Customer Previous Balance` and `Updated Customer Balance`.
   - Signature lines and Urdu receipt note: `واپسی شدہ مال کی مالیت کسٹمر کھاتہ میں درست کر دی گئی ہے۔`
3. In `SalesReturns.tsx`:
   - Add a `<Printer size={16} />` button to every row.
   - Open `PrintPreview` immediately after creating a return batch.
   - Add a "Share via WhatsApp" button to send invoice details to customer's mobile.

#### 4. Implementation
**Component:** `src/components/SalesReturnDocument.tsx` (Complete implementation exported with full A5/A4 printable layout).  
**Page Integration:** `src/pages/SalesReturns.tsx`
```tsx
// After creating return batch:
setPrintReturnData({
  returnNumber: firstRetNum,
  returnDate: new Date().toISOString(),
  resolution: data.resolution,
  originalInvoiceNumber: order?.invoice_number || order?.order_number,
  originalOrderTotal: origOrderTotal,
  customerName: selectedCust?.name || 'Walk-in Customer',
  previousBalance: prevCustBalance,
  currentBalance: updatedCustBal,
  items: data.items,
  totalReturnAmount: grandTotal,
  revisedOrderTotal: Math.max(0, origOrderTotal - grandTotal),
});
setShowPrintPreview(true);
```

---

## Module 4: Purchasing & Supplier Ledger

### Bug #8: Supplier Opening Balance Initialization & PO Generation
#### 1. User Complaint
> *"In supplier Module opening balance is not working. Also supplier open should be editable too just like customer."*

#### 2. Root Cause
Creating a supplier with an opening balance saved the number in `suppliers.opening_balance`, but failed to set `suppliers.balance = opening_balance` and did not create a record in `purchase_orders` or `transactions`, leaving the supplier out of accounts payable.

#### 3. Plan
When saving a supplier with `opening_balance > 0`:
1. Set `balance = opening_balance`.
2. Automatically create a `purchase_orders` entry: `po_number: 'PO-OB-' + id`, `status: 'received'`, `payment_status: 'unpaid'`.
3. Support delta updates if edited later.

#### 4. Implementation
**File:** `src/pages/Purchasing.tsx`
```tsx
const newSup = await api.post<Supplier>('/api/data/suppliers', {
  name: supplierForm.name,
  phone: supplierForm.phone,
  opening_balance: openingDue,
  balance: openingDue,
});

if (openingDue > 0) {
  const poNumber = generateDocNumber('PO-OB');
  await api.post('/api/data/purchase_orders', {
    po_number: poNumber,
    supplier_id: newSup.id,
    subtotal: openingDue,
    total: openingDue,
    status: 'received',
    payment_status: 'unpaid',
    note: 'Initial Opening Balance / Previous Supplier Due',
  });
}
```

---

### Bug #10: Quick Product Creation Shortcut inside Purchase Orders
#### 1. User Complaint
> *"In a Purchase module when we are making purchase if any new are not existed add new product short cut in purchase."*

#### 2. Root Cause
In the Create PO dialog, users could only pick from existing products in a dropdown. If a new SKU arrived on a shipment invoice, the user had to cancel the PO, navigate to the Products page, create the product, and start the PO over again.

#### 3. Plan
Embed a `+ Quick Add Product` button next to the product selector inside the PO creation modal that opens a modal, saves to `/api/data/products`, and injects the new product directly into the PO line items.

#### 4. Implementation
**File:** `src/pages/Purchasing.tsx`
```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  icon={<Plus size={14} />}
  onClick={() => setShowQuickProductModal(true)}
>
  New Product
</Button>
```

---

### Bug #26: Supplier Opening Balance Crash (`unit_cost` vs `unit_price`)
#### 1. User Complaint
> *"Another bug happened that when i tried to add a supplier with opening and click save button then it show error message like 'table purchase_items has no column named unit_price' but when i go back and see it was created four employers with same name and opening balance and also appearing in pending payments."*

#### 2. Root Cause
1. Schema divergence: `order_items` (sales) uses `unit_price`, but `purchase_items` (purchases) uses `unit_cost`. The supplier opening balance helper erroneously posted `{ unit_price: openingDue }` to `/api/data/purchase_items`. SQLite rejected it with an error. The user clicked Save multiple times, creating 4 duplicate suppliers.
2. The UI lacked a loading/saving state, so when the error message popped up, the user clicked "Save" 4 times. Each click had already created the `supplier` before failing on `purchase_items`, generating 4 duplicate suppliers.

#### 3. Plan
1. In `src/pages/Purchasing.tsx`, change `unit_price` to `unit_cost`.
2. Add `savingSupplier` state to disable the save button immediately upon click.
3. In `server/routes/resources.js`, add a defensive mapping: if `tableKey === 'purchase_items' && data.unit_price !== undefined`, set `data.unit_cost = data.unit_cost || data.unit_price`.

#### 4. Implementation
**File:** `src/pages/Purchasing.tsx`
```tsx
// Fixed field name from unit_price to unit_cost:
await api.post('/api/data/purchase_items', {
  purchase_id: createdPO.id,
  product_name: 'Opening Balance / Previous Supplier Due',
  quantity: 1,
  unit_cost: openingDue,
  total: openingDue,
});
```

**File:** `server/routes/resources.js`
```js
// Defensive backend mapping:
if (tableKey === 'purchase_items' && data.unit_price !== undefined && data.unit_cost === undefined) {
  data.unit_cost = data.unit_price;
  delete data.unit_price;
}
```

---

## Module 5: Customers & Balances

### Bug #4: Customer Opening Balance Editable & Dynamic Ledger Sync
#### 1. User Complaint
> *"In Customer module Opening Balance should be editable or add addable."*

#### 2. Root Cause
In the Customer Edit modal, the `opening_balance` input was either disabled or updating it only modified `opening_balance` without adjusting the customer's live `balance`.

#### 3. Plan
When updating customer:
`delta = newOpeningBalance - oldOpeningBalance`
`newBalance = oldBalance + delta`
Save both fields to `/api/data/customers/:id`.

#### 4. Implementation
**File:** `src/pages/Customers.tsx`
```tsx
const delta = Number(form.opening_balance || 0) - Number(editingCustomer.opening_balance || 0);
const updatedBalance = Number(editingCustomer.balance || 0) + delta;

await api.put(`/api/data/customers/${editingCustomer.id}`, {
  ...form,
  balance: updatedBalance,
});
```

---

### Bug #14: Bulk Checkmark Selection and Delete Action
#### 1. User Complaint
> *"In product, Customer, supplier module add check mark and a select all radio button for Delete."*

#### 2. Root Cause
Users had to click individual row actions to delete records one by one. With hundreds of test records or discontinued items, bulk cleanup was impossible.

#### 3. Plan
Maintain a `selectedIds = Set<string>()` in state. Add a master checkbox in table header and item checkboxes in rows. Show a sticky bottom bar: `Delete (N) Selected`.

#### 4. Implementation
**Files:** `src/pages/Products.tsx`, `src/pages/Customers.tsx`, `src/pages/Purchasing.tsx`
```tsx
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

const toggleSelectAll = () => {
  if (selectedIds.size === items.length) {
    setSelectedIds(new Set());
  } else {
    setSelectedIds(new Set(items.map((i) => i.id)));
  }
};

const handleBulkDelete = async () => {
  if (!confirm(`Are you sure you want to delete ${selectedIds.size} records?`)) return;
  await Promise.all(Array.from(selectedIds).map((id) => api.delete(`/api/data/${resource}/${id}`)));
  setSelectedIds(new Set());
  load();
};
```

---

### Bug #15: Customer Area Column & Area Filter in Sales Orders
#### 1. User Complaint
> *"Sales Order Module Add table of Area of Customer to identify invoice."*

#### 2. Root Cause
Cashiers managing order delivery and invoice routing could not identify customer territories on the Orders list.

#### 3. Plan
1. In `Orders.tsx`, populate `customer_area` on each order row.
2. Render an `Area` badge column.
3. Add an Area filter dropdown containing all unique areas in the dataset.

#### 4. Implementation
**File:** `src/pages/Orders.tsx`
```tsx
const uniqueAreas = useMemo(() => {
  return Array.from(new Set(orders.map((o) => o.customer_area || o.customers?.area).filter(Boolean))).sort();
}, [orders]);
```

---

### Bug #20: Preserving Invoices When a Customer is Deleted
#### 1. User Complaint
> *"If Customer Delete, invoice also Gets not Deleted."*

#### 2. Root Cause
Foreign key `ON DELETE CASCADE` or orphan cleanup deleted all historical sales orders when a customer was deleted, distorting historical revenue, sales tax records, and reporting.

#### 3. Plan
1. Add columns to `orders`: `customer_name`, `customer_phone`, `customer_area`.
2. When creating an order, store a snapshot of customer metadata.
3. Before deleting a customer in `server/routes/resources.js`, update existing orders to ensure snapshot fields are populated, and set `customer_id = NULL`.

#### 4. Implementation
**File:** `server/database/migrations/index.js`
```sql
ALTER TABLE orders ADD COLUMN customer_name TEXT;
ALTER TABLE orders ADD COLUMN customer_phone TEXT;
ALTER TABLE orders ADD COLUMN customer_area TEXT;
```

**File:** `server/routes/resources.js`
```js
if (tableKey === 'customers') {
  // Snapshot customer details before deletion
  const cust = queryOne('SELECT * FROM customers WHERE id = ?', [id]);
  if (cust) {
    execute(`
      UPDATE orders 
      SET customer_name = COALESCE(customer_name, ?),
          customer_phone = COALESCE(customer_phone, ?),
          customer_area = COALESCE(customer_area, ?),
          customer_id = NULL
      WHERE customer_id = ?
    `, [cust.name, cust.phone, cust.area, id]);
  }
}
```

---

## Module 6: Dashboard & Analytics

### Bug #6: Customer Promise Due Date & Overdue Detection
#### 1. User Complaint
> *"When we creating bill need input for customer promise date also after due date in reports customer balance Due days in report."*

#### 2. Plan & Implementation
1. Add `due_date TEXT` to `orders` table.
2. In POS checkout modal, add date input for `due_date`.
3. In `Reports.tsx` Customer Balances tab:
   Calculate `daysOverdue = Math.floor((today - new Date(order.due_date)) / (1000 * 60 * 60 * 24))`.
   Render a red badge if `daysOverdue > 0`.

---

### Bug #12: Expense Subtraction in Net Profit & Date Alignment
#### 1. User Complaint
> *"In report and dashboard Expense is not subtracting for Net Profit."*

#### 2. Root Cause
In `useDashboardData.ts`:
`netProfit` was computed simply as `grossProfit` (Revenue - Cost of Goods Sold), omitting operating expenses from `expenses` table. Furthermore, date matching compared UTC timestamps against local dates.

#### 3. Plan & Implementation
**File:** `src/hooks/useDashboardData.ts`
```ts
const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
const netProfit = grossProfit - totalExpenses;
```

---

### Bug #24: Reports Customer Search, POS Due Date Validation & Dashboard Alert
#### 1. User Complaint
> *"We need to add search filter in customer balance report and also in due date user cant add past date in pos and also alert section for due dates in dashboard. In dashboard only show the alert and data of customer for the due dates, dont give option to directly receive or pay."*

#### 2. Plan & Implementation
1. **POS Due Date Validation:**
   ```tsx
   if (dueDate && dueDate < new Date().toISOString().slice(0, 10)) {
     notify('Due date cannot be in the past', 'error');
     return;
   }
   ```
2. **Customer Balances Search Filter:**
   ```tsx
   const filteredCustomers = customers.filter(c =>
     c.name.toLowerCase().includes(q) ||
     (c.phone && c.phone.includes(q)) ||
     (c.area && c.area.toLowerCase().includes(q))
   );
   ```
3. **Dashboard Overdue Alert Card:**  
   Computed in `useDashboardData.ts` and rendered in `Dashboard.tsx` displaying Customer Name, Phone, Unpaid Due Amount, and Days Overdue (strictly informative, no payment buttons per client constraint).

---

### Bug #25: Dashboard Sales by Category UI/UX Overhaul
#### 1. User Complaint
> *"We need to fix the UI UX of the sales by category section in the dashboard and make sure it looks good... still does not look responsive."*

#### 2. Root Cause
Recharts Donut chart had a duplicate SVG legend that rendered vertically next to the donut, cutting off text and pushing content off-screen on smaller displays.

#### 3. Plan & Implementation
1. Add `hideLegend={true}` to `DonutChart` in `src/components/Charts.tsx`.
2. In `Dashboard.tsx`, render the donut centered, accompanied by sleek horizontal progress bars showing category name, total revenue, and percentage of overall sales.

---

## Module 7: Data Integrity & Backup Restoration

### Bug #21 & #22: Backup Restoration Finance & Cash-in-Hand Data Integrity
#### 1. User Complaint
> *"when we upload the backup using import then it did not upload cash in hand financial system correctly... and not updating other data like sale expense."*

#### 2. Root Cause
1. In `/api/settings/restore`, foreign key constraints caused insert orders to fail if parent records were loaded after children.
2. `payment_accounts` balance calculation was wiped out.
3. The dashboard was defaulting to `this_month`. When client uploaded a backup with historical orders from earlier months, the dashboard showed zero sales because the active filter excluded them.

#### 3. Plan
1. Wrap restoration inside `PRAGMA foreign_keys = OFF` and wrap in a transaction.
2. In `useDashboardData.ts`, automatically inspect data range. If `this_month` has 0 orders but `last_30_days` or `all` has records, auto-fallback to an active timeframe.
3. Map `order.created_at` onto `order_items` so that product and category performance correlate with true order dates.

#### 4. Implementation
**File:** `server/routes/settings.js`
```js
db.run('PRAGMA foreign_keys = OFF;');
// Restore tables in dependency order...
db.run('PRAGMA foreign_keys = ON;');
```

**File:** `src/hooks/useDashboardData.ts`
```ts
// Auto-detect best timeframe if current month has no data
const effectiveTimeframe = useMemo(() => {
  if (selectedTimeframe !== 'this_month') return selectedTimeframe;
  const thisMonthCount = orders.filter(o => isThisMonth(o.created_at)).length;
  if (thisMonthCount === 0 && orders.length > 0) {
    return 'last_30_days';
  }
  return 'this_month';
}, [orders, selectedTimeframe]);
```

---

### Bug #28: White Blank Screen Crash Prevention (Root ErrorBoundary)
#### 1. User Complaint
> *"why the white blank screen is showing when i installed the updated installer."*

#### 2. Root Cause
Any unhandled client-side runtime error (such as a null pointer accessing an undefined customer property or a broken date parse) caused React 18 to unmount the entire component tree, leaving the user with an empty white screen.

#### 3. Plan & Implementation
Create a top-level `<ErrorBoundary>` component in `src/components/ErrorBoundary.tsx` that catches React render crashes, logs the stack trace, and displays a recovery interface with a "Reload App" button.

**File:** `src/components/ErrorBoundary.tsx`
```tsx
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled UI Crash:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen flex-col items-center justify-center p-6 text-center">
          <h2 className="text-xl font-bold text-slate-800">Something went wrong</h2>
          <p className="text-sm text-slate-500 mt-2">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-sky-600 text-white rounded-lg font-semibold"
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```
Wrap root inside `src/App.tsx`:
```tsx
<ErrorBoundary>
  <SettingsProvider>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </SettingsProvider>
</ErrorBoundary>
```

---

## Verification Test Scripts Summary

The following test suites exist in `scripts/` to verify these fixes automatically:
- `test-all-twenty-bugs.cjs` (Verifies Bugs #1 through #20)
- `test-bugs-23-to-27.mjs` (Verifies Bugs #23 through #27)
- `test-bug27-and-layout.mjs` (Verifies Bug #27, POS 3-column layout, and Donut Chart)
- `test-dashboard-and-reports-fix.mjs` (Verifies Timeframe filter fallbacks and backup restore)
- `test-sales-return-invoice.mjs` (Verifies Sales Return Invoice mathematical model and document structure)

---
*Generated for replication on live web deployment environments.*
