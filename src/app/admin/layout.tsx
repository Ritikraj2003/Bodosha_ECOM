import { ReactNode } from 'react';

// Simple pass-through layout for /admin/* routes (profile, menu, etc.)
// Route protection is handled by the proxy (src/proxy.ts) and individual pages.
// The old legacy layout was incorrectly redirecting super_admin / owner roles.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
