import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
}

export function Pagination({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [24, 48, 96, 192],
  itemLabel = 'products',
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      const start = Math.max(2, safeCurrentPage - 1);
      const end = Math.min(totalPages - 1, safeCurrentPage + 1);

      if (start > 2) {
        pages.push('ellipsis-start');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('ellipsis-end');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const handlePageClick = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== safeCurrentPage) {
      onPageChange(page);
    }
  };

  if (totalItems === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs',
        className
      )}
    >
      {/* Left: Summary and Page Size */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <span>
          Showing <strong className="font-semibold text-slate-900">{startItem.toLocaleString()}</strong>–
          <strong className="font-semibold text-slate-900">{endItem.toLocaleString()}</strong> of{' '}
          <strong className="font-semibold text-slate-900">{totalItems.toLocaleString()}</strong> {itemLabel}
        </span>

        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200">
            <span className="text-slate-400">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-100 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition cursor-pointer"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} per page
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Page Navigation Buttons */}
      <div className="flex items-center gap-1 self-center sm:self-auto">
        {/* First Page */}
        <button
          type="button"
          onClick={() => handlePageClick(1)}
          disabled={safeCurrentPage <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 disabled:pointer-events-none"
          title="First Page"
        >
          <ChevronsLeft size={15} />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => handlePageClick(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 disabled:pointer-events-none"
          title="Previous Page"
        >
          <ChevronLeft size={15} />
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1 mx-1">
          {getPageNumbers().map((item, idx) => {
            if (typeof item === 'string') {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="flex h-8 w-6 items-center justify-center text-xs text-slate-400 font-bold select-none"
                >
                  •••
                </span>
              );
            }

            const isActive = item === safeCurrentPage;
            return (
              <button
                key={item}
                type="button"
                onClick={() => handlePageClick(item)}
                className={cn(
                  'flex h-8 min-w-[32px] items-center justify-center rounded-lg px-2 text-xs font-medium transition',
                  isActive
                    ? 'bg-sky-600 text-white font-semibold shadow-xs'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                )}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => handlePageClick(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 disabled:pointer-events-none"
          title="Next Page"
        >
          <ChevronRight size={15} />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => handlePageClick(totalPages)}
          disabled={safeCurrentPage >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 disabled:opacity-40 disabled:pointer-events-none"
          title="Last Page"
        >
          <ChevronsRight size={15} />
        </button>
      </div>
    </div>
  );
}
