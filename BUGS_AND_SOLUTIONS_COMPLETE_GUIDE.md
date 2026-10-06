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
```

---

### Feature: Sales Order Original Invoice Instant Update upon Sales Return (Net Active Items & Revision Sync)
#### 1. User Complaint
> *"Currently when we return item it show the invoice in return that we just recently updated but client want that the original invoice that is stored in sales order also update and do not show the return item and only the show the item that we sale like client mean to say that when return items or full bill then it also updated the original invoice in sale order immediately. But make sure our calculation and data calculation will not disturb and everything calculate correctly."*

#### 2. Root Cause & Architectural Considerations
In POS & ERP systems:
- Hard-deleting rows from `order_items` when a return occurs corrupts audit trails, destroys original POS sale records, and causes double-subtraction in Gross Sales reports (`Gross Sales - Sales Returns = Net Sales` would subtract the return twice if `order_items` were mutated directly).
- However, when a client re-opens or reprints an invoice from the **Sales Orders** page (`Orders.tsx`), displaying the original pre-return quantities (e.g. 10 cartons totaling Rs. 15,000) while the order total says Rs. 12,000 creates confusion for cashiers and customers.
- The client required that the Sales Order invoice reflect **only active kept items** with updated net quantities, while completely omitting fully returned products.

#### 3. Plan
1. **Dynamic Active Items Projection (`Orders.tsx`)**:
   - In `openView(order)`, fetch approved `sales_returns` for the order alongside `order_items`.
   - Compute `returned_quantity` per product line and derive `net_quantity = Math.max(0, original_quantity - returned_quantity)`.
   - Pro-rate line discounts: `netDiscount = (origDiscount / origQty) * netQty`.
   - Recompute line net total: `netTotal = (netQty * unitPrice) - netDiscount`.
2. **Sales Invoice Document (`SalesInvoiceDocument.tsx`)**:
   - Omit items where `net_quantity <= 0` (so fully returned goods do not appear on the reprinted sales invoice).
   - Pass active kept items with their net quantities and recomputed net line totals.
   - If 100% of the bill was returned, render a clean informative notice `(All items on this order were returned)` with 0 total.
   - Keep `Subtotal`, `Discount`, `Tax`, `Net Total`, `Paid Amount`, `Remaining Due`, `Previous Balance`, and `Grand Total` 100% mathematically aligned.
3. **Order Details Modal (`Orders.tsx`)**:
   - Display a prominent alert banner when an order has approved returns: `Sales Return Applied: Returned Rs. X`.
   - Table displays active kept quantities with subtext: `Y ctn returned (Original: Z)`.
   - Below the financial summary, render a dedicated **Returned Items Summary** audit box showing return voucher numbers, products, and credit amounts.
4. **Order State Synchronization (`SalesReturns.tsx`)**:
   - When a return is created or approved, update `orders` table with `subtotal: netKeptSubtotal`, `total: netKeptTotal`, `paid_amount: netAllocatedPaid`, and `payment_status`.
5. **Ledger & Audit Integrity**:
   - Preserve `order_items`, `stock_movements`, and `transactions` tables to guarantee that inventory counts, ledger entries, and Profit & Loss reports remain 100% accurate without double-counting.

#### 4. Implementation
**File:** `src/pages/Orders.tsx`
```tsx
const [allItems, allPayments, products, allOrders, customer, rawReturns] = await Promise.all([
  api.get<OrderItem[]>('/api/data/order_items'),
  api.get<OrderPayment[]>('/api/data/order_payments'),
  api.get<Product[]>('/api/data/products?limit=10000'),
  api.get<Order[]>('/api/data/orders?limit=10000').catch(() => []),
  order.customer_id ? api.get<any>(`/api/data/customers/${order.customer_id}`).catch(() => null) : Promise.resolve(null),
  api.get<any[]>(`/api/data/sales_returns?order_id=${order.id}`).catch(() => []),
]);

const approvedReturns = (rawReturns || []).filter(
  (r: any) => (r.status || 'approved') !== 'rejected'
);

// Map returned quantities
const returnsByProdId = new Map<string, number>();
for (const ret of approvedReturns) {
  const qty = Number(ret.quantity || 0);
  if (ret.product_id) {
    returnsByProdId.set(ret.product_id, (returnsByProdId.get(ret.product_id) || 0) + qty);
  }
}

