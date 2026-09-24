import { formatCurrency, formatDate } from '@/lib/utils';
import { PrintDocument, PrintTh, PrintTd } from '@/components/PrintDocument';

export interface SalesLedgerEntry {
  id: string;
  date: string;
  docDate: string;
  type: 'opening' | 'invoice' | 'payment' | 'return' | 'adjustment';
  docNo: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  status: 'Open' | 'Paid' | 'Partial' | 'Applied' | '—';
}

export interface SalesLedgerData {
  customer: {
    id: string;
    name: string;
    phone?: string;
    area?: string;
    address?: string;
    opening_balance?: number;
  };
  dateRangeStr: string;
  generatedOnStr: string;
  priorBalance: number;
  entries: SalesLedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  aging: {
    current: number; // 0-30 days
    days30to60: number; // 31-60 days
    days60to90: number; // 61-90 days
    over90: number; // >90 days
  };
}

export function SalesLedgerDocument({
  storeName,
  logoSrc,
  symbol,
  data,
}: {
  storeName: string;
  logoSrc?: string | null;
  symbol: string;
  data: SalesLedgerData;
}) {
  const { customer, dateRangeStr, generatedOnStr, priorBalance, entries, totalDebit, totalCredit, closingBalance, aging } = data;

  const headerFields = [
    { label: 'Customer Name', value: customer.name, span: 2 as const },
    { label: 'Phone', value: customer.phone || '—' },
    { label: 'Area / Location', value: customer.area || customer.address || '—' },
    { label: 'Date Range', value: dateRangeStr },
    { label: 'Generated On', value: generatedOnStr },
    { label: 'Starting Balance', value: formatCurrency(priorBalance, symbol) },
    { label: 'Current Closing Balance', value: formatCurrency(closingBalance, symbol) },
  ];

  return (
    <PrintDocument
      storeName={storeName}
      subtitle="Sales Ledger Detail Report (Customer Account Statement)"
      logoSrc={logoSrc}
      fields={headerFields}
    >
      {/* Ledger Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-300 bg-slate-100 text-[11px] font-semibold text-slate-700">
              <PrintTh className="py-2">Date</PrintTh>
              <PrintTh className="py-2">Doc Date</PrintTh>
              <PrintTh className="py-2">Type</PrintTh>
              <PrintTh className="py-2">Doc #</PrintTh>
              <PrintTh className="py-2">Description / Reference</PrintTh>
              <PrintTh align="right" className="py-2 text-rose-700">Debit ({symbol})</PrintTh>
              <PrintTh align="right" className="py-2 text-emerald-700">Credit ({symbol})</PrintTh>
              <PrintTh align="right" className="py-2">Balance ({symbol})</PrintTh>
              <PrintTh className="py-2 text-center">Status</PrintTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {/* Prior Balance Row */}
            <tr className="bg-slate-50/70 font-semibold text-slate-800">
              <PrintTd className="py-2">{dateRangeStr.split(' to ')[0] || '—'}</PrintTd>
              <PrintTd className="py-2">—</PrintTd>
              <PrintTd className="py-2">
                <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] uppercase font-bold text-slate-700">
                  Opening
                </span>
              </PrintTd>
              <PrintTd className="py-2 font-mono text-[10px]">—</PrintTd>
              <PrintTd className="py-2 italic text-slate-600">Balance Brought Forward</PrintTd>
              <PrintTd align="right" className="py-2">—</PrintTd>
              <PrintTd align="right" className="py-2">—</PrintTd>
              <PrintTd align="right" className="py-2 font-bold text-slate-900">
                {formatCurrency(priorBalance, symbol)}
              </PrintTd>
              <PrintTd className="py-2 text-center text-slate-400">—</PrintTd>
            </tr>

            {/* Entry Rows */}
            {entries.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-6 text-center text-xs italic text-slate-400">
                  No transaction activity found for this customer in the selected date range.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isDebit = entry.debit > 0;
                const isCredit = entry.credit > 0;
                return (
                  <tr key={entry.id} className="hover:bg-slate-50/80">
                    <PrintTd className="py-1.5 text-slate-600">{formatDate(entry.date)}</PrintTd>
                    <PrintTd className="py-1.5 text-slate-500">{formatDate(entry.docDate)}</PrintTd>
                    <PrintTd className="py-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          entry.type === 'invoice'
                            ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                            : entry.type === 'payment'
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : entry.type === 'return'
                            ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {entry.type === 'invoice'
                          ? 'Invoice'
                          : entry.type === 'payment'
                          ? 'Receipt'
                          : entry.type === 'return'
                          ? 'Return Memo'
                          : entry.type}
                      </span>
                    </PrintTd>
                    <PrintTd className="py-1.5 font-mono text-[11px] font-medium text-slate-800">
                      {entry.docNo}
                    </PrintTd>
                    <PrintTd className="py-1.5 text-slate-600">{entry.description}</PrintTd>
                    <PrintTd align="right" className="py-1.5 font-medium text-rose-700">
                      {isDebit ? formatCurrency(entry.debit, symbol) : '—'}
                    </PrintTd>
                    <PrintTd align="right" className="py-1.5 font-medium text-emerald-700">
                      {isCredit ? formatCurrency(entry.credit, symbol) : '—'}
                    </PrintTd>
                    <PrintTd align="right" className="py-1.5 font-bold text-slate-900">
                      {formatCurrency(entry.balance, symbol)}
                    </PrintTd>
                    <PrintTd className="py-1.5 text-center">
                      <span
                        className={`text-[10px] font-semibold ${
                          entry.status === 'Paid'
                            ? 'text-emerald-600'
                            : entry.status === 'Applied'
                            ? 'text-sky-600'
                            : entry.status === 'Partial'
                            ? 'text-amber-600'
                            : entry.status === 'Open'
                            ? 'text-rose-600'
                            : 'text-slate-400'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </PrintTd>
                  </tr>
                );
              })
            )}

            {/* Total Row */}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-slate-900">
              <PrintTd colSpan={5} className="py-2.5 text-right font-bold uppercase tracking-wider text-xs">
                Activity Totals & Closing Balance:
              </PrintTd>
              <PrintTd align="right" className="py-2.5 text-rose-700 text-xs">
                {formatCurrency(totalDebit, symbol)}
              </PrintTd>
              <PrintTd align="right" className="py-2.5 text-emerald-700 text-xs">
                {formatCurrency(totalCredit, symbol)}
              </PrintTd>
              <PrintTd align="right" className="py-2.5 text-sm font-black text-slate-900">
                {formatCurrency(closingBalance, symbol)}
              </PrintTd>
              <PrintTd className="py-2.5 text-center">—</PrintTd>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Summary & Aging Overview Cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Activity Summary */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-200 pb-1.5">
            Statement Activity Summary
          </h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between py-0.5">
              <span className="text-slate-600">Starting / Prior Balance:</span>
              <span className="font-semibold text-slate-800">{formatCurrency(priorBalance, symbol)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-600">Total Invoiced (Debits):</span>
              <span className="font-semibold text-rose-700">+{formatCurrency(totalDebit, symbol)}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-slate-600">Total Payments & Returns (Credits):</span>
              <span className="font-semibold text-emerald-700">-{formatCurrency(totalCredit, symbol)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-sm">
              <span className="text-slate-800">Closing Balance (Net Receivables):</span>
              <span className={closingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                {formatCurrency(closingBalance, symbol)}
              </span>
            </div>
          </div>
        </div>

        {/* Aging Breakdown */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-b border-slate-200 pb-1.5">
            Receivables Aging Analysis
          </h4>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white p-2 border border-slate-200">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">0 - 30 Days</span>
              <span className="mt-1 block font-bold text-slate-800">{formatCurrency(aging.current, symbol)}</span>
            </div>
            <div className="rounded-lg bg-white p-2 border border-slate-200">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">31 - 60 Days</span>
              <span className="mt-1 block font-bold text-amber-700">{formatCurrency(aging.days30to60, symbol)}</span>
            </div>
            <div className="rounded-lg bg-white p-2 border border-slate-200">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">61 - 90 Days</span>
              <span className="mt-1 block font-bold text-orange-700">{formatCurrency(aging.days60to90, symbol)}</span>
            </div>
            <div className="rounded-lg bg-white p-2 border border-slate-200">
              <span className="block text-[10px] font-semibold text-slate-500 uppercase">&gt; 90 Days</span>
              <span className="mt-1 block font-bold text-rose-700">{formatCurrency(aging.over90, symbol)}</span>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 italic">
            * Aging is calculated from the document invoice dates relative to current statement date.
          </p>
        </div>
      </div>
    </PrintDocument>
  );
}
