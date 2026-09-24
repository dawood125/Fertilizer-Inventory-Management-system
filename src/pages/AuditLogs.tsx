import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import type { AuditLog } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { formatDate, formatDateTime, cn } from '@/lib/utils';
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Download,
  Printer,
  Eye,
  User,
  Activity,
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  Calendar,
  Clock,
  Layers,
} from 'lucide-react';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

const actionColors: Record<string, { bg: string; text: string; border: string }> = {
  LOGIN: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  LOGOUT: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
  POS_SALE: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  CREATE: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200' },
  SALES_RETURN: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  RETURN_STATUS: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  UPDATE: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  DELETE: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
};

export function AuditLogs() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [viewingLog, setViewingLog] = useState<AuditLog | null>(null);

  const loadLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setRefreshing(true);
    try {
      const [logsData, usersData] = await Promise.all([
        api.get<AuditLog[]>('/api/data/audit_logs?limit=2000'),
        api.get<any[]>('/api/data/app_users').catch(() => []),
      ]);

      const sorted = (logsData || []).sort(
        (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))
      );

      setLogs(sorted);
      setUsers(usersData || []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Distinct user names in logs
  const distinctUsers = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.user_name) set.add(l.user_name);
    });
    users.forEach((u) => {
      if (u.name) set.add(u.name);
    });
    return Array.from(set).sort();
  }, [logs, users]);

  // Date filtering logic
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // User filter
      if (selectedUser !== 'all' && log.user_name !== selectedUser) {
        return false;
      }

      // Action category filter
      if (selectedCategory !== 'all') {
        const act = (log.action || '').toUpperCase();
        const ent = (log.entity_type || '').toLowerCase();
        if (selectedCategory === 'sales' && act !== 'POS_SALE' && ent !== 'orders') return false;
        if (selectedCategory === 'returns' && act !== 'SALES_RETURN' && act !== 'RETURN_STATUS' && ent !== 'sales_returns') return false;
        if (selectedCategory === 'finance' && ent !== 'transactions' && ent !== 'payment_accounts' && ent !== 'supplier_payments') return false;
        if (selectedCategory === 'expenses' && ent !== 'expenses') return false;
        if (selectedCategory === 'auth' && act !== 'LOGIN' && act !== 'LOGOUT') return false;
        if (selectedCategory === 'deletes' && act !== 'DELETE') return false;
        if (selectedCategory === 'updates' && act !== 'UPDATE') return false;
      }

      // Date & Time range filter
      if (!isWithinDateRange(log.created_at, dateFilter)) {
        return false;
      }

      // Text search
      if (search.trim()) {
        const q = search.toLowerCase();
        const match =
          (log.user_name || '').toLowerCase().includes(q) ||
          (log.action || '').toLowerCase().includes(q) ||
          (log.entity_type || '').toLowerCase().includes(q) ||
          (log.entity_id || '').toLowerCase().includes(q) ||
          (log.details || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [logs, selectedUser, selectedCategory, dateFilter, search]);

  // Statistics
  const stats = useMemo(() => {
    const todayCount = logs.filter((l) => String(l.created_at || '').slice(0, 10) === todayStr).length;
    const activeUsersToday = new Set(
      logs.filter((l) => String(l.created_at || '').slice(0, 10) === todayStr && l.user_name).map((l) => l.user_name)
    ).size;
    const salesReturnsToday = logs.filter(
      (l) =>
        String(l.created_at || '').slice(0, 10) === todayStr &&
        (l.action === 'POS_SALE' || l.action === 'SALES_RETURN' || l.entity_type === 'orders' || l.entity_type === 'sales_returns')
    ).length;
    const deletesCount = logs.filter((l) => l.action === 'DELETE').length;

    return {
      total: logs.length,
      todayCount,
      activeUsersToday,
      salesReturnsToday,
      deletesCount,
    };
  }, [logs, todayStr]);

  // Export CSV function
  const exportCSV = () => {
    if (!filteredLogs.length) {
      notify('No logs to export', 'info');
      return;
    }

    const headers = ['Timestamp', 'User/Cashier', 'Action', 'Entity/Module', 'Entity ID', 'Details'];
    const rows = filteredLogs.map((l) => [
      `"${formatDateTime(l.created_at)}"`,
      `"${l.user_name || 'System'}"`,
      `"${l.action}"`,
      `"${l.entity_type || ''}"`,
      `"${l.entity_id || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audit_Logs_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Audit logs exported to CSV', 'success');
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Audit Logs" />
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Logs & Activity Trail"
        subtitle="Complete record of all cashier and administrative actions across the system"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<RefreshCw size={16} className={cn(refreshing && 'animate-spin')} />}
              onClick={() => loadLogs(true)}
            >
              Refresh
            </Button>
            <Button variant="outline" icon={<Download size={16} />} onClick={exportCSV}>
              Export CSV
            </Button>
            <Button variant="outline" icon={<Printer size={16} />} onClick={() => window.print()}>
              Print Log
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <div className="rounded-xl bg-blue-500/10 p-3 text-blue-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Action Records</p>
            <p className="text-xl font-bold text-slate-800">{stats.total.toLocaleString()}</p>
            <p className="text-xs text-blue-600 mt-0.5">{stats.todayCount} logged today</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600">
            <User size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Users Today</p>
            <p className="text-xl font-bold text-slate-800">{stats.activeUsersToday} Users / Staff</p>
            <p className="text-xs text-emerald-600 mt-0.5">Performing operations</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-teal-50 to-white border-teal-100">
          <div className="rounded-xl bg-teal-500/10 p-3 text-teal-600">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Sales & Returns Today</p>
            <p className="text-xl font-bold text-slate-800">{stats.salesReturnsToday}</p>
            <p className="text-xs text-teal-600 mt-0.5">Transactions completed</p>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-rose-50 to-white border-rose-100">
          <div className="rounded-xl bg-rose-500/10 p-3 text-rose-600">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">System Deletions</p>
            <p className="text-xl font-bold text-slate-800">{stats.deletesCount}</p>
            <p className="text-xs text-rose-600 mt-0.5">Audited deletions</p>
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by cashier name, action, document ID, or description..."
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          {/* Filter Selectors */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {/* User filter */}
            <div className="flex items-center gap-1.5">
              <User size={16} className="text-slate-400" />
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
              >
                <option value="all">All Users / Cashiers</option>
                {distinctUsers.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            {/* Action category filter */}
            <div className="flex items-center gap-1.5">
              <Filter size={16} className="text-slate-400" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none"
              >
                <option value="all">All Action Types</option>
                <option value="sales">POS Sales & Orders</option>
                <option value="returns">Sales Returns</option>
                <option value="finance">Finance & Cash Drawer</option>
                <option value="expenses">Expenses</option>
                <option value="auth">Sign-In / Logouts</option>
                <option value="updates">Data Updates</option>
                <option value="deletes">Deletions</option>
              </select>
            </div>

            {/* Date & Time filter */}
            <DateTimeFilter value={dateFilter} onChange={setDateFilter} compact />

            {(selectedUser !== 'all' || selectedCategory !== 'all' || dateFilter.preset !== 'all' || search) && (
              <button
                onClick={() => {
                  setSelectedUser('all');
                  setSelectedCategory('all');
                  setDateFilter({ preset: 'all' });
                  setSearch('');
                }}
                className="text-xs text-rose-600 font-semibold hover:underline px-1"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing <strong className="text-slate-700">{filteredLogs.length}</strong> of <strong className="text-slate-700">{logs.length}</strong> audit trail entries</span>
        </div>
      </Card>

      {/* Audit Log Table */}
      <Card>
        {filteredLogs.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={36} />}
            title="No audit events found"
            description="All user actions, POS checkouts, returns, and changes are recorded and displayed here in real time."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '180px' }}>Date & Time</th>
                  <th style={{ width: '150px' }}>User / Cashier</th>
                  <th style={{ width: '120px' }}>Action</th>
                  <th style={{ width: '130px' }}>Module / Entity</th>
                  <th>Action Details</th>
                  <th className="text-right" style={{ width: '70px' }}>
                    View
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const badgeStyle = actionColors[log.action] || {
                    bg: 'bg-slate-100',
                    text: 'text-slate-700',
                    border: 'border-slate-200',
                  };

                  return (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Timestamp */}
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                          <Clock size={14} className="text-slate-400 shrink-0" />
                          <span>{formatDateTime(log.created_at)}</span>
                        </div>
                      </td>

                      {/* User */}
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold text-xs border border-slate-200 shrink-0">
                            {(log.user_name || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-xs text-slate-800">{log.user_name || 'System'}</p>
                          </div>
                        </div>
                      </td>

                      {/* Action Badge */}
                      <td>
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border',
                            badgeStyle.bg,
                            badgeStyle.text,
                            badgeStyle.border
                          )}
                        >
                          {log.action}
                        </span>
                      </td>

                      {/* Module / Entity */}
                      <td>
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 uppercase">
                          {log.entity_type || 'SYSTEM'}
                        </span>
                      </td>

                      {/* Details */}
                      <td className="text-xs text-slate-700">
                        <p className="line-clamp-2">{log.details || '—'}</p>
                      </td>

                      {/* Actions */}
                      <td className="text-right">
                        <button
                          onClick={() => setViewingLog(log)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* View Log Details Modal */}
      <Modal
        open={!!viewingLog}
        onClose={() => setViewingLog(null)}
        title="Audit Log Entry Details"
        size="md"
        footer={<Button onClick={() => setViewingLog(null)}>Close</Button>}
      >
        {viewingLog && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3 border-b pb-3">
              <div>
                <p className="text-xs text-slate-400">Timestamp</p>
                <p className="font-semibold text-slate-800">{formatDateTime(viewingLog.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">User / Cashier</p>
                <p className="font-semibold text-slate-800">{viewingLog.user_name || 'System'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Action Type</p>
                <Badge variant="blue">{viewingLog.action}</Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400">Module / Entity</p>
                <p className="font-mono text-xs font-semibold text-slate-700">{viewingLog.entity_type || 'N/A'}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-slate-400 mb-1">Full Description</p>
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 text-xs text-slate-800 leading-relaxed font-medium">
                {viewingLog.details || 'No additional details.'}
              </div>
            </div>

            {viewingLog.entity_id && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Target Entity Reference ID</p>
                <p className="font-mono text-xs bg-slate-100 p-2 rounded border border-slate-200 text-slate-700 select-all">
                  {viewingLog.entity_id}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