// Compute net active items
const mappedItems = rawItems.map((i) => {
  const origQty = Number(i.quantity || 0);
  const returnQty = Math.min(origQty, returnsByProdId.get(i.product_id) || 0);
  const netQty = Math.max(0, origQty - returnQty);
  const netTotal = Math.round((netQty * Number(i.unit_price)) * 100) / 100;
  return {
    ...i,
    original_quantity: origQty,
    returned_quantity: returnQty,
    net_quantity: netQty,
    quantity: netQty,
    total: netTotal,
  };
});

// Omit fully returned items from active invoice view
const activeKeptItems = mappedItems.filter((i) => i.net_quantity > 0);
const netSubtotal = activeKeptItems.reduce((s, it) => s + Number(it.total || 0), 0);
```

**File:** `src/pages/SalesReturns.tsx`
```tsx
const netKeptTotal = Math.max(0, oldTotal - grandTotal);
const netKeptSubtotal = Math.max(0, oldSubtotal - grandTotal);
const netAllocatedPaid = Math.min(oldPaid, netKeptTotal);
const newPaymentStatus = (netKeptTotal <= netAllocatedPaid) ? 'paid' : (netAllocatedPaid > 0 ? 'partial' : 'unpaid');

await api.put(`/api/data/orders/${order.id}`, {
  subtotal: netKeptSubtotal,
  total: netKeptTotal,
  paid_amount: netAllocatedPaid,
  payment_status: newPaymentStatus,
});
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
1. Schema divergence: `order_items` (sales) uses `unit_price`, but `purchase_items` (purchases) uses `unit_cost`. The supplier opening balance helper erroneously posted `{ unit_price: openingDue }` to `/api/data/purchase_items`. SQLite threw an unhandled exception.
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

## Module 8: Hardware, Printing & Page Layout

### Bug #28: Physical Printer Edge Clipping on A5/A4 Bills (Non-Printable Roller Margin Protection)
#### 1. User Complaint
> *"I have sent the updated installer to my partner and he tested the system with client. And when he printed the bills then it does not printing correctly and properly. Please analyze the image carefully and find the bug and fix it and test it properly and then give me updated installer."*
*(Physical printouts on A5 half-A4 paper suffered severe edge clipping: "BUSINESS" became "USINESS", "Sr" serial column was truncated or completely invisible, right edge chopped the last digits of all totals like "Rs 4,320" -> "Rs 4,3" and "Rs 14,040" -> "Rs 14,0", summary amounts were clipped, and the top brand header was cut in half).*

#### 2. Root Cause
1. **Zero-Margin Suppression in Electron & Global Styles**:
   - `electron/main.js` previously set `margins: { marginType: 'none', top: 0, bottom: 0, left: 0, right: 0 }, marginsType: 1` in `silent-print`.
   - `src/index.css` had a global `@media print { @page { margin: 0 !important; } }`.
   - This forced Chromium to render content starting directly at physical paper coordinate $(0, 0)$.
2. **Physical Mechanical Printer Feed Limitations**:
   - Real-world desktop laser, inkjet, and thermal printers (HP, Epson, Canon, Brother) have physical feed rollers that physically cannot deposit ink/toner within $4.5\text{mm} - 6\text{mm}$ of the physical paper edges.
   - When coordinates $(0, 0)$ to $(148.5\text{mm}, 210\text{mm})$ were printed without safety margins, the rollers cut off ~5mm of the left edge (eating "B", "S", and the entire "Sr" column), ~5mm of the right edge (eating the last digits of the "Total" column and summary numbers), and ~4mm of the top edge.
3. **Table Column Allocation Flaws**:
   - The `Sr` column was allocated only $4\%$ ($5.46\text{mm}$ on A5), which placed it entirely within the left roller dead zone.
   - The `Total` column was allocated only $12\%$, and right-aligned text touched the right paper edge.
   - The header text `Carton Rate` wrapped into two lines (`Carton` / `Rate`) on compact paper.
4. **Sales Return Document Missing Print Styles**:
   - `SalesReturnDocument.tsx` lacked an `@media print` style block and had table column widths totaling $116\%$.

#### 3. Plan
1. **Enforce Safe Physical Page Margins**:
   - In `electron/main.js`, configure `silent-print` and `save-pdf` with `margins: { marginType: 'default' }, marginsType: 0` so Chromium strictly honors CSS `@page` declarations.
   - In `src/index.css`, eliminate conflicting zero-margin `@page` overrides.
   - In `SalesInvoiceDocument.tsx` & `SalesReturnDocument.tsx`, set explicit `@page` margins:
     `@page { size: ${isA4 ? 'A4 portrait' : '148.5mm 210mm'}; margin: ${isA4 ? '8mm 8mm 8mm 8mm' : '5mm 6mm 5mm 6mm'} !important; }`
     This reserves a safe 6mm left/right and 5mm top/bottom margin on every printed page (Pages 1, 2, 3...).
