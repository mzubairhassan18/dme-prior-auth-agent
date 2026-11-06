'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import type { AuthorizationDecision, ClinicalDocument } from '@dme/shared';
import { api, ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/status-badge';
import { useOrderEvents } from '@/lib/use-order-events';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const dobFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

const outcomeStyles: Record<AuthorizationDecision['outcome'], string> = {
  APPROVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  NEEDS_MORE_INFO: 'bg-amber-50 text-amber-700 ring-amber-200',
  DENY: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function documentKind(contentType: string): string {
  if (contentType === 'application/pdf') {
    return 'PDF';
  }
  if (contentType === 'image/png') {
    return 'PNG';
  }
  if (contentType === 'image/jpeg') {
    return 'JPEG';
  }
  return contentType;
}

function DocumentIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="mt-0.5 h-8 w-8 shrink-0 text-slate-400"
    >
      <path
        fillRule="evenodd"
        d="M4 2a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.414A2 2 0 0 0 17.414 6L14 2.586A2 2 0 0 0 12.586 2H4Zm8 1.5V6a1 1 0 0 0 1 1h2.5L12 3.5Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

export function OrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = Array.isArray(params.id) ? params.id[0] : params.id;
  const queryClient = useQueryClient();
  const { connected } = useOrderEvents();
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => api.order(orderId),
    enabled: Boolean(orderId),
    refetchInterval: connected ? false : 10_000,
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadDocument(orderId, file),
    onSuccess: (document) => {
      setSelectedFile(null);
      setUploadError(null);
      setUploadNotice(`${document.fileName} uploaded.`);
      if (fileInput.current) {
        fileInput.current.value = '';
      }
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      setUploadNotice(null);
      setUploadError(
        error instanceof ApiError
          ? (error.problem.detail ?? error.problem.title)
          : 'Upload failed. Is the API running?',
      );
    },
  });

  const order = orderQuery.data;
  const decision = order?.decision ?? null;
  const documents: ClinicalDocument[] = order?.documents ?? [];

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadError(null);
    setUploadNotice(null);

    if (file && file.size > 5 * 1024 * 1024) {
      setSelectedFile(null);
      setUploadError('File must be 5 MB or smaller.');
      event.target.value = '';
    }
  }

  function handleUpload() {
    if (!selectedFile) {
      setUploadError('Choose a PDF, PNG, or JPEG first.');
      return;
    }
    setUploadError(null);
    setUploadNotice(null);
    upload.mutate(selectedFile);
  }

  async function handleDownload(documentId: string) {
    setDownloadingId(documentId);
    setDownloadError(null);

    try {
      const { url } = await api.documentUrl(orderId, documentId);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    } catch (error) {
      setDownloadError(
        error instanceof ApiError
          ? (error.problem.detail ?? error.problem.title)
          : 'Could not create a download link.',
      );
    } finally {
      setDownloadingId(null);
    }
  }

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
        <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    );
  }

  if (orderQuery.error || !order) {
    return (
      <div className="space-y-4">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to queue
        </Link>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <p className="font-medium">
            {orderQuery.error instanceof ApiError
              ? orderQuery.error.problem.title
              : 'Could not load this order'}
          </p>
          {orderQuery.error instanceof ApiError && orderQuery.error.problem.detail && (
            <p className="mt-1">{orderQuery.error.problem.detail}</p>
          )}
          <p className="mt-1 text-rose-500">Is the API running on port 3001?</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
        ← Back to queue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              {order.patient
                ? `${order.patient.firstName} ${order.patient.lastName}`
                : 'Unknown patient'}
            </h1>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Order <span className="font-mono text-xs">{order.id.slice(0, 8)}…</span>
            <span className="mx-2 text-slate-300">·</span>
            created {dateFormatter.format(new Date(order.createdAt))}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
          title={connected ? 'Socket.IO connected to the API' : 'Socket disconnected — polling'}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? 'animate-pulse bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          {connected ? 'Live' : 'Polling fallback'}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Order summary</h2>
            </div>
            <div className="space-y-5 px-5 py-4">
              <dl className="grid gap-4 sm:grid-cols-2">
                <DetailRow
                  label="Equipment (HCPCS)"
                  value={`${order.equipmentCode} · quantity ${order.quantity}`}
                />
                <DetailRow label="Diagnosis (ICD-10)" value={order.diagnosisCode} />
                <DetailRow
                  label="Insurance"
                  value={order.patient?.insuranceProvider ?? 'Not recorded'}
                />
                <DetailRow label="Member ID" value={order.patient?.memberId ?? 'Not recorded'} />
                <DetailRow
                  label="Date of birth"
                  value={
                    order.patient
                      ? dobFormatter.format(new Date(order.patient.dateOfBirth))
                      : 'Not recorded'
                  }
                />
              </dl>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Clinical notes
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {order.clinicalNotes}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Agent decision</h2>
              {decision && (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                    outcomeStyles[decision.outcome]
                  }`}
                >
                  {decision.outcome.replaceAll('_', ' ')}
                </span>
              )}
            </div>

            <div className="px-5 py-4">
              {!decision && (
                <div
                  className={`rounded-lg px-4 py-3 text-sm ${
                    order.status === 'FAILED'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-slate-50 text-slate-600'
                  }`}
                >
                  {order.status === 'ANALYZING' &&
                    'The agent is analyzing this order. This page updates live.'}
                  {order.status === 'SUBMITTED' && 'Waiting for the agent to pick up this order.'}
                  {order.status === 'DECISION_READY' && 'No decision was recorded for this order.'}
                  {order.status === 'FAILED' &&
                    'Analysis failed. Check the agent logs for details.'}
                </div>
              )}

              {decision && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Policy grounding
                      </p>
                      <p className="mt-1 font-mono text-xs text-slate-700">
                        {decision.policyReference}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                        Confidence
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {decision.confidence != null
                          ? `${Math.round(decision.confidence * 100)}%`
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      Rationale
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                      {decision.rationale}
                    </p>
                  </div>

                  {decision.missingDocuments.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                        Missing documentation
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                        {decision.missingDocuments.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <p className="text-xs text-slate-400">
                    {decision.modelUsed}
                    <span className="mx-1.5 text-slate-300">·</span>
                    {dateFormatter.format(new Date(decision.createdAt))}
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Clinical documents</h2>
              <span className="text-xs text-slate-500">{documents.length}</span>
            </div>

            <div className="space-y-4 px-5 py-4">
              <p className="text-xs leading-5 text-slate-500">
                PDF, PNG, or JPEG up to 5 MB. Files are stored in MinIO and downloaded through
                15-minute presigned URLs.
              </p>

              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                <label htmlFor="clinical-document" className="text-xs font-medium text-slate-700">
                  Attach a document
                </label>
                <input
                  id="clinical-document"
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 file:ring-1 file:ring-slate-300 hover:file:bg-slate-100"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span
                    className="min-w-0 truncate text-xs text-slate-500"
                    title={selectedFile?.name}
                  >
                    {selectedFile ? selectedFile.name : 'No file selected'}
                  </span>
                  <button
                    type="button"
                    onClick={handleUpload}
                    disabled={!selectedFile || upload.isPending}
                    className="shrink-0 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {upload.isPending ? 'Uploading…' : 'Upload'}
                  </button>
                </div>
                {uploadError && <p className="mt-2 text-xs text-rose-600">{uploadError}</p>}
                {uploadNotice && <p className="mt-2 text-xs text-emerald-600">{uploadNotice}</p>}
              </div>

              {downloadError && (
                <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600">
                  {downloadError}
                </p>
              )}

              {documents.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                  No documents uploaded yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {documents.map((document) => (
                    <li
                      key={document.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 px-3 py-3"
                    >
                      <DocumentIcon />
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-sm font-medium text-slate-900"
                          title={document.fileName}
                        >
                          {document.fileName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {documentKind(document.contentType)}
                          <span className="mx-1 text-slate-300">·</span>
                          {formatBytes(document.size)}
                          <span className="mx-1 text-slate-300">·</span>
                          {dateFormatter.format(new Date(document.createdAt))}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDownload(document.id)}
                        disabled={downloadingId === document.id}
                        className="shrink-0 text-xs font-medium text-teal-700 hover:text-teal-800 hover:underline disabled:text-slate-400"
                      >
                        {downloadingId === document.id ? 'Opening…' : 'Download'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
