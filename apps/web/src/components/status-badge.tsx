const styles: Record<string, string> = {
  SUBMITTED: 'bg-slate-100 text-slate-700 ring-slate-200',
  ANALYZING: 'bg-amber-50 text-amber-700 ring-amber-200',
  DECISION_READY: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
        styles[status] ?? 'bg-slate-100 text-slate-700 ring-slate-200'
      }`}
    >
      {status === 'ANALYZING' && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
      )}
      {status.replaceAll('_', ' ')}
    </span>
  );
}
