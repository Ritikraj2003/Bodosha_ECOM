export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-zsurface rounded-lg ${className}`} />;
}

export function StatCard({ label, value, icon: Icon, trend, color }: {
  label: string; value: string; icon: React.ElementType; trend?: string; color?: string;
}) {
  return (
    <div className="bg-zcard rounded-xl border border-zborder p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ztext-lighter uppercase tracking-wider">{label}</span>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: color ? `${color}15` : 'rgba(239,68,68,0.1)' }}>
          <Icon size={17} style={{ color: color ?? '#EF4444' }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-ztext mt-2">{value}</p>
      {trend && <p className="text-xs text-ztext-lighter mt-1">{trend}</p>}
    </div>
  );
}

export function DashboardCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-zcard rounded-xl border border-zborder p-5 ${className}`}>
      {title && <h2 className="text-sm font-semibold text-ztext mb-4">{title}</h2>}
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    accepted: 'bg-blue-500/10 text-blue-400 border-blue-200',
    preparing: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    ready: 'bg-green-500/10 text-green-400 border-green-500/20',
    completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-200',
    cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
    declined: 'bg-red-500/10 text-red-400 border-red-500/20',
    assigned: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    out_for_delivery: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    delivered: 'bg-green-500/10 text-green-400 border-green-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? 'bg-zgray text-ztext-light border-zborder'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: {
  icon: React.ElementType; title: string; description: string; action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12">
      <div className="w-14 h-14 rounded-xl bg-zgray flex items-center justify-center mx-auto mb-4">
        <Icon size={28} className="text-ztext-muted" />
      </div>
      <p className="text-sm font-semibold text-ztext">{title}</p>
      <p className="text-xs text-ztext-lighter mt-1 max-w-xs mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export { default as HamsterLoader } from './HamsterLoader';

