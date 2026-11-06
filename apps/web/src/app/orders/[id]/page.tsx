import { Suspense } from 'react';
import { OrderDetail } from './order-detail';

export default function OrderDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
          Loading order…
        </div>
      }
    >
      <OrderDetail />
    </Suspense>
  );
}
