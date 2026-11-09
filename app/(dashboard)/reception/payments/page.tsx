"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { api, type Currency, type Invoice } from "@/lib/api";
import { dateTime } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { paymentSchema } from "@/lib/validation";
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, StatusBadge } from "@/components/common";
import { AmountsText, UsdHint, amountText } from "@/components/money";
import { CardsSkeleton } from "@/components/skeleton";

function CashForm({ invoice, currency, usdRate, onPaid }: { invoice: Invoice; currency: Currency; usdRate: number; onPaid: () => void }) {
  const { t } = useT();
  const max = invoice.money.balance[currency];
  // One key per payment. A double click or a retry sends the same key, so the money is recorded once.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ amount: number }>({ resolver: zodResolver(paymentSchema(max)), defaultValues: { amount: max } });

  async function onSubmit({ amount }: { amount: number }) {
    try {
      await api.payCash(invoice.appointment_id, { amount, currency, idempotency_key: key });
      toast.success(t("payments.taken"));
      setKey(crypto.randomUUID());
      onPaid();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-wrap items-end gap-2">
      <div className="w-40">
        <Field label={t("payments.amount", { currency: currency === "USD" ? t("common.usd") : t("common.currency") })} error={errors.amount?.message}>
          <Input type="number" dir="ltr" invalid={!!errors.amount} {...register("amount", { valueAsNumber: true })} />
        </Field>
      </div>
      <Button type="submit" loading={isSubmitting}>
        {t("payments.takeCash")}
      </Button>
      {currency === "USD" && <UsdHint usd={max} rate={usdRate} />}
    </form>
  );
}

function InvoiceCard({ invoice, usdRate, onPaid }: { invoice: Invoice; usdRate: number; onPaid: () => void }) {
  const { t, locale } = useT();
  const owing = (["IQD", "USD"] as const).filter((c) => invoice.money.balance[c] > 0);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">
          {invoice.patient_name} · {invoice.doctor_name} {invoice.time && <span dir="ltr">· {invoice.time}</span>}
        </h2>
        <StatusBadge status={invoice.status} />
      </div>

      <ul className="space-y-1 text-sm">
        {invoice.items.map((item) => (
          <li key={item.id} className={`flex justify-between gap-2 ${item.kind === "discount" ? "text-emerald-700" : ""}`}>
            <span>{locale === "ar" ? item.label_ar : item.label}</span>
            <span>{amountText(item.price, item.currency, t)}</span>
          </li>
        ))}
      </ul>

      {invoice.payments.length > 0 && (
        <ul className="space-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
          {invoice.payments.map((p) => (
            <li key={p.id}>
              {t(`payments.kind.${p.kind}`)} · {t(`payments.method.${p.method}`)} · {amountText(p.amount, p.currency, t)} · {p.by} ·{" "}
              {dateTime(p.at, locale)}
            </li>
          ))}
        </ul>
      )}

      <p className="border-t border-slate-200 pt-2 text-sm font-medium">
        {t("payments.left")}: <AmountsText amounts={invoice.money.balance} />
      </p>

      {invoice.status === "no_show" ? (
        <p className="text-sm text-slate-600">{t("payments.noShow")}</p>
      ) : owing.length === 0 ? (
        <p className="text-sm font-medium text-emerald-700">{t("payments.settled")}</p>
      ) : (
        owing.map((currency) => <CashForm key={currency} invoice={invoice} currency={currency} usdRate={usdRate} onPaid={onPaid} />)
      )}
    </Card>
  );
}

export default function PaymentsPage() {
  const { t } = useT();
  const { state, reload } = useLoad(() => Promise.all([api.todayInvoices(), api.getSettings()]), "", { every: 8000, live: ["payment.settled", "appointment.*"] });

  return (
    <>
      <PageHeader title={t("payments.title")} description={t("payments.subtitle")} />
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && state.data[0].length === 0 && <EmptyState title={t("payments.empty")} />}
      {state.status === "success" && (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {state.data[0].map((invoice) => (
            <InvoiceCard key={invoice.appointment_id} invoice={invoice} usdRate={state.data[1].usd_rate} onPaid={reload} />
          ))}
        </div>
      )}
    </>
  );
}
