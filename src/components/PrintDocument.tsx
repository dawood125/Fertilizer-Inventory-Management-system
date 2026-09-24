import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import defaultBusinessLogo from '@/assets/logo.png';

export const AIWA_POWERED_BY = 'AIWA Logics';
export const AIWA_CONTACT = '032 44427718';

export interface PrintInfoField {
  label: string;
  value: string;
  span?: 1 | 2;
}

export function PrintDocument({
  storeName,
  subtitle,
  logoSrc,
  fields = [],
  children,
}: {
  storeName: string;
  subtitle: string;
  logoSrc?: string | null;
  fields?: PrintInfoField[];
  children: ReactNode;
}) {
  const effectiveLogo = logoSrc || defaultBusinessLogo;

  return (
    <div className="text-left text-sm text-slate-800">
      <div className="mb-4 flex flex-col items-center border-b border-slate-200 pb-4 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          {effectiveLogo && (
            <img src={effectiveLogo} alt="" className="h-12 w-auto object-contain" />
          )}
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 uppercase">{storeName}</h1>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{subtitle}</p>
          </div>
        </div>
      </div>

      {fields.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {fields.map((f, i) => (
            <div
              key={`${f.label}-${i}`}
              className={cn('rounded-lg border border-slate-200 bg-slate-50/50 p-2.5', f.span === 2 && 'sm:col-span-2')}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{f.label}</p>
              <p className="mt-0.5 font-medium text-slate-900 leading-snug">{f.value || '—'}</p>
            </div>
          ))}
        </div>
      )}

      {children}

      <div className="mt-8 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-500">
        <p>
          <span className="font-semibold text-slate-700">Powered By</span>
          {' | '}
          {AIWA_POWERED_BY}
        </p>
        <p className="mt-0.5">
          <span className="font-semibold text-slate-700">Contact</span>
          {' | '}
          {AIWA_CONTACT}
        </p>
      </div>
    </div>
  );
}

export function PrintTh({
  children,
  align = 'left',
  className,
}: {
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  return (
    <th
      className={cn(
        'border-b-2 border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 uppercase tracking-wider',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      {children}
    </th>
  );
}

export function PrintTd({
  children,
  align = 'left',
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: 'left' | 'right';
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        'border-b border-slate-100 px-3 py-2.5 text-[13px] text-slate-700',
        align === 'right' ? 'text-right' : 'text-left',
        className
      )}
    >
      {children}
    </td>
  );
}
