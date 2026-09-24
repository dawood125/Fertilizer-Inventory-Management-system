import { type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, error, hint, required, children, className }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label className="block text-sm font-medium text-slate-700">
          {label}{required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-rose-500">{error}</p>}
    </div>
  );
}

const inputBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 disabled:bg-slate-50 disabled:text-slate-400';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, 'appearance-none bg-no-repeat pr-9', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: 'right 0.75rem center' }} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBase, 'resize-none', className)} {...props} />;
}

export interface SearchableOption {
  value: string;
  label: string;
  searchText?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  emptyLabel?: string;
}

/** Typeahead select for long customer / product / supplier lists. */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  className,
  disabled,
  emptyLabel = 'No matches',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) setQuery(selected?.label || '');
  }, [selected?.label, open, value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selected && query === selected.label)) return options;
    return options.filter((o) => {
      const hay = (o.searchText || o.label).toLowerCase();
      return hay.includes(q);
    });
  }, [options, query, selected]);

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <input
        ref={inputRef}
        disabled={disabled}
        value={open ? query : (selected?.label || '')}
        placeholder={placeholder}
        className={cn(inputBase, 'pr-9')}
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            const first = filtered[0];
            if (first) {
              onChange(first.value);
              setOpen(false);
            }
          }
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">▾</span>
      {open && !disabled && (
        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {placeholder}
          </button>
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">{emptyLabel}</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={cn(
                  'block w-full px-3 py-2 text-left text-sm hover:bg-sky-50',
                  o.value === value ? 'bg-sky-50 font-medium text-sky-800' : 'text-slate-700'
                )}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
