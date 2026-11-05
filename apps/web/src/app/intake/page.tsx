'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateOrderSchema, type CreateOrderInput } from '@dme/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';

type FieldErrors = Partial<Record<keyof CreateOrderInput, string>>;

const initialForm = {
  patientId: '',
  equipmentCode: '',
  diagnosisCode: '',
  quantity: '1',
  clinicalNotes: '',
};

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-900">{label}</span>
      {hint && <span className="ml-1 text-xs text-slate-400">{hint}</span>}
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </label>
  );
}

const inputClass =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

export default function IntakePage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const patientsQuery = useQuery({ queryKey: ['patients'], queryFn: api.patients });

  const mutation = useMutation({
    mutationFn: api.createOrder,
    onSuccess: (order) => {
      setSuccess(
        `Order ${order.equipmentCode} created for ${
          order.patient ? `${order.patient.firstName} ${order.patient.lastName}` : 'patient'
        } — status ${order.status}.`,
      );
      setForm(initialForm);
      setErrors({});
      setSubmitError(null);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const nextErrors: FieldErrors = {};
        for (const issue of error.problem.errors ?? []) {
          if (issue.path in initialForm) {
            nextErrors[issue.path as keyof CreateOrderInput] = issue.message;
          }
        }
        if (Object.keys(nextErrors).length > 0) {
          setErrors(nextErrors);
          setSubmitError(null);
        } else {
          setErrors({});
          setSubmitError(error.problem.title);
        }
      } else {
        setErrors({});
        setSubmitError('Unable to reach the API. Is it running on port 3001?');
      }
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(null);
    setSubmitError(null);

    const parsed = CreateOrderSchema.safeParse({
      patientId: form.patientId,
      equipmentCode: form.equipmentCode.trim().toUpperCase(),
      diagnosisCode: form.diagnosisCode.trim().toUpperCase(),
      quantity: Number(form.quantity),
      clinicalNotes: form.clinicalNotes.trim(),
    });

    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof CreateOrderInput;
        if (!nextErrors[field]) nextErrors[field] = issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    mutation.mutate(parsed.data);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">New DME intake</h1>
        <p className="mt-1 text-sm text-slate-500">
          Submit an order for prior-authorization review. Validation uses the same Zod contract as
          the API.
        </p>
      </div>

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-800">
          <p className="font-medium">{success}</p>
          <Link href="/" className="mt-1 inline-block font-medium text-emerald-700 underline">
            View on dashboard →
          </Link>
        </div>
      )}

      {submitError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          <p className="font-medium">{submitError}</p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-xl border border-slate-200 bg-white p-6"
        noValidate
      >
        <Field label="Patient" error={errors.patientId}>
          <select
            value={form.patientId}
            onChange={(event) => setForm({ ...form, patientId: event.target.value })}
            className={inputClass}
          >
            <option value="">
              {patientsQuery.isLoading ? 'Loading patients…' : 'Select a patient'}
            </option>
            {patientsQuery.data?.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.firstName} {patient.lastName} — {patient.insuranceProvider}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Equipment code" hint="HCPCS" error={errors.equipmentCode}>
            <input
              value={form.equipmentCode}
              onChange={(event) => setForm({ ...form, equipmentCode: event.target.value })}
              placeholder="E0601"
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
          <Field label="Diagnosis code" hint="ICD-10" error={errors.diagnosisCode}>
            <input
              value={form.diagnosisCode}
              onChange={(event) => setForm({ ...form, diagnosisCode: event.target.value })}
              placeholder="G47.33"
              className={`${inputClass} font-mono uppercase`}
            />
          </Field>
        </div>

        <Field label="Quantity" error={errors.quantity}>
          <input
            type="number"
            min={1}
            max={99}
            value={form.quantity}
            onChange={(event) => setForm({ ...form, quantity: event.target.value })}
            className={inputClass}
          />
        </Field>

        <Field
          label="Clinical notes"
          hint="min 20 characters — the agent reads these"
          error={errors.clinicalNotes}
        >
          <textarea
            rows={5}
            value={form.clinicalNotes}
            onChange={(event) => setForm({ ...form, clinicalNotes: event.target.value })}
            placeholder="Sleep study AHI 32/hr, ESS 14, prior PAP trial discontinued due to mask intolerance…"
            className={inputClass}
          />
        </Field>

        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mutation.isPending ? 'Submitting…' : 'Submit order'}
          </button>
        </div>
      </form>
    </div>
  );
}
