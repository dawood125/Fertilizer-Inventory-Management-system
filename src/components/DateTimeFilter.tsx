import React, { useState } from 'react';
import { Calendar, Clock, X, ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DatePreset = 'all' | 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export interface DateFilterValue {
  preset: DatePreset;
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string;   // HH:mm
  includeTime?: boolean;
}

export const DEFAULT_DATE_FILTER: DateFilterValue = {
  preset: 'all',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
  includeTime: false,
};

// Helper: Format a Date to YYYY-MM-DD in local time
export function toLocalDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Compute start and end timestamps (in milliseconds) for a given filter value
export function getDateFilterBounds(filter: DateFilterValue): { startMs: number; endMs: number } {
  const now = new Date();
  const todayStr = toLocalDateString(now);

  switch (filter.preset) {
    case 'today': {
      const start = new Date(`${todayStr}T00:00:00`);
      const end = new Date(`${todayStr}T23:59:59.999`);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yStr = toLocalDateString(y);
      const start = new Date(`${yStr}T00:00:00`);
      const end = new Date(`${yStr}T23:59:59.999`);
      return { startMs: start.getTime(), endMs: end.getTime() };
    }
    case 'this_week': {
      // Last 7 days including today
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      const startStr = toLocalDateString(start);
      return {
        startMs: new Date(`${startStr}T00:00:00`).getTime(),
        endMs: new Date(`${todayStr}T23:59:59.999`).getTime(),
      };
    }
    case 'this_month': {
      const startStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      return {
        startMs: new Date(`${startStr}T00:00:00`).getTime(),
        endMs: new Date(`${todayStr}T23:59:59.999`).getTime(),
      };
    }
    case 'last_month': {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDayOfPrevMonth = new Date(firstOfThisMonth.getTime() - 1);
      const firstDayOfPrevMonth = new Date(lastDayOfPrevMonth.getFullYear(), lastDayOfPrevMonth.getMonth(), 1);
      return {
        startMs: new Date(`${toLocalDateString(firstDayOfPrevMonth)}T00:00:00`).getTime(),
        endMs: new Date(`${toLocalDateString(lastDayOfPrevMonth)}T23:59:59.999`).getTime(),
      };
    }
    case 'custom': {
      const startStr = filter.startDate || '1970-01-01';
      const endStr = filter.endDate || filter.startDate || '2099-12-31';

      let startDateTimeStr = `${startStr}T00:00:00`;
      let endDateTimeStr = `${endStr}T23:59:59.999`;

      if (filter.includeTime) {
        if (filter.startTime) startDateTimeStr = `${startStr}T${filter.startTime}:00`;
        if (filter.endTime) endDateTimeStr = `${endStr}T${filter.endTime}:59.999`;
      }

      return {
        startMs: new Date(startDateTimeStr).getTime(),
        endMs: new Date(endDateTimeStr).getTime(),
      };
    }
    case 'all':
    default:
      return { startMs: 0, endMs: Number.MAX_SAFE_INTEGER };
  }
}

// Reusable date match check
export function isWithinDateRange(
  dateInput: string | number | Date | null | undefined,
  filter: DateFilterValue
): boolean {
  if (filter.preset === 'all' && !filter.startDate && !filter.endDate) {
    return true;
  }
  if (!dateInput) return false;

  const itemTime = new Date(dateInput).getTime();
  if (isNaN(itemTime)) return false;

  const { startMs, endMs } = getDateFilterBounds(filter);
  return itemTime >= startMs && itemTime <= endMs;
}

// Preset options metadata
export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'this_week', label: 'Last 7 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom Range...' },
];

interface DateTimeFilterProps {
  value: DateFilterValue;
  onChange: (val: DateFilterValue) => void;
  className?: string;
  compact?: boolean;
  allowTime?: boolean;
  label?: string;
}

