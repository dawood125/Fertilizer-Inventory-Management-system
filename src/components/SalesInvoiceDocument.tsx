import type { Product } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { piecesPerCarton, type SaleUnit } from '@/lib/units';
import { lineBill, roundMoney } from '@/lib/billing';
import defaultBusinessLogo from '@/assets/logo.png';

export interface InvoiceLine {
  product: Product;
  productName?: string;
  quantity: number;
  unit: SaleUnit | string;
  unitPrice: number;
  discount?: number;
  freeItems?: number;
  batch_number?: string | null;
}

export interface SalesInvoiceProps {
  storeName?: string;
  phone?: string | null;
  address?: string | null;
  email?: string | null;
  ntn?: string | null;
  logoSrc?: string | null;
  invoiceNumber: string;
  orderNumber?: string;
  date?: string;
  customerName?: string;
  customerPhone?: string | null;
  customerArea?: string | null;
  customerAddress?: string | null;
  customerNtn?: string | null;
  items: InvoiceLine[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  total: number;
  paidAmount?: number;
  remaining?: number;
  paymentMethod?: string;
  previousBalance?: number;
  currentBalance?: number;
  symbol: string;
  paperSize?: 'A4' | 'A5';
}

/**
 * Ink-saver gray receipt matching assets/index.html.
 * Dimensions: Half-A4 portrait format (148.5mm wide x 210mm high / A5 portrait) or full A4.
 */
export function SalesInvoiceDocument({
  storeName = 'SAEED AND CO',
  phone,
  address,
  email: _email,
  ntn,
  logoSrc,
  invoiceNumber,
  orderNumber,
  date,
  customerName,
  customerPhone,
  customerArea,
  customerAddress,
  customerNtn,
  items,
  subtotal,
  discount = 0,
  tax = 0,
  total,
  paidAmount = 0,
  remaining = 0,
  paymentMethod,
  previousBalance,
  currentBalance,
  symbol,
  paperSize = 'A5',
}: SalesInvoiceProps) {
  const isA4 = paperSize === 'A4';
  const effectiveLogo = logoSrc || defaultBusinessLogo;

  const totalPieces = items.reduce((s, it) => {
    const packing = piecesPerCarton(it.product);
    if (it.unit === 'carton') return s + Number(it.quantity) * packing;
    return s + Number(it.quantity);
  }, 0);

  const totalCartons = items.reduce((s, it) => {
    const packing = piecesPerCarton(it.product);
    if (it.unit === 'carton') return s + Number(it.quantity);
    return s + Number(it.quantity) / packing;
  }, 0);

  const lineSchemeTotal = roundMoney(items.reduce((s, it) => s + Number(it.discount || 0), 0));
  const orderScheme = roundMoney(Math.max(0, Number(discount || 0) - lineSchemeTotal));
  const dateStr = date ? formatDate(date) : formatDate(new Date().toISOString());
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const displayDateTime = `${dateStr} | ${timeStr}`;

  const computedSubtotal = roundMoney(items.reduce((s, it) => s + lineBill(it).net, 0));
  const displaySubtotal = subtotal != null ? roundMoney(subtotal) : computedSubtotal;

  const fmt = (v: number) => formatCurrency(v, symbol);

  return (
    <div className="invoice-container">
      <style>{`
        .invoice-container {
          width: 100%;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          background: #ffffff;
        }

        .invoice-card {
          width: ${isA4 ? '210mm' : '148.5mm'};
          max-width: 100%;
          min-height: auto;
          margin: 0 auto;
          padding: ${isA4 ? '4mm 8mm 6mm 8mm' : '2mm 6mm 3mm 6mm'};
          background: #ffffff;
          box-shadow: 0 0 5px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          font-family: Arial, Helvetica, sans-serif;
          color: #000000;
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* HORIZONTAL BRAND HEADER */
        .brand-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          margin-top: 0;
          margin-bottom: 2px;
          min-height: 24px;
        }

        .brand-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .logo-img {
          height: 24px;
          max-width: 55px;
          object-fit: contain;
          display: inline-block;
          vertical-align: middle;
        }

        .logo-mark {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 900;
          font-style: italic;
          color: #333333;
          border-bottom: 1.5px solid #333333;
          padding: 0 3px;
          transform: skew(-10deg);
        }

        .company-title {
          font-size: 13px;
          font-weight: 900;
          color: #000000;
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }

        .invoice-subtitle {
          font-size: 9px;
          font-weight: 900;
          color: #000000;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin: 0;
          text-align: right;
        }

        /* GRAY OUTLINE BUSINESS BANNER */
        .business-banner {
          border: 1px solid #777777;
          background: #fafafa;
          color: #000000;
          border-radius: 3px;
          padding: 4px 6px;
          display: grid;
          grid-template-columns: 1.2fr 1fr 1fr;
          row-gap: 2px;
          column-gap: 6px;
          margin-top: 3px;
        }

        .banner-box .label {
          font-size: 6px;
          text-transform: uppercase;
          color: #555555;
          font-weight: 700;
          display: block;
        }

        .banner-box .value {
          font-size: 8px;
          font-weight: 700;
          color: #000000;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          display: block;
        }

        /* CUSTOMER & NTN CARDS */
        .customer-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 3px;
          padding: 2px 4px;
          row-gap: 2px;
          column-gap: 6px;
        }

        .meta-label {
          font-size: 6.5px;
          color: #555555;
          font-weight: 600;
          display: block;
        }

        .meta-val {
          font-size: 8px;
          font-weight: 800;
          color: #000000;
          display: block;
        }

        .ntn-card {
          border: 1px solid #aaaaaa;
          border-radius: 3px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          margin-top: 2px;
          padding: 3px 6px;
          background: #ffffff;
        }

        /* TABLE */
        .table-container {
          margin-top: 4px;
        }

        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }

        .invoice-table thead th {
          background: #eeeeee;
          color: #000000;
          font-size: 7px;
          font-weight: 800;
          padding: 3px 2px;
          text-align: center;
          border: 1px solid #888888;
        }

        .invoice-table tbody td {
          border: 1px solid #cccccc;
          font-size: 7.5px;
          padding: 3px 2px;
          text-align: center;
          color: #000000;
        }

        .invoice-table tbody td.product { text-align: left; padding-left: 4px; font-weight: 700; }
        .invoice-table tbody td.total { text-align: right; padding-right: 4px; font-weight: 700; }

        /* SUMMARY SECTION */
        .summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 3px;
          padding-top: 3px;
        }

        .summary-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 7.5px;
          color: #333333;
        }

        .summary-row.bold {
          font-weight: 800;
          color: #000000;
        }

        .summary-row.subtotal {
          border-bottom: 1px solid #cccccc;
          padding-bottom: 2px;
        }

        .summary-row.net-total {
          font-size: 9.5px;
          font-weight: 900;
          color: #000000;
          margin-top: 1px;
        }

        .summary-row.paid { color: #000000; font-weight: 700; }
        .summary-row.remaining { color: #000000; font-weight: 800; }

        /* RECEIPT FOOTER */
        .receipt-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid #999;
          margin-top: 5px;
          padding-top: 4px;
          font-size: 6.5px;
          line-height: 1.2;
          color: #444;
        }

        .footer-left {
          text-align: left;
          white-space: nowrap;
        }

        .footer-right {
          text-align: right;
          direction: rtl;
          white-space: nowrap;
          font-family: Arial, "Noto Naskh Arabic", sans-serif;
          font-size: 7px;
          line-height: 1.35;
          font-weight: 700;
          color: #222;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 1.5px;
        }

        .footer-right > div {
          width: 100%;
          text-align: right;
          direction: rtl;
        }

        .receipt-footer strong {
          color: #000;
          font-weight: 800;
        }

        .footer-divider {
          color: #999;
          margin: 0 3px;
        }

        /* PRINT MEDIA */
        @media print {
          @page {
            size: ${isA4 ? 'A4 portrait' : '148.5mm 210mm'};
            margin: 0 !important;
          }

          html, body {
            width: ${isA4 ? '210mm' : '148.5mm'} !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .invoice-container {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }

          .invoice-card {
            width: 100% !important;
            max-width: ${isA4 ? '210mm' : '148.5mm'} !important;
            min-height: auto !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: ${isA4 ? '4mm 8mm 6mm 8mm' : '2mm 6mm 3mm 6mm'} !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: auto !important;
          }

          .invoice-table {
            page-break-inside: auto !important;
          }

          .invoice-table thead {
            display: table-header-group !important;
          }

          .invoice-table thead th {
            padding: 2px 2px !important;
            font-size: 7px !important;
          }

          .invoice-table tbody tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }

          .invoice-table tbody td {
            padding: 2px 2px !important;
            font-size: 7px !important;
            line-height: 1.15 !important;
          }

          .brand-header {
            margin-top: 0 !important;
            margin-bottom: 2px !important;
          }

          .business-banner {
            margin-top: 2px !important;
            padding: 2px 5px !important;
          }

          .customer-row {
            margin-top: 2px !important;
          }

          .table-container {
            margin-top: 2px !important;
          }

          .summary-grid {
            margin-top: 2px !important;
            padding-top: 2px !important;
            gap: 8px !important;
          }

          .receipt-footer {
            margin-top: 3px !important;
            padding-top: 2px !important;
          }

          .summary-grid, .receipt-footer {
            page-break-inside: avoid !important;
          }

          * {
            -webkit-print-color-adjust: economy;
            print-color-adjust: economy;
          }
        }
      `}</style>

      <div className="invoice-card">
        {/* UPPER CONTENT */}
        <div>
          {/* TOP BRAND HEADER */}
          <div className="brand-header">
            <div className="brand-info">
              {effectiveLogo ? (
                <img src={effectiveLogo} alt="Logo" className="logo-img" />
              ) : (
                <span className="logo-mark">SAC</span>
              )}
              <div className="company-title">{storeName || 'SAEED AND CO'}</div>
            </div>
            <div className="invoice-subtitle">
              SALES INVOICE
            </div>
          </div>

          {/* INK-SAVER GRAY BUSINESS BANNER */}
          <section className="business-banner">
            <div className="banner-box">
              <span className="label">Business</span>
              <span className="value">{storeName || 'SAEED AND CO'}</span>
            </div>
            <div className="banner-box" style={{ gridColumn: 'span 2' }}>
              <span className="label">Address</span>
              <span className="value">{address || '—'}</span>
            </div>
            <div className="banner-box">
              <span className="label">Phone</span>
              <span className="value">{phone || '—'}</span>
            </div>
            <div className="banner-box">
              <span className="label">Invoice #</span>
              <span className="value">{invoiceNumber}</span>
            </div>
            <div className="banner-box">
              <span className="label">Date & Time</span>
              <span className="value">{displayDateTime}</span>
            </div>
          </section>

          {/* CUSTOMER DETAILS */}
          <section className="customer-row">
            <div>
              <span className="meta-label">Customer</span>
              <span className="meta-val">{customerName || 'Walk-in'}</span>
            </div>
            <div>
              <span className="meta-label">Order #</span>
              <span className="meta-val">{orderNumber || '—'}</span>
            </div>
            <div>
              <span className="meta-label">Customer Number</span>
              <span className="meta-val">{customerPhone?.trim() || '—'}</span>
            </div>
            <div>
              <span className="meta-label">Customer Area</span>
              <span className="meta-val">{customerArea?.trim() || '—'}</span>
            </div>
            {customerAddress?.trim() && (
              <div style={{ gridColumn: 'span 2' }}>
                <span className="meta-label">Customer Address</span>
                <span className="meta-val">{customerAddress.trim()}</span>
              </div>
            )}
          </section>

          {/* NTN CARD */}
          <section className="ntn-card">
            <div>
              <span className="meta-label">BUSINESS NTN</span>
              <span className="meta-val">{ntn?.trim() || '—'}</span>
            </div>
            <div>
              <span className="meta-label">CUSTOMER NTN</span>
              <span className="meta-val">{customerNtn?.trim() || '—'}</span>
            </div>
          </section>

          {/* TABLE SECTION */}
          <section className="table-container">
            <table className="invoice-table">
              <thead>
                <tr>
                  <th style={{ width: '4%' }}>Sr</th>
                  <th style={{ width: '24%' }}>Product</th>
                  <th style={{ width: '12%' }}>Batch #</th>
                  <th style={{ width: '10%' }}>Qty (Pcs)</th>
                  <th style={{ width: '8%' }}>Ctn</th>
                  <th style={{ width: '8%' }}>Pcs/Ctn</th>
                  <th style={{ width: '10%' }}>Rate / Pc</th>
                  <th style={{ width: '11%' }}>Gross Amt</th>
                  <th style={{ width: '5%' }}>Disc</th>
                  <th style={{ width: '12%' }}>Net Amt</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const packing = piecesPerCarton(it.product);
                  const isCarton = it.unit === 'carton';
                  const pcsQty = isCarton ? Number(it.quantity) * packing : Number(it.quantity);
                  const cartonQty = isCarton ? Number(it.quantity) : Number(it.quantity) / packing;
                  const pieceRate = isCarton ? Number(it.unitPrice) / packing : Number(it.unitPrice);
                  const billed = lineBill(it);
                  return (
                    <tr key={`${it.product?.id || idx}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td className="product">{it.productName || it.product.name}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '8px' }}>{it.batch_number || '—'}</td>
                      <td>{pcsQty}</td>
                      <td>{cartonQty < 1 ? cartonQty.toFixed(2) : Number.isInteger(cartonQty) ? cartonQty : cartonQty.toFixed(1)}</td>
                      <td>{packing}</td>
                      <td>{fmt(pieceRate)}</td>
                      <td>{fmt(billed.gross)}</td>
                      <td>{billed.discount ? fmt(billed.discount) : '—'}</td>
                      <td className="total">{fmt(billed.net)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>

        {/* LOWER SUMMARY AND FOOTER */}
        <div>
          <section className="summary-grid">
            <div className="summary-col">
              <div className="summary-row">
                <span>Total Pieces</span>
                <strong>{totalPieces}</strong>
              </div>
              <div className="summary-row">
                <span>Total Cartons</span>
                <strong>{totalCartons.toFixed(2)}</strong>
              </div>
              <div className="summary-row">
                <span>Previous Balance</span>
                <strong>{fmt(previousBalance || 0)}</strong>
              </div>
              <div className="summary-row bold">
                <span>Current Balance</span>
                <strong>{fmt(currentBalance ?? ((previousBalance || 0) + (remaining || 0)))}</strong>
              </div>
            </div>

            <div className="summary-col">
              <div className="summary-row subtotal">
                <span>Sub Total</span>
                <span>{fmt(displaySubtotal)}</span>
              </div>
              {orderScheme > 0 && (
                <div className="summary-row">
                  <span>Discount</span>
                  <span>- {fmt(orderScheme)}</span>
                </div>
              )}
              {Number(tax) > 0 && (
                <div className="summary-row">
                  <span>Tax</span>
                  <span>{fmt(tax)}</span>
                </div>
              )}
              <div className="summary-row net-total">
                <span>Net Total</span>
                <span>{fmt(total)}</span>
              </div>
              <div className="summary-row paid">
                <span>Paid {paymentMethod ? `(${paymentMethod})` : ''}</span>
                <span>{fmt(paidAmount)}</span>
              </div>
              <div className="summary-row remaining">
                <span>Remaining</span>
                <span>{fmt(remaining)}</span>
              </div>
            </div>
          </section>

          <footer className="receipt-footer">
            <div className="footer-left">
              <strong>Software Solution By</strong>
              <span className="footer-divider">|</span>
              AIWA Logics
              <span className="footer-divider">|</span>
              032 44427718
            </div>
            <div className="footer-right">
              <div>بل کے بغیر خریدا ہوا مال واپس یا تبدیل نہ ہو گا۔</div>
              <div>سیلز مین کو بل کے بغیر کیش ادا کرنے کا دکاندار خود ذمہ دار ہوگا۔</div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