2. **Rebalance Table Column Widths (Summing to exactly 100%)**:
   - `Sr`: `5.5%` (centered, room for numbers 1 to 999)
   - `Product`: `27%` (generous room for descriptions)
   - `Carton`: `7%`
   - `Packing`: `7%`
   - `Box Rate`: `10%`
   - `Ctn Rate`: `11.5%` (renamed from "Carton Rate" to "Ctn Rate" to prevent multi-line breaks)
   - `Amount`: `11%`
   - `DISC`: `7%`
   - `Total`: `14%` (`white-space: nowrap; padding-right: 4px;` so amounts never clip)
   - Sum: $5.5 + 27 + 7 + 7 + 10 + 11.5 + 11 + 7 + 14 = 100.0\%$.
3. **Add Border & Text Safety Padding**:
   - Assign `className="sr"` and `className="total"` to table cells.
   - Give `.summary-row` `white-space: nowrap; padding-right: 2px;`.
   - Update `.business-banner` grid to `1.15fr 0.95fr 1.3fr` so long address names have ample space.
4. **Sales Return Document Polish**:
   - Implement matching `@media print` rules and normalize column widths to $100\%$.

#### 4. Implementation
**File:** `electron/main.js`
```javascript
// Silent print — sends directly to the default printer without dialog
ipcMain.handle('silent-print', async (_event, options) => {
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  if (!win) return { ok: false, error: 'No window' };
  try {
    const isHalfPage = options?.halfPage === true;
    const printOptions = {
      silent: options?.silent !== false,
      printBackground: true,
      color: false, // ink-saver gray receipt — grayscale
      landscape: false,
      pageSize: isHalfPage ? 'A5' : 'A4',
      margins: { marginType: 'default' },
      marginsType: 0, // 0 = default (strictly respects CSS @page rules in the printed document)
      duplexMode: options?.duplexMode || 'longEdge',
    };

    await new Promise((resolve, reject) => {
      win.webContents.print(printOptions, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || 'Print failed'));
      });
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});
```

**File:** `src/components/SalesInvoiceDocument.tsx`
```css
@media print {
  @page {
    size: ${isA4 ? 'A4 portrait' : '148.5mm 210mm'};
    margin: ${isA4 ? '8mm 8mm 8mm 8mm' : '5mm 6mm 5mm 6mm'} !important;
  }

  .invoice-card {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-height: auto !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    box-shadow: none !important;
    border: none !important;
    page-break-after: auto !important;
    break-after: auto !important;
    box-sizing: border-box !important;
  }

  .invoice-table thead th {
    padding: 3px 2px !important;
    font-size: 9px !important;
    font-weight: 900 !important;
    background: #e2e8f0 !important;
    border: 1.5px solid #475569 !important;
    color: #000000 !important;
    white-space: nowrap !important;
  }

  .invoice-table tbody td {
    padding: 2.5px 2px !important;
    font-size: 8.5px !important;
    line-height: 1.2 !important;
    border: 1px solid #64748b !important;
    color: #000000 !important;
  }

  .invoice-table tbody td.sr {
    text-align: center !important;
    padding: 2.5px 1px !important;
    font-weight: 700 !important;
  }

  .invoice-table tbody td.product {
    font-size: 9px !important;
    font-weight: 700 !important;
    padding-left: 3px !important;
  }

  .invoice-table tbody td.total {
    font-size: 9px !important;
    font-weight: 900 !important;
    padding-right: 3px !important;
    white-space: nowrap !important;
  }
}
```

Table Headers:
```tsx
<thead>
  <tr>
    <th style={{ width: '5.5%' }}>Sr</th>
    <th style={{ width: '27%' }}>Product</th>
    <th style={{ width: '7%' }}>Carton</th>
    <th style={{ width: '7%' }}>Packing</th>
    <th style={{ width: '10%' }}>Box Rate</th>
    <th style={{ width: '11.5%' }}>Ctn Rate</th>
    <th style={{ width: '11%' }}>Amount</th>
    <th style={{ width: '7%' }}>DISC</th>
    <th style={{ width: '14%' }}>Total</th>
  </tr>
</thead>
```

---

