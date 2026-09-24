import { api, getStoredUser } from '@/lib/api';
import type { AuthUser } from '@/context/AuthContext';

export interface AuditLogPayload {
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: string | null;
  user_name?: string | null;
}

/**
 * Log a user or cashier action to the audit_logs table.
 * Fails silently so it never interrupts primary operations.
 */
export async function logAuditAction(payload: AuditLogPayload): Promise<void> {
  try {
    const currentUser = getStoredUser<AuthUser>();
    const userName = payload.user_name || currentUser?.name || 'Cashier / User';

    await api.post('/api/data/audit_logs', {
      user_name: userName,
      action: payload.action,
      entity_type: payload.entity_type || null,
      entity_id: payload.entity_id || null,
      details: payload.details || null,
    });
  } catch (err: any) {
    // Audit logging is non-blocking
    console.warn('Failed to record audit log:', err?.message || err);
  }
}
