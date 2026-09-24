import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, height = 180, color = '#0ea5e9', formatValue }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const barWidth = 100 / Math.max(data.length, 1);

  return (
    <div className="w-full">
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * (height - 30);
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-medium text-slate-500">
                {formatValue ? formatValue(d.value) : d.value}
              </span>
              <div
                className="w-full max-w-[40px] rounded-t-md transition-all duration-500 hover:opacity-80"
                style={{ height: Math.max(h, 2), backgroundColor: color }}
              />
              <span className="text-[10px] text-slate-400">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface LineChartProps {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
}

export function LineChart({ data, height = 180, color = '#0ea5e9', formatValue }: LineChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const width = 100;
  const points = data.map((d, i) => ({
    x: (i / Math.max(data.length - 1, 1)) * width,
    y: height - 20 - (d.value / max) * (height - 40),
  }));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
        <defs>
          <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="1.2" fill={color} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between">
        {data.map((d, i) => (
          <span key={i} className="text-[10px] text-slate-400">{d.label}</span>
        ))}
      </div>
    </div>
  );
}

interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  formatValue?: (v: number) => string;
}

export function DonutChart({ data, size = 160, formatValue }: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="-rotate-90" style={{ width: size, height: size }}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="12" />
          {data.map((d, i) => {
            const dash = (d.value / total) * circumference;
            const seg = (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth="12"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return seg;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-slate-800">{formatValue ? formatValue(total) : total}</span>
          <span className="text-[10px] text-slate-400">Total</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
            <span className="flex-1 truncate text-slate-600">{d.label}</span>
            <span className="font-medium text-slate-800">
              {formatValue ? formatValue(d.value) : d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  trend,
  color = 'sky',
  onClick,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  trend?: { value: string; up: boolean };
  color?: 'sky' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
  onClick?: () => void;
}) {
  const colorMap = {
    sky: 'from-sky-500 to-sky-600 shadow-sky-600/20',
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-600/20',
    amber: 'from-amber-500 to-amber-600 shadow-amber-600/20',
    rose: 'from-rose-500 to-rose-600 shadow-rose-600/20',
    violet: 'from-violet-500 to-violet-600 shadow-violet-600/20',
    slate: 'from-slate-500 to-slate-600 shadow-slate-600/20',
  };

  const inner = (
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-slate-800">{value}</p>
          {trend && (
            <p className={`mt-1 text-xs font-medium ${trend.up ? 'text-emerald-600' : 'text-rose-500'}`}>
              {trend.up ? '↑' : '↓'} {trend.value}
            </p>
          )}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md ${colorMap[color]}`}>
          {icon}
        </div>
      </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-md',
          'cursor-pointer hover:ring-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-500/40'
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className="w-full rounded-2xl bg-white p-5 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:shadow-md">
      {inner}
    </div>
  );
}