## Module 9: Customer Store Credits & Supplier Credits (Due to Us) Auto-Settlement

### Overview & Real-World Use Case
In wholesale operations:
1. **Customer Store Credits (Negative Balance / Advance / Credit Note)**: When a customer returns goods and chooses a Credit Note resolution instead of immediate cash payout, the customer's balance becomes negative (`customer.balance < 0`). This means the store owes money / credit to the customer. When this customer makes a new purchase, the cashier needs the ability to automatically apply / settle this credit against the new bill, collect only the remaining net cash, mark the bill as paid without falsely demanding full cash, and print the exact breakdown on the customer's sales invoice.
2. **Supplier Credits (Negative Balance / Due to Us)**: When our store returns defective biscuits or damaged stock to a manufacturer/supplier with a Credit Note, the supplier balance decreases into negative (`supplier.balance < 0`), meaning the supplier owes us credit / money. When we place a new purchase order with that supplier, the manager can settle our advance credit against the new PO, reducing our accounts payable accordingly.

---

### Key Technical & Accounting Invariants

1. **Customer Store Credit Formula**:
   - `availableStoreCredit = balance < 0 ? Math.abs(balance) : 0`
   - `storeCreditApplied = Math.min(availableStoreCredit, bill.total)`
   - `cashDue = Math.max(0, bill.total - storeCreditApplied)`
   - If paid in full (`paymentType === 'full'`): `cashPaid = cashDue`, `effectivePaid = storeCreditApplied + cashPaid = bill.total`, `remaining = 0`, `paymentStatus = 'paid'`.
   - **Balance Update Invariant**:
     $$\text{newCustomerBal} = \text{oldCustomerBal} + \text{remaining} + \text{storeCreditApplied}$$
     - *Example 1 (Full coverage)*: Old balance $-2,000$. Bill $1,500$. Store credit applied $1,500$. Cash paid $0$. Remaining $0$. $\implies -2,000 + 0 + 1,500 = -500$ (Store credit remaining is Rs. 500).
     - *Example 2 (Exact settlement)*: Old balance $-2,000$. Bill $2,000$. Store credit applied $2,000$. Cash paid $0$. Remaining $0$. $\implies -2,000 + 0 + 2,000 = 0$ (Account cleared).
     - *Example 3 (Split payment)*: Old balance $-2,000$. Bill $5,000$. Store credit applied $2,000$. Cash paid $3,000$. Remaining $0$. $\implies -2,000 + 0 + 2,000 = 0$.

2. **Cash Drawer / Bank Safety**:
   - Store credit redemption is recorded in `order_payments` with `method: 'store_credit'` and `account_type: null`.
   - Cash register accounts only receive actual cash collected (`cashPaid`), preventing false cash drawer inflation.

3. **Sales Invoice Breakdown (`SalesInvoiceDocument.tsx`)**:
   - Displays green row: `Store Credit Used: - Rs. X`.
   - Paid row: `Paid (cash + Credit): Rs. Y`.
   - Previous Balance row shows: `Prev Store Credit: - Rs. Z` when balance is negative.
   - Grand Total row shows: `Remaining Store Credit: - Rs. W` when balance remains negative.

4. **Supplier Credit Settlement Formula**:
   - `availableSupplierCredit = supplier.balance < 0 ? Math.abs(supplier.balance) : 0`
   - `supplierCreditSettled = Math.min(availableSupplierCredit, po.total)`
   - On PO Creation: `paid_amount = supplierCreditSettled`, `supplier_credit_used = supplierCreditSettled`.
   - **Balance Update Invariant on Receive**:
     $$\text{newSupplierBal} = \text{oldSupplierBal} + \text{poDue} + \text{po.supplier\_credit\_used}$$
     - *Example 1*: Supplier balance $-10,000$. PO total $6,000$. Credit settled $6,000$. Due $0$. $\implies -10,000 + 0 + 6,000 = -4,000$ (Supplier still owes us Rs. 4,000).
     - *Example 2*: Supplier balance $-10,000$. PO total $25,000$. Credit settled $10,000$. Due $15,000$. $\implies -10,000 + 15,000 + 10,000 = +15,000$ (Net payable is Rs. 15,000).

5. **Database Migration**:
   - Migration `015_store_credit_settlement`:
     - `ALTER TABLE orders ADD COLUMN store_credit_used INTEGER DEFAULT 0;`
     - `ALTER TABLE purchase_orders ADD COLUMN supplier_credit_used INTEGER DEFAULT 0;`