export function DateTimeFilter({
  value,
  onChange,
  className,
  compact = false,
  allowTime = true,
  label = 'Date & Time',
}: DateTimeFilterProps) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [tempStart, setTempStart] = useState(value.startDate || toLocalDateString(new Date()));
  const [tempEnd, setTempEnd] = useState(value.endDate || toLocalDateString(new Date()));
  const [tempStartTime, setTempStartTime] = useState(value.startTime || '00:00');
  const [tempEndTime, setTempEndTime] = useState(value.endTime || '23:59');
  const [tempIncludeTime, setTempIncludeTime] = useState(value.includeTime || false);

  const isFiltered = value.preset !== 'all';

  const handlePresetSelect = (preset: DatePreset) => {
    if (preset === 'custom') {
      setTempStart(value.startDate || toLocalDateString(new Date()));
      setTempEnd(value.endDate || toLocalDateString(new Date()));
      setTempStartTime(value.startTime || '00:00');
      setTempEndTime(value.endTime || '23:59');
      setTempIncludeTime(value.includeTime || false);
      setShowCustomModal(true);
    } else {
      onChange({
        ...DEFAULT_DATE_FILTER,
        preset,
      });
    }
  };

  const handleApplyCustom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onChange({
      preset: 'custom',
      startDate: tempStart,
      endDate: tempEnd || tempStart,
      startTime: tempStartTime,
      endTime: tempEndTime,
      includeTime: tempIncludeTime,
    });
    setShowCustomModal(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(DEFAULT_DATE_FILTER);
  };

  const getActiveLabel = () => {
    switch (value.preset) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case 'this_week': return 'Last 7 Days';
      case 'this_month': return 'This Month';
      case 'last_month': return 'Last Month';
      case 'custom': {
        if (value.startDate === value.endDate || !value.endDate) {
          const datePart = value.startDate || 'Specific Date';
          return value.includeTime && value.startTime
            ? `${datePart} (${value.startTime} - ${value.endTime || 'end'})`
            : datePart;
        }
        return `${value.startDate} to ${value.endDate}`;
      }
      case 'all':
      default:
        return 'All Time';
    }
  };

  return (
    <div className={cn('relative inline-flex flex-col', className)}>
      {label && !compact && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1.5">
          <Calendar size={13} className="text-slate-400" />
          {label}
        </label>
      )}

      <div className="flex items-center gap-1.5">
        {/* Quick presets dropdown / select */}
        <div className="relative inline-flex items-center">
          <div className="relative flex items-center">
            <Calendar size={15} className="absolute left-2.5 pointer-events-none text-slate-400" />
            <select
              value={value.preset}
              onChange={(e) => handlePresetSelect(e.target.value as DatePreset)}
              className={cn(
                'appearance-none rounded-lg border bg-white pl-8 pr-7 py-1.5 text-xs font-medium shadow-sm transition focus:outline-none focus:ring-2',
                isFiltered
                  ? 'border-sky-400 bg-sky-50/50 text-sky-900 font-semibold focus:ring-sky-500/20'
                  : 'border-slate-300 text-slate-700 hover:border-slate-400 focus:border-sky-500 focus:ring-sky-500/20'
              )}
            >
              {DATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 pointer-events-none text-slate-400" />
          </div>

          {/* If custom range is active, show edit button */}
          {value.preset === 'custom' && (
            <button
              type="button"
              onClick={() => {
                setTempStart(value.startDate || toLocalDateString(new Date()));
                setTempEnd(value.endDate || toLocalDateString(new Date()));
                setTempStartTime(value.startTime || '00:00');
                setTempEndTime(value.endTime || '23:59');
                setTempIncludeTime(value.includeTime || false);
                setShowCustomModal(true);
              }}
              title="Click to change custom date range"
              className="ml-1.5 inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-100/70 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-200 transition"
            >
              <span>{getActiveLabel()}</span>
            </button>
          )}

          {/* Clear button if filtered */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleClear}
              title="Reset to All Time"
              className="ml-1 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Custom Date / Time Range Modal */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-sky-100 p-2 text-sky-700">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Custom Date & Time Filter</h3>
                  <p className="text-xs text-slate-500">Pick exact dates and optional times to find records</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleApplyCustom} className="mt-4 space-y-4">
              {/* Quick shortcut pills inside modal */}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Quick Pick
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const today = toLocalDateString(new Date());
                      setTempStart(today);
                      setTempEnd(today);
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                  >
                    Today Only
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const y = new Date();
                      y.setDate(y.getDate() - 1);
                      const yStr = toLocalDateString(y);
                      setTempStart(yStr);
                      setTempEnd(yStr);
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                  >
                    Yesterday
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const start = new Date(now);
                      start.setDate(start.getDate() - 6);
                      setTempStart(toLocalDateString(start));
                      setTempEnd(toLocalDateString(now));
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setTempStart(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
                      setTempEnd(toLocalDateString(now));
                    }}
                    className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
                  >
                    This Month
                  </button>
                </div>
              </div>

              {/* Date Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={tempStart}
                    onChange={(e) => setTempStart(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={tempEnd}
                    onChange={(e) => setTempEnd(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
              </div>

              {/* Optional Time Precision */}
              {allowTime && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={tempIncludeTime}
                        onChange={(e) => setTempIncludeTime(e.target.checked)}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <Clock size={14} className="text-slate-500" />
                      Filter by exact time (shift / hours)
                    </label>
                  </div>

                  {tempIncludeTime && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/80 animate-in fade-in">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          From Time
                        </label>
                        <input
                          type="time"
                          value={tempStartTime}
                          onChange={(e) => setTempStartTime(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          To Time
                        </label>
                        <input
                          type="time"
                          value={tempEndTime}
                          onChange={(e) => setTempEndTime(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-sky-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="rounded-lg px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 transition"
                >
                  Apply Date Filter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
