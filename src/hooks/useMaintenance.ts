'use client';

import { useEffect, useState } from 'react';
import { getMaintenanceStatus } from '@/features/auth/actions';

export const STAFF_ROLES = ['admin', 'super_admin', 'merchant', 'delivery'];

/**
 * Tracks maintenance state for the client. `showMaintenance` is true only for a
 * signed-in, non-staff user. Logged-out users (including the login page) and
 * staff are never blocked, so admins can always sign back in and disable it.
 */
export function useMaintenance() {
  const [role, setRole] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    getMaintenanceStatus()
      .then((res) => { if (active) { setEnabled(res.enabled); setRole(res.role); } })
      .catch(() => { if (active) { setEnabled(false); setRole(null); } });
    return () => { active = false; };
  }, []);

  const isStaffRole = role !== null && STAFF_ROLES.includes(role);
  const showMaintenance = enabled && role !== null && !isStaffRole;

  return { enabled, showMaintenance, isStaffRole };
}
