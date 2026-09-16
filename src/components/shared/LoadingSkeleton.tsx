export function CardSkeleton({ count = 1 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-zcard rounded-xl shadow-z p-5 animate-pulse">
          <div className="h-3 w-16 bg-zsurface rounded mb-3" />
          <div className="h-7 w-24 bg-zsurface rounded mb-2" />
          <div className="h-3 w-20 bg-zsurface rounded" />
        </div>
      ))}
    </>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-zgray rounded-xl" />
      ))}
    </div>
  );
}

export function StatGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-zcard rounded-xl shadow-z p-4 animate-pulse">
          <div className="h-3 w-16 bg-zsurface rounded mb-3" />
          <div className="h-6 w-20 bg-zsurface rounded" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="h-8 w-48 bg-zsurface rounded" />
      <div className="h-4 w-64 bg-zsurface rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-zgray rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-zgray rounded-xl" />
    </div>
  );
}
