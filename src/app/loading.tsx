import HamsterLoader from '@/components/ui/HamsterLoader';

export default function RootLoading() {
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] p-6">
      <HamsterLoader size="lg" />
    </div>
  );
}


