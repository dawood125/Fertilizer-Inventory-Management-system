import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import defaultBusinessLogo from '@/assets/logo.png';

export interface PurchaseOrderItem {
  id?: string;
  product_name: string;
  batch_number?: string | null;
  cartons?: number;
  pieces_per_carton?: number;
  quantity: number; // Total pieces
  unit_cost: number;
  total: number;
  retail_price?: number;
  wholesale_price?: number;
  dealer_price?: number;
}

export interface PurchaseOrderDocumentProps {
  storeName?: string;
  phone?: string | null;
  address?: string | null;
  ntn?: string | null;
  logoSrc?: string | null;
  symbol: string;

  // PO Details
  poNumber: string;
  poDate?: string;
  status?: string;
  paymentStatus?: string;
  note?: string | null;
  approvedBy?: string | null;
  requestedBy?: string | null;
  receivedDate?: string | null;

  // Supplier
  supplier?: {
    name?: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    contact_person?: string | null;
  } | null;

  // Items & Financials
  items: PurchaseOrderItem[];
  subtotal: number;
  tax?: number;
  total: number;
  paidAmount?: number;

  paperSize?: 'A4' | 'A5';
}

export function PurchaseOrderDocument({
  storeName = 'SAEED AND CO',
  phone,
  address,
  ntn,
  logoSrc,
  symbol,
  poNumber,
  poDate,
  status = 'pending',
  paymentStatus = 'unpaid',
  note,
  approvedBy,
  requestedBy,
  receivedDate,
  supplier,
  items = [],
  subtotal = 0,
  tax = 0,
  total = 0,
  paidAmount = 0,
  paperSize = 'A5',
}: PurchaseOrderDocumentProps) {
  const isA4 = paperSize === 'A4';
  const effectiveLogo = logoSrc || defaultBusinessLogo;
  const dateStr = poDate ? formatDate(poDate) : formatDate(new Date().toISOString());
  const printTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const fmt = (v: number) => formatCurrency(v, symbol);
  const remainingDue = Math.max(0, total - paidAmount);
  const totalCartons = items.reduce((s, it) => s + Number(it.cartons || (it.pieces_per_carton ? it.quantity / it.pieces_per_carton : 1)), 0);
  const totalPieces = items.reduce((s, it) => s + Number(it.quantity || 0), 0);

  return (
    <div className="po-doc-container">
      <style>{`
        .po-doc-container {
          width: 100%;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
          background: #ffffff;
        }

        .po-doc-card {
          width: ${isA4 ? '210mm' : '148.5mm'};
          max-width: 100%;
          min-height: auto;
          margin: 0 auto;
          padding: ${isA4 ? '6mm 10mm 6mm 10mm' : '4mm 6mm 4mm 6mm'};
          background: #ffffff;
          border: 1px solid #cbd5e1;
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
          color: #0f172a;
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }

        .po-subtitle {
          font-size: 10px;
          font-weight: 900;
          color: #0369a1;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin: 0;
          text-align: right;
        }

        /* BUSINESS BANNER */
        .business-banner {
          border: 1px solid #0284c7;
          background: #f0f9ff;
          color: #000000;
          border-radius: 3px;
          padding: 3px 6px;
          margin-top: 2px;
          margin-bottom: 5px;
        }

        .banner-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8px;
          font-weight: 700;
        }

        /* TWO COLUMN INFO META */
        .meta-container {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 4px;
          margin-bottom: 5px;
        }

        .meta-box {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 4px 6px;
          background: #ffffff;
        }

        .meta-box-title {
          font-size: 8.5px;
          font-weight: 900;
          text-transform: uppercase;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 2px;
          margin-bottom: 3px;
          color: #1e293b;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .meta-row {
          display: flex;
          font-size: 8px;
          line-height: 1.35;
          margin-bottom: 1.5px;
        }

        .meta-label {
          width: 72px;
          font-weight: 700;
          color: #475569;
          flex-shrink: 0;
        }

        .meta-value {
          font-weight: 700;
          color: #000000;
          word-break: break-word;
        }

        /* DATA TABLE */
        .table-wrap {
          width: 100%;
          border: 1px solid #000000;
          border-radius: 2px;
          margin-bottom: 4px;
          overflow: hidden;
        }

        .po-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
          font-size: 8px;
        }

        .po-table th {
          background: #0f172a !important;
          color: #ffffff !important;
          font-weight: 900;
          text-transform: uppercase;
          font-size: 7.5px;
          padding: 3px 2px;
          border: 1px solid #000000;
          text-align: left;
          letter-spacing: 0.2px;
          box-sizing: border-box;
        }

        .po-table td {
          padding: 3px 2px;
          border: 1px solid #cbd5e1;
          color: #000000;
          vertical-align: middle;
          box-sizing: border-box;
          word-break: break-word;
        }

        .po-table tr:nth-child(even) td {
          background: #f8fafc;
        }

        /* FINANCIAL SUMMARY */
        .summary-container {
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          gap: 4px;
          margin-bottom: 5px;
        }

        .summary-box {
          border: 1px solid #cbd5e1;
          border-radius: 3px;
          padding: 4px 6px;
          background: #f8fafc;
        }

        .sum-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 8.5px;
          padding: 1.5px 0;
          color: #334155;
        }

        .sum-row.grand-total {
          border-top: 1.5px solid #000000;
          margin-top: 2px;
          padding-top: 3px;
          font-size: 10px;
          font-weight: 900;
          color: #0f172a;
        }

        .sum-row.balance-due {
          font-size: 9.5px;
          font-weight: 900;
          color: #b91c1c;
        }

        .sum-row.paid-amount {
          font-weight: 800;
          color: #047857;
        }

        /* SIGNATURE FOOTER */
        .signature-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-top: 8px;
          margin-bottom: 4px;
          text-align: center;
        }

        .sig-line {
          border-top: 1px dashed #64748b;
          padding-top: 3px;
          font-size: 7.5px;
          font-weight: 800;
          color: #334155;
        }

        /* PRINT MEDIA QUERIES */
        @media print {
          @page {
            size: ${isA4 ? 'A4 portrait' : '148.5mm 210mm'};
            margin: ${isA4 ? '8mm 8mm' : '5mm 6mm'};
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .po-doc-container {
            width: 100% !important;
            background: #ffffff !important;
          }
          .po-doc-card {
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
          }
          .po-table th {
            background: #0f172a !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="po-doc-card">
        {/* BRAND HEADER */}
        <div className="brand-header">
          <div className="brand-info">
            {effectiveLogo && (
              <img src={effectiveLogo} alt="Logo" className="logo-img" />
            )}
            <div>
              <h1 className="company-title">{storeName}</h1>
            </div>
          </div>
          <div>
            <div className="po-subtitle">Purchase Order Voucher</div>
            <div style={{ fontSize: '7.5px', color: '#64748b', fontWeight: 700 }}>
              {status === 'received' ? 'Stock Received & Logged' : 'Official Purchase Voucher'}
            </div>
          </div>
        </div>

        {/* BUSINESS BANNER */}
        <div className="business-banner">
          <div className="banner-row">
            <span>📍 {address || 'Main Bazar / Wholesale Mandi'}</span>
            <span>📞 {phone || 'Store Helpline'}</span>
            {ntn && <span>🏛️ NTN: {ntn}</span>}
          </div>
        </div>

        {/* TWO-COLUMN INFO META */}
        <div className="meta-container">
          {/* Supplier Info */}
          <div className="meta-box">
            <div className="meta-box-title">
              <span>Supplier Information (سپلائر تفصیل)</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Company / Name:</span>
              <span className="meta-value">{supplier?.name || 'Authorized Supplier'}</span>
            </div>
            {supplier?.contact_person && (
              <div className="meta-row">
                <span className="meta-label">Contact Person:</span>
                <span className="meta-value">{supplier.contact_person}</span>
              </div>
            )}
            <div className="meta-row">
              <span className="meta-label">Phone:</span>
              <span className="meta-value">{supplier?.phone || '—'}</span>
            </div>
            {supplier?.address && (
              <div className="meta-row">
                <span className="meta-label">Address:</span>
                <span className="meta-value">{supplier.address}</span>
              </div>
            )}
          </div>

          {/* PO Reference Meta */}
          <div className="meta-box">
            <div className="meta-box-title">
              <span>PO Reference (آرڈر حوالہ)</span>
              <span style={{ fontSize: '7.5px', color: '#0369a1' }}>#{poNumber}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">PO Date:</span>
              <span className="meta-value">{dateStr}</span>
            </div>
            <div className="meta-row">
              <span className="meta-label">PO Status:</span>
              <span className="meta-value" style={{ textTransform: 'capitalize' }}>
                {status === 'received' ? 'Received & Restocked' : status === 'pending_approval' ? 'Awaiting Approval' : 'Pending'}
              </span>
            </div>
            <div className="meta-row">
              <span className="meta-label">Payment:</span>
              <span className="meta-value" style={{ textTransform: 'capitalize' }}>
                {paymentStatus === 'paid' ? 'Fully Paid (بے باق)' : paymentStatus === 'partial' ? 'Partial Paid' : 'Unpaid (ادھار)'}
              </span>
            </div>
            {receivedDate && (
              <div className="meta-row">
                <span className="meta-label">Received On:</span>
                <span className="meta-value">{formatDate(receivedDate)}</span>
              </div>
            )}
          </div>
        </div>

        {/* LINE ITEMS TABLE */}
        <div className="table-wrap">
          <table className="po-table">
            <thead>
              <tr>
                <th style={{ width: '5%', textAlign: 'center' }}>Sr</th>
                <th style={{ width: '39%' }}>Product Description (آئٹم نام)</th>
                <th style={{ width: '14%', textAlign: 'center' }}>Batch #</th>
                <th style={{ width: '10%', textAlign: 'center' }}>Cartons</th>
                <th style={{ width: '10%', textAlign: 'center' }}>Total Pcs</th>
                <th style={{ width: '11%', textAlign: 'right' }}>Buy Rate</th>
                <th style={{ width: '11%', textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => {
                const ctns = it.cartons || (it.pieces_per_carton ? (it.quantity / it.pieces_per_carton).toFixed(1) : '1');
                return (
                  <tr key={it.id || idx}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{idx + 1}</td>
                    <td style={{ fontWeight: 800 }}>{it.product_name}</td>
                    <td style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: '7.5px' }}>
                      {it.batch_number || '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{ctns}</td>
                    <td style={{ textAlign: 'center', fontWeight: 900 }}>{it.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {fmt(it.unit_cost)}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 900, whiteSpace: 'nowrap' }}>
                      {fmt(it.total)}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '12px', color: '#94a3b8' }}>
                    No purchase line items found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* FINANCIAL SUMMARY & NOTES */}
        <div className="summary-container">
          {/* Notes & Packing Summary */}
          <div className="summary-box">
            <div style={{ fontSize: '8px', fontWeight: 800, color: '#334155', marginBottom: '2px' }}>
              Order & Packing Summary:
            </div>
            <div style={{ fontSize: '7.5px', color: '#64748b', lineHeight: 1.4 }}>
              • Total Distinct Items: <strong>{items.length}</strong>
              <br />
              • Total Packing Count: <strong>{totalCartons.toFixed(1)} cartons / {totalPieces} pcs</strong>
              {note && (
                <>
                  <br />
                  • Reference / Note: <em>{note}</em>
                </>
              )}
              {requestedBy && (
                <>
                  <br />
                  • Requested By: <strong>{requestedBy}</strong>
                </>
              )}
              {approvedBy && (
                <>
                  <br />
                  • Approved By: <strong>{approvedBy}</strong>
                </>
              )}
            </div>
          </div>

          {/* Financial Totals */}
          <div className="summary-box">
            <div className="sum-row">
              <span>Gross Subtotal:</span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="sum-row">
                <span>Tax / Duty:</span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(tax)}</span>
              </div>
            )}
            <div className="sum-row grand-total">
              <span>Grand Total (کل رقم):</span>
              <span style={{ whiteSpace: 'nowrap' }}>{fmt(total)}</span>
            </div>
            {paidAmount > 0 && (
              <div className="sum-row paid-amount">
                <span>Paid / Advance Settled:</span>
                <span style={{ whiteSpace: 'nowrap' }}>- {fmt(paidAmount)}</span>
              </div>
            )}
            <div className="sum-row balance-due">
              <span>Balance Due (بقایا واجب الادا):</span>
              <span style={{ whiteSpace: 'nowrap' }}>{fmt(remainingDue)}</span>
            </div>
          </div>
        </div>

        {/* SIGNATURE SECTION */}
        <div className="signature-grid">
          <div className="sig-line">
            Prepared By {requestedBy ? `(${requestedBy})` : ''}
          </div>
          <div className="sig-line">
            Supplier Delivery / Received
          </div>
          <div className="sig-line">
            Store Owner / Authorized Stamp
          </div>
        </div>

        {/* PRINT FOOTER META */}
        <div style={{ textAlign: 'center', fontSize: '6.5px', color: '#94a3b8', marginTop: '2px' }}>
          Computer Generated Purchase Order Slip • Printed: {dateStr} at {printTime}
        </div>
      </div>
    </div>
  );
}