---

## Bug #28: Customer Store Credit Inadvertent Over-Reporting on Invoice Preview

### Root Cause
1. In `Orders.tsx` (`openView`), when opening an invoice preview, historical balance was naively computed by summing all prior trade order totals and subtracting all prior payments.
2. If earlier orders had goods returned via credit notes or cash refunds, the order's total in the database was reduced, but historical payments were unchanged, causing the calculation to ignore credit notes and cash refunds and produce distorted negative balances (e.g. showing `- Rs 11,395` instead of the actual `Rs 8,640` store credit).
3. The invoice document rendered negative store credits with minus signs (`- Rs ...`), which confused users because store credit is already an asset in customer favor.

### Solution
1. **Migration 016 (`016_order_previous_balance`)**: Added `previous_balance INTEGER DEFAULT NULL` to the `orders` table.
2. **Snapshot on Checkout (`POS.tsx`)**: Captured and persisted `previous_balance: selectedCustomer ? selectedCustomer.balance : 0` directly on the order record at POS checkout.
3. **Accurate Backwards Balance Derivation (`Orders.tsx`)**:
   - Checks if `previous_balance` exists on the order record.
   - If null, calculates backwards from the customer's current balance:
     $$\text{previousBalance} = \text{customer.balance} - (\text{orderRemaining} + \text{storeCreditUsed}) - \sum_{\text{subsequent orders}} \Delta$$
   - Auto-backfills and persists `previous_balance` to the order record.
4. **Display Polish (`SalesInvoiceDocument.tsx`)**: Formatted `Prev Store Credit` and `Remaining Store Credit` as clean positive values (`Rs 8,640`) in emerald green (`#047857`) without minus signs.

---

## Bug #29: Purchase Order Bill Layout Cut Off When Printing on A5

### Root Cause
1. While Sales Invoices and Sales Returns had dedicated printable documents (`SalesInvoiceDocument.tsx` and `SalesReturnDocument.tsx`) with strict `@page { size: 148.5mm 210mm; margin: 5mm 6mm; }` media styles and percentage-based table widths, Purchase Orders were using the generic `<PrintDocument>` component.
2. `<PrintDocument>` lacked `@page` print rules, using a 3-column header grid that overflowed on A5 width (148.5mm), clipping the `PO #` box and pushing the `Cost / Carton` and `Total` columns off the right margin.
3. `Purchasing.tsx` did not pass `halfPage` to `<PrintPreview>`, causing Electron's `savePdf` to export an A4 PDF that was clipped when printed on A5 paper.

### Solution
1. **Dedicated Component (`PurchaseOrderDocument.tsx`)**:
   - Built a specialized printable document with `@page { size: ${isA4 ? 'A4 portrait' : '148.5mm 210mm'}; margin: ${isA4 ? '8mm' : '5mm 6mm'}; }`.
   - Ink-saver grayscale layout matching company invoice standards.
   - Percentage-based table column widths: `Sr` (6%), `Product` (44%), `Qty` (16%), `Cost / Ctn` (16%), `Total` (18%) totaling 100%.
   - `white-space: nowrap !important;` on all amounts and numeric columns.
   - Fits 100% within the printable bounds on both A4 and A5 paper without clipping.
2. **PrintPreview Integration (`Purchasing.tsx`)**:
   - Replaced `<PrintDocument>` with `<PurchaseOrderDocument>`.
   - Added `halfPage={settings?.receipt_size !== 'A4'}` to `PrintPreview`.

---

## Bug #30: "Return Items" Button in Order Modal Redirected to Dashboard

### Root Cause
1. In `src/pages/Orders.tsx`, clicking the "Return Items" button navigated to `#/sales-returns?order_id=${oid}`.
2. `useHashRoute()` in `src/lib/router.tsx` read `window.location.hash.slice(1)` without stripping query strings, setting `route` to `'/sales-returns?order_id=...'`.
3. In `src/App.tsx`, the `switch (route)` statement evaluated this exact string, failed to match `case '/sales-returns':`, and hit the default case: `<Dashboard navigate={navigate} />`.

### Solution
1. **Hash Path Normalization (`src/lib/router.tsx`)**:
   - Updated `useHashRoute` to clean the route pathname by splitting off query parameters:
     ```ts
     const getPath = () => (window.location.hash.slice(1) || '/').split('?')[0] || '/';
     ```
   - Matches the route `/sales-returns` accurately in `App.tsx` and maintains sidebar menu selection in `AppShell`.
