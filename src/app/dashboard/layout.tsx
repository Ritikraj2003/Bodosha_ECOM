import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { template: '%s | Dashboard', default: 'Dashboard' },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
