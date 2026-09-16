import HamsterLoader from '@/components/ui/HamsterLoader';

export default function StudentDashboardLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] p-6">
      <HamsterLoader size="lg" />
    </div>
  );
}