2. **Preserved Query Parsing (`SalesReturns.tsx`)**:
   - `SalesReturns.tsx` continues to read `window.location.hash`, extracts `order_id`, pre-selects the order, and immediately opens the Create Return modal.

---

## Bug #31: Ability to Record Custom Payment Date & Time for Offline/Backdated Receipts

### Root Cause
1. In `PendingPayments` (`src/pages/Payments.tsx`), when receiving a payment, the modal only allowed input of the amount, method, and remarks.
2. The payment timestamp was automatically hardcoded to current time (`nowISO()`) by both the frontend and backend (`resources.js`), preventing clients from recording payments received on earlier dates/days.

### Solution
1. **Editable Date & Time Field (`Payments.tsx`)**:
   - Added a `datetime-local` input field to `PayModal` pre-filled with the current date/time.
   - Allows users to backdate payments to the actual date received.
2. **Backend Timestamp Honor (`server/routes/resources.js`)**:
   - Updated `resources.js` to preserve `req.body.created_at` when provided instead of overriding with current timestamp.
3. **Ledger & Transaction Alignment**:
   - Passes the selected timestamp to `order_payments`, `supplier_payments`, and `transactions` (`date` and `created_at`), ensuring payment histories, statements, and reports reflect the accurate transaction date.

---

## Bug #32: Supplier Page Showing Discrepant Balance Compared to Pending Payments

### Root Cause
1. **Asymmetric PO Creation vs. Payment**:
   - When a purchase order was created with status `'pending'`, its liability (`po.total`) was not added to `supplier.balance` (the system only attempted to add it later upon pressing "Receive").
   - However, if the user paid for this purchase order before receiving it (e.g. from the Pending Payments screen or immediately upon order), the payment code in `Payments.tsx` subtracted `amount` from `supplier.balance`.
   - Because the purchase obligation had never been added to `supplier.balance`, deducting the payment prematurely reduced the supplier's previous opening balance debt ($15,000 - 2,986 = 12,014).
2. **Dead-End on Receive**:
   - In `receivePO`, the code computed `due = Math.max(0, po.total - po.paid_amount)`.
   - Since the PO had already been paid, `due` was 0, so receiving the PO added 0 to the supplier balance, trapping the balance at Rs 12,014 forever.
3. **Discrepancy with Pending Payments**:
   - `Payments.tsx` calculates dues per PO (`po.total - po.paid_amount`). `PO-OB` was Rs 15,000 unpaid, and `PO-3185` was Rs 2,986 fully paid, so Pending Payments correctly showed Rs 15,000.
   - The Suppliers page showed the corrupted static column (Rs 12,014).

### Solution
1. **Migration 017 (`017_reconcile_supplier_balances`)**:
   - Reconciles supplier balances directly from all active purchase orders and approved credit returns across the database:
     $$\text{balance} = \sum_{\text{All POs}} (\text{po.total} - \text{po.paid\_amount}) - \sum_{\text{Credit Returns}} \text{total\_amount}$$
2. **Self-Healing Reconciliation (`Purchasing.tsx`)**:
   - In `Suppliers.tsx` `load()` and `openView()`, dynamically computes each supplier's true outstanding payable directly from their purchase orders and approved credit returns. If the stored database balance drifted, it automatically self-heals and updates the database.
   - Displays the reconciled balance (Rs 15,000) in both the table and the Supplier Profile & Ledger modal header.
3. **Harmonized PO Creation & Receive Lifecycles**:
   - In `CreatePOModal`: Tracks the purchase obligation upon creation, updates `supplier.balance` with `total - supplierCreditSettled`, and records advance credit redemption if applicable.
   - In `receivePO`: Synchronizes the supplier balance from live PO dues and credit returns, preventing double-counting or loss of paid balances when receiving stock.
   - In `Payments.tsx`: Recalculates and synchronizes the supplier balance from remaining PO dues upon recording payment.

---

## Bug #33: Pending Payments Modal Sizing & Supplier Credit Settle Checkbox Override

### 1. User Complaint
> *"First is that modal is not appearing correctly. Also decrease the height of modal and increase the width of it. And second error is that Supplier Credits (Due to Us) is not working correctly. like the i have return a purchase order in credit and supplier owes us to 2000 or something and when i created a new purchase and uncheck the credit score settle and create the order but still system automatically settle the credit score and still it was showing pay 2000 to supplier."*

