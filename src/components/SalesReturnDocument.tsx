import { formatCurrency, formatDate } from '@/lib/utils';
import defaultBusinessLogo from '@/assets/logo.png';

export interface ReturnDocumentItem {
  id?: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  unit?: string;
  reason?: string;
}

export interface SalesReturnDocumentProps {
  storeName?: string;
  phone?: string | null;
  address?: string | null;
  ntn?: string | null;
  logoSrc?: string | null;
  symbol: string;
  returnNumber: string;
  returnDate?: string;
  resolution?: 'refund' | 'credit_note' | 'replace' | string;
  status?: string;

  // Original Order Reference
  originalOrderNumber?: string;
  originalInvoiceNumber?: string;
  originalOrderDate?: string;
  originalOrderTotal?: number;

  // Customer Details
  customerName?: string;
  customerPhone?: string | null;
  customerArea?: string | null;
  customerAddress?: string | null;
  customerNtn?: string | null;
  previousBalance?: number;
  currentBalance?: number;

  // Items & Amounts
  items: ReturnDocumentItem[];
  totalReturnAmount: number;
  revisedOrderTotal?: number;

  paperSize?: 'A4' | 'A5';
}

export function SalesReturnDocument({
  storeName = 'SAEED AND CO',
  phone,
  address,
  ntn,
  logoSrc,
  symbol,
  returnNumber,
  returnDate,
  resolution = 'credit_note',
  status = 'approved',
  originalOrderNumber,
  originalInvoiceNumber,
  originalOrderDate,
  originalOrderTotal = 0,
  customerName = 'Walk-in Customer',
  customerPhone,
  customerArea,
  customerAddress,
  customerNtn,
  previousBalance,
  currentBalance,
  items = [],
  totalReturnAmount,
  revisedOrderTotal,
  paperSize = 'A5',
}: SalesReturnDocumentProps) {
  const isA4 = paperSize === 'A4';
  const effectiveLogo = logoSrc || defaultBusinessLogo;
  const dateStr = returnDate ? formatDate(returnDate) : formatDate(new Date().toISOString());
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const displayDateTime = `${dateStr} | ${timeStr}`;

  const computedTotalReturn = totalReturnAmount != null
    ? totalReturnAmount
    : items.reduce((s, it) => s + Number(it.total_amount || 0), 0);

  const calculatedRevisedTotal = revisedOrderTotal != null
    ? revisedOrderTotal
    : Math.max(0, originalOrderTotal - computedTotalReturn);

  const fmt = (v: number) => formatCurrency(v, symbol);

  const resolutionLabel =
    resolution === 'refund'
      ? 'Cash Drawer Refund (نقد واپسی)'
      : resolution === 'credit_note'
      ? 'Customer Ledger Credit Note (کھاتہ ایڈجسٹمنٹ)'
      : 'Product Replacement (تبادلہ مال)';

  return (
    <div className="return-invoice-container">
      <style>{`
        .return-invoice-container {
          width: 100%;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          background: #ffffff;
        }

        .return-invoice-card {
          width: ${isA4 ? '210mm' : '148.5mm'};
          max-width: 100%;
          min-height: auto;
          margin: 0 auto;
          padding: ${isA4 ? '6mm 10mm 6mm 10mm' : '4mm 6mm 4mm 6mm'};
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          font-family: Arial, Helvetica, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: #000000;
          box-sizing: border-box;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* BRAND HEADER */
        .brand-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          margin-bottom: 4px;
        }

        .brand-info {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .logo-img {
          height: 26px;
          max-width: 60px;
          object-fit: contain;
          display: inline-block;
          vertical-align: middle;
        }

        .company-title {
          font-size: 14px;
          font-weight: 900;
          color: #000000;
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }

        .invoice-subtitle {
          font-size: 10px;
          font-weight: 900;
          color: #b91c1c;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin: 0;
          text-align: right;
        }

        /* BUSINESS BANNER */
        .business-banner {
          border: 1px solid #991b1b;
          background: #fef2f2;
          color: #000000;
          border-radius: 3px;
          padding: 4px 6px;
          margin-top: 2px;
          margin-bottom: 5px;
        }

        .banner-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8.5px;
          font-weight: 700;
        }

        .banner-row span {
          display: inline-flex;
          align-items: center;
          gap: 3px;
        }

        /* TWO COLUMN INFO META */
        .meta-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          margin-bottom: 6px;
        }

        .meta-box {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 4px 6px;
          font-size: 8.5px;
          line-height: 1.35;
          background: #f8fafc;
        }

        .meta-box-title {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          color: #1e293b;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 2px;
          margin-bottom: 3px;
          display: flex;
          justify-content: space-between;
        }

        .meta-row {
          display: flex;
          margin-bottom: 1.5px;
        }

        .meta-label {
          width: 75px;
          font-weight: 700;
          color: #475569;
          flex-shrink: 0;
        }

        .meta-value {
          font-weight: 800;
          color: #0f172a;
          word-break: break-word;
        }

        /* RETURN TABLE */
        .return-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 6px;
          font-size: 8.5px;
        }

        .return-table th {
          background-color: #1e293b;
          color: #ffffff;
          font-weight: 800;
          text-transform: uppercase;
          font-size: 8px;
          padding: 3.5px 4px;
          border: 1px solid #1e293b;
        }

        .return-table td {
          padding: 3.5px 4px;
          border: 1px solid #cbd5e1;
          vertical-align: middle;
          font-weight: 600;
        }

        .return-table tbody tr:nth-child(even) {
          background-color: #f8fafc;
        }

        /* FINANCIAL SUMMARY GRID */
        .summary-container {
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 6px;
          margin-bottom: 6px;
        }

        .resolution-note-card {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 5px 7px;
          font-size: 8.5px;
          background: #f8fafc;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .urdu-notice {
          font-family: "Jameel Noori Nastaleeq", "Noto Nastaliq Urdu", Arial, sans-serif;
          font-size: 11px;
          font-weight: 700;
          direction: rtl;
          text-align: right;
          color: #0f172a;
          margin-top: 4px;
          line-height: 1.6;
        }

        .summary-box {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          overflow: hidden;
          font-size: 8.5px;
        }

        .summary-row {
          display: flex;
          justify-content: space-between;
          padding: 2.5px 6px;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 700;
        }

        .summary-row.highlight {
          background: #fee2e2;
          color: #991b1b;
          font-weight: 900;
          font-size: 9.5px;
          border-top: 1.5px solid #ef4444;
          border-bottom: 1.5px solid #ef4444;
        }

        .summary-row.revised {
          background: #ecfdf5;
          color: #065f46;
          font-weight: 900;
          font-size: 9px;
        }

        .summary-row.balance {
          background: #f1f5f9;
          font-weight: 900;
        }

        /* SIGNATURES */
        .signature-strip {
          display: flex;
          justify-content: space-between;
          margin-top: 10px;
          padding: 0 10px;
          font-size: 8.5px;
          font-weight: 700;
          color: #475569;
        }

        .sig-box {
          border-top: 1px dashed #94a3b8;
          width: 120px;
          text-align: center;
          padding-top: 2px;
        }

        @media print {
          body {
            margin: 0;
            padding: 0;
            background: #ffffff;
          }
          .return-invoice-card {
            border: none !important;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 3mm 4mm !important;
          }
        }
      `}</style>

      <div className="return-invoice-card">
        {/* BRAND HEADER */}
        <div className="brand-header">
          <div className="brand-info">
            {effectiveLogo && (
              <img src={effectiveLogo} alt="Logo" className="logo-img" />
            )}
            <div>
              <h1 className="company-title">{storeName}</h1>
              <p style={{ margin: 0, fontSize: '8px', fontWeight: 700, color: '#64748b' }}>
                FERTILIZER & CHEMICALS DEALERSHIP
              </p>
            </div>
          </div>
          <div>
            <h2 className="invoice-subtitle">SALES RETURN & CREDIT NOTE</h2>
            <p style={{ margin: 0, fontSize: '7.5px', fontWeight: 700, color: '#64748b', textAlign: 'right' }}>
              واپسی بل و کریڈٹ نوٹ
            </p>
          </div>
        </div>

        {/* BUSINESS INFO BANNER */}
        <div className="business-banner">
          <div className="banner-row">
            <span>📍 {address || 'Shop / Warehouse, Main Bazar'}</span>
            <span>📞 {phone || '—'}</span>
            <span>🏛️ NTN: {ntn?.trim() || 'Applied / None'}</span>
          </div>
        </div>

        {/* CUSTOMER & RETURN META INFO */}
        <div className="meta-container">
          {/* Customer Meta */}
          <div className="meta-box">
            <div className="meta-box-title">
              <span>Customer Details</span>
              <span style={{ fontSize: '8px', color: '#64748b' }}>کسٹمر تفصیل</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Customer:</span>
              <span className="meta-value">{customerName}</span>
            </div>
            {customerArea && (
              <div className="meta-row">
                <span className="meta-label">Area / Town:</span>
                <span className="meta-value">{customerArea}</span>
              </div>
            )}
            {customerPhone && (
              <div className="meta-row">
                <span className="meta-label">Phone:</span>
                <span className="meta-value">{customerPhone}</span>
              </div>
            )}
            {customerNtn && (
              <div className="meta-row">
                <span className="meta-label">STRN / NTN:</span>
                <span className="meta-value">{customerNtn}</span>
              </div>
            )}
          </div>

          {/* Return & Original Invoice Meta */}
          <div className="meta-box">
            <div className="meta-box-title">
              <span>Return Reference</span>
              <span style={{ fontSize: '8px', color: '#64748b' }}>واپسی حوالہ</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Return #:</span>
              <span className="meta-value font-mono text-rose-700">{returnNumber}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Return Date:</span>
              <span className="meta-value">{displayDateTime}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Original Bill #:</span>
              <span className="meta-value font-mono">
                {originalInvoiceNumber || originalOrderNumber || '—'}
              </span>
            </div>
            {originalOrderDate && (
              <div className="meta-row">
                <span className="meta-label">Bill Date:</span>
                <span className="meta-value">{formatDate(originalOrderDate)}</span>
              </div>
            )}
            <div className="meta-row">
              <span className="meta-label">Resolution:</span>
              <span className="meta-value text-slate-800">{resolutionLabel.split('(')[0]}</span>
            </div>
          </div>
        </div>

        {/* RETURNED ITEMS TABLE */}
        <table className="return-table">
          <thead>
            <tr>
              <th style={{ width: '5%', textAlign: 'center' }}>S#</th>
              <th style={{ width: '40%' }}>Returned Item Description</th>
              <th style={{ width: '15%', textAlign: 'center' }}>Reason</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Unit</th>
              <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
              <th style={{ width: '10%', textAlign: 'right' }}>Rate</th>
              <th style={{ width: '12%', textAlign: 'right' }}>Credit Amt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id || idx}>
                <td style={{ textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                <td style={{ fontWeight: 800 }}>{it.product_name}</td>
                <td style={{ textAlign: 'center', textTransform: 'capitalize', color: '#64748b', fontSize: '8px' }}>
                  {it.reason?.replace('_', ' ') || 'Defect / Return'}
                </td>
                <td style={{ textAlign: 'center', color: '#475569' }}>
                  {it.unit || 'Carton'}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800 }}>
                  {it.quantity}
                </td>
                <td style={{ textAlign: 'right' }}>
                  {fmt(it.unit_price)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 900, color: '#991b1b' }}>
                  {fmt(it.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* SUMMARY & REVISION GRID */}
        <div className="summary-container">
          <div className="resolution-note-card">
            <div>
              <div style={{ fontWeight: 800, textTransform: 'uppercase', color: '#475569', fontSize: '8px', marginBottom: '2px' }}>
                Resolution & Accounting Policy
              </div>
              <p style={{ margin: 0, color: '#1e293b' }}>
                <strong>Method:</strong> {resolutionLabel}
              </p>
              <p style={{ margin: '2px 0 0 0', color: '#64748b', fontSize: '8px' }}>
                Status: <strong>{status?.toUpperCase()}</strong>. Inventory has been returned to stock or marked for supplier return.
              </p>
            </div>
            <div className="urdu-notice">
              واپسی شدہ مال کی مالیت کسٹمر کھاتہ میں درست کر دی گئی ہے۔
            </div>
          </div>

          <div className="summary-box">
            {originalOrderTotal > 0 && (
              <div className="summary-row">
                <span>Original Invoice Total:</span>
                <span>{fmt(originalOrderTotal)}</span>
              </div>
            )}
            <div className="summary-row highlight">
              <span>Total Return Credit (واپسی مالیت):</span>
              <span>- {fmt(computedTotalReturn)}</span>
            </div>
            {originalOrderTotal > 0 && (
              <div className="summary-row revised">
                <span>Revised Invoice Net Total:</span>
                <span>{fmt(calculatedRevisedTotal)}</span>
              </div>
            )}
            {previousBalance != null && (
              <div className="summary-row">
                <span>Previous Balance:</span>
                <span>{fmt(previousBalance)}</span>
              </div>
            )}
            {currentBalance != null && (
              <div className="summary-row balance">
                <span>Updated Customer Balance:</span>
                <span className={currentBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                  {fmt(currentBalance)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* SIGNATURES */}
        <div className="signature-strip">
          <div className="sig-box">Checked & Prepared By</div>
          <div className="sig-box">Customer Signature / Receiver</div>
        </div>
      </div>
    </div>
  );
}
