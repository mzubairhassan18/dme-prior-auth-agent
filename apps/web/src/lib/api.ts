import type {
  ClinicalDocument,
  CreateOrderInput,
  Order,
  Patient,
  ProblemDetails,
} from '@dme/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

/** Wraps RFC 7807 problem details returned by the API. */
export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.title);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;

  if (init?.body && !isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
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
  uploadDocument: (orderId: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return request<ClinicalDocument>(`/orders/${orderId}/documents`, {
      method: 'POST',
      body,
    });
  },
  documentUrl: (orderId: string, documentId: string) =>
    request<{ url: string }>(`/orders/${orderId}/documents/${documentId}/url`),
};