### 2. Root Cause
1. **Modal Dimensions**: In `Payments.tsx`, the payment modal was constrained to `max-w-md` (28rem / 448px) and did not have explicit max-height management, causing vertical stretching and a cramped appearance on desktop displays.
2. **Checkbox Override on PO Creation**: In `Purchasing.tsx`, the `CreatePOModal` component maintained a checkbox state `settleSupplierCredit`, but the submit handler hardcoded `supplierCreditSettled = Math.min(availableSupplierCredit, total)` without checking whether `settleSupplierCredit` was `true`. Even when the user unchecked the box, the system unconditionally subtracted supplier credit.

### 3. Solution
1. **Modal Sizing (`Payments.tsx`)**:
   - Expanded payment modal width to `max-w-xl` (36rem / 576px) and added `max-h-[85vh] overflow-y-auto` with clean padding and header layout.
2. **Respect Settle Checkbox (`Purchasing.tsx`)**:
   - Updated PO creation logic to strictly check:
     `const supplierCreditSettled = settleSupplierCredit ? Math.min(availableSupplierCredit, total) : 0;`
   - If unchecked, `supplier_credit_used = 0`, `paid_amount = 0`, and the supplier's due advance credit is left untouched.

---

## Bug #34: Sales Return Overcrediting on Discounted Bills (Net Billed Unit Price Sync)

### 1. User Complaint
> *"First we created the bill of Asad of 8,806 with discount 249 and then we created another bill with 9500 with some discount that you can see in the screenshot and these both bill were on full partial. Then we return one item of the bill and it was updating data pending payments correctly. then we return the remaining two item of the 8806 bill but the error is that in customer return bill the calculation i think is wrong . it say total return credit is 'Total Return Credit - Rs 6,051' which is not correct i think it should deduct 249 discount."*

### 2. Root Cause
1. **Gross vs. Net Return Rate**:
   - In `order_items`, `unit_price` is the catalog retail price before discount, `discount` is the line discount, and `total` is the net billed amount (`unit_price * quantity - discount`).
   - When generating returns in `SalesReturns.tsx`, the system previously assigned `unit_price: Number(it.unit_price || 0)` directly from `order_items`, using the gross undiscounted catalog rate.
   - For Asad's order `ORD-20261004-4245`:
     - `AMROOD MAZA CANDY`: Catalog Rs 2,755, discount Rs 49, net billed Rs 2,706.
     - `AAM MAZA BOX`: Catalog Rs 2,986, discount Rs 100, net billed Rs 2,886.
     - `AMROOD BOX`: Catalog Rs 3,065, discount Rs 100, net billed Rs 2,965.
     - Gross sum: `Rs 8,806`. Net billed: `Rs 8,557` (Discount `Rs 249`).
   - Returning the first item credited `Rs 2,755` (overcredited by Rs 49).
   - Returning the remaining two items credited `3,065 + 2,986 = Rs 6,051` (overcredited by Rs 200).
   - Across all 3 items, the customer was credited `Rs 8,806` instead of the actual `Rs 8,557` billed.
   - This `Rs 249` of unearned credit was applied against Asad's subsequent bill `ORD-20261004-9604` (Rs 9,500), improperly shrinking his debt to `Rs 9,251`.

### 3. Solution
1. **Effective Net Return Rate (`SalesReturns.tsx`)**:
   - Compute the true net billed unit price per item, factoring in both item-level line discounts and any cart-level order discounts:
     ```ts
     const baseNetRate = soldQty > 0
       ? (lineTotal > 0 ? lineTotal / soldQty : Math.max(0, catalogRate - (lineDisc / soldQty)))
       : catalogRate;
     const effectiveNetRate = Math.round(baseNetRate * orderScale * 100) / 100;
     ```
   - Return totals are calculated as `returnQty * effectiveNetRate`. For Return 2 (`AMROOD BOX` + `AAM MAZA BOX`), the return credit is now correctly `2,965 + 2,886 = Rs 5,851` (not 6,051).
2. **Sales Return Voucher Polish (`SalesReturnDocument.tsx`)**:
   - Extended `ReturnLineItem` with `original_price` and `discount`.
   - Rate column displays net rate with a clear discount badge: `Rs 2,965 (-Rs 100 disc)`.
3. **Database Reconcilation & Migration 019 (`019_reconcile_discounted_sales_returns`)**:
   - Corrected `unit_price` and `total_amount` for the 3 sales return records to their exact net values (`270600`, `288600`, `296500`).
   - Restored Customer Asad's outstanding balance to `Rs 9,500.00` (`950000` paisa).

