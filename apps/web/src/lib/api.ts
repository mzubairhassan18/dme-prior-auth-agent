import type { CreateOrderInput, Order, Patient, ProblemDetails } from '@dme/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Wraps RFC 7807 problem details returned by the API. */
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });

  if (!response.ok) {
    let problem: ProblemDetails = {
      type: 'about:blank',
      title: 'Request failed',
      status: response.status,
    };
    try {
      problem = (await response.json()) as ProblemDetails;
    } catch {
      // non-JSON error body — keep the fallback problem
    }
    throw new ApiError(problem);
  }

  return (await response.json()) as T;
}

export const api = {
  patients: () => request<Patient[]>('/patients'),
  orders: () => request<Order[]>('/orders'),
  order: (id: string) => request<Order>(`/orders/${id}`),
  createOrder: (input: CreateOrderInput) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(input) }),
};
