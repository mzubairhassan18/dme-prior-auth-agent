'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export default function DashboardPage() {
  const {
    data: orders,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['orders'],
    queryFn: api.orders,
    refetchInterval: 5_000,
  });

  const submitted = orders?.filter((order) => order.status === 'SUBMITTED').length ?? 0;
  const analyzing = orders?.filter((order) => order.status === 'ANALYZING').length ?? 0;
  const ready = orders?.filter((order) => order.status === 'DECISION_READY').length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Prior authorization queue
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            DME orders awaiting agent review — refreshes every 5 seconds.
          </p>
        </div>
        <Link
          href="/intake"
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
        >
          New intake
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Submitted', value: submitted, tone: 'text-slate-900' },
          { label: 'Analyzing', value: analyzing, tone: 'text-amber-600' },
          { label: 'Decision ready', value: ready, tone: 'text-emerald-600' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${stat.tone}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {error instanceof ApiError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <p className="font-medium">{error.problem.title}</p>
          {error.problem.detail && <p className="mt-1">{error.problem.detail}</p>}
          <p className="mt-1 text-rose-500">Is the API running on port 3001?</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Orders</h2>
          <span className="text-xs text-slate-500">{orders?.length ?? 0} total</span>
        </div>

        {isLoading && (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex animate-pulse items-center justify-between px-5 py-4">
                <div className="space-y-2">
                  <div className="h-3 w-40 rounded bg-slate-200" />
                  <div className="h-3 w-56 rounded bg-slate-100" />
                </div>
                <div className="h-5 w-24 rounded-full bg-slate-100" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && orders?.length === 0 && (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-900">No orders yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Submit the first DME order to see the agent pipeline in action.
            </p>
            <Link
              href="/intake"
              className="mt-4 inline-block rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
            >
              Create intake
            </Link>
          </div>
        )}

        <ul className="divide-y divide-slate-100">
          {orders?.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  {order.patient
                    ? `${order.patient.firstName} ${order.patient.lastName}`
                    : 'Unknown patient'}
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    {order.patient?.insuranceProvider}
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-mono text-xs">{order.equipmentCode}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  <span className="font-mono text-xs">{order.diagnosisCode}</span>
                  <span className="mx-2 text-slate-300">·</span>
                  qty {order.quantity}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-slate-400">{order.clinicalNotes}</p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={order.status} />
                <span className="text-xs text-slate-400">
                  {dateFormatter.format(new Date(order.createdAt))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