---

## Bug #35: Customer Bill Appearing under "Walk-in" & Orphaned Pricing Re-linkage (Ehsan Traders)

### 1. User Complaint
> *"First a customer name Ehsan Traders it has a opening balance and client made a new bill of this customer and print it and it was showing all customer detail but we go to sales history then it was not showing the bill for that customer and it saved with walk in customer . why this happened because we have created the bill using a customer so it should be saved with that cusotmer name so why this not happenned."*

### 2. Root Cause
1. **Initial Bill Creation & Customer Re-creation**:
   - Order `ORD-20260928-9866` (Invoice `INV-20260928-7201`, 51 items, Rs 21,083.94) was created under an initial customer record (`c014202a-ccee-468e-a8df-50f3a68a69a7`).
   - 8 minutes later, the customer was re-created with an Opening Balance of Rs 36,124.53 (`OB-20260928-5754`), generating a new ID (`012e165f-82e9-4cd3-b072-764b42b0aad5`). The initial record was deleted.
   - Older order tables did not persist snapshot names. When Migration 014 ran to backfill customer names, looking up `c014202a` returned `NULL`, defaulting `customer_name` to `'Walk-in'`.
   - In Sales History, the bill showed as `Walk-in (archived)` and was missing from Ehsan Traders' filter.
   - 51 negotiated custom prices in `customer_product_prices` were also orphaned under the old ID.
2. **Double-Counting Avoidance**:
   - The opening balance of Rs 36,124.53 entered by the client already bundled the prior balance of ~15 lakh (`1,504,059`) with this 21 lakh (`2,108,394`) bill.
   - Disentangling the true opening balance (`1,504,059`) from the sales bill (`2,108,394`) ensures both orders are attributed to Ehsan Traders without inflating their debt, matching their paid amount of Rs 14,560 and remaining balance of Rs 21,564.53.

### 3. Solution
1. **Migration 020 (`020_relink_ehsan_traders_orders`)**:
   - Re-linked `ORD-20260928-9866` to `customer_id = '012e165f-82e9-4cd3-b072-764b42b0aad5'`, with `customer_name = 'Ehsan Traders'`, `customer_phone = '03091007015'`, and `customer_area = 'Kamoki'`.
   - Re-linked all 51 custom product prices to Ehsan Traders' active ID.
   - Adjusted `OB-20260928-5754` to `1,504,059` and `opening_balance` to `1,504,059`, preserving the net ledger balance of `2,156,453`.
   - Added a global update restoring customer names on any orders that reference a valid customer ID.
2. **Defensive Safeguards in Code**:
   - Updated `server/routes/resources.js` and `server/routes/settings.js` to ensure orders with a valid `customer_id` will never accept or default to `'Walk-in'`.
   - Updated `src/pages/POS.tsx` with fallback customer lookup on submission.
3. **Backup JSON File Updated**:
   - Re-linked order and prices inside `assets/inventory_backup_2026-10-04.json`.

---

## Verification Test Scripts Summary

The following test suites exist in `scripts/` to verify these fixes automatically:
- `test-all-twenty-bugs.cjs` (Verifies Bugs #1 through #20)
- `test-bugs-23-to-27.mjs` (Verifies Bugs #23 through #27)
- `test-bug27-and-layout.mjs` (Verifies Bug #27, POS 3-column layout, and Donut Chart)
- `test-dashboard-and-reports-fix.mjs` (Verifies Timeframe filter fallbacks and backup restore)
- `test-sales-return-invoice.mjs` (Verifies Sales Return Invoice mathematical model and document structure)
- `test-order-return-sync-calculations.mjs` (Verifies net active items calculation and accounting integrity)
- `test-invoice-print-margins.mjs` (Verifies safe @page margins, column widths summing to 100%, and Electron print options)
- `test-store-credit-settlement.mjs` (Verifies customer store credit & supplier credit settlement invariants)
- `test-credit-and-po-fix.mjs` (Verifies Migration 016, Store credit calculation, and PO Document)
- `test-return-redirect-and-payment-date.mjs` (Verifies Bug #30 & #31 route stripping & payment backdating)
- `test-supplier-balance-sync.mjs` (Verifies Bug #32 Supplier balance reconciliation, PO lifecycle & DB consistency)
- `test-discounted-returns-fix.mjs` (Verifies Bug #34 Sales return discount math, net billing rates, and customer balance reconciliation)

---
*Generated for replication on live web deployment environments.*
