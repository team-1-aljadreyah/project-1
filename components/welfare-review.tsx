"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, type WelfareRequest, type WelfareStatus } from "@/lib/api";
import { dateTime, yearDate } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { useMediaUrl } from "@/lib/media";
import { useLoad } from "@/lib/useLoad";
import { localToday } from "@/lib/validation";
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader } from "@/components/common";
import { CardsSkeleton } from "@/components/skeleton";

const TABS: WelfareStatus[] = ["pending", "approved", "rejected"];

// A year from today: welfare cards are renewed yearly, so that's the usual approval.
function inOneYear() {
  const d = new Date(`${localToday()}T00:00:00`);
  d.setFullYear(d.getFullYear() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// One request: the card photo (bigger on click), the details, and approve or reject.
function RequestCard({ request: w, onDone }: { request: WelfareRequest; onDone: () => void }) {
  const { t, locale } = useT();
  const [validUntil, setValidUntil] = useState(inOneYear);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(false);
  // The photo is on the backend: this gives the full address the browser can open.
  const photo = useMediaUrl(w.photo_url, "welfare");

  async function review(approve: boolean) {
    setSaving(true);
    try {
      await api.reviewWelfare(w.id, approve ? { approve: true, valid_until: validUntil } : { approve: false, reason });
      toast.success(approve ? t("welfare.review.approved") : t("welfare.review.rejected"));
      onDone();
    } catch (err) {
      toast.error(errorText(err, t));
      setSaving(false);
    }
  }

  return (
    <li className="grid gap-4 py-4 sm:grid-cols-[14rem_1fr]" data-welfare-request={w.id}>
      <button type="button" onClick={() => setZoom(!zoom)} className="block overflow-hidden rounded-lg border border-slate-200 bg-slate-50" aria-label={t("welfare.review.zoom")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a private photo from the API, shown as it is */}
        <img src={photo || undefined} alt={t("welfare.photo")} className={`w-full object-contain ${zoom ? "max-h-[32rem]" : "max-h-40"}`} />
      </button>
      <div className="space-y-2 text-sm">
        <p className="text-base font-semibold">
          {w.patient_name} · <span dir="ltr">{w.patient_phone}</span>
        </p>
        <p>
          {t("welfare.cardNumber")}: <span className="font-mono font-semibold" dir="ltr">{w.card_number}</span>
        </p>
        <p className="text-slate-500">{t("welfare.review.sentAt", { at: dateTime(w.submitted_at, locale) })}</p>
        {w.status === "approved" && w.valid_until && (
          <p className="text-emerald-700">{t("welfare.review.approvedBy", { name: w.reviewed_by ?? "", date: yearDate(w.valid_until, locale) })}</p>
        )}
        {w.status === "rejected" && <p className="text-red-700">{t("welfare.review.rejectedBy", { name: w.reviewed_by ?? "", reason: w.reject_reason })}</p>}

        {w.status === "pending" && (
          <div className="space-y-3 border-t border-slate-200 pt-3">
            <p className="text-slate-600">{t("welfare.review.check")}</p>
            {!rejecting ? (
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-44">
                  <Field label={t("welfare.review.validUntil")}>
                    <Input type="date" dir="ltr" min={localToday()} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
                  </Field>
                </div>
                <Button loading={saving} disabled={!validUntil} onClick={() => review(true)}>
                  {t("welfare.review.approve")}
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(true)}>
                  {t("welfare.review.reject")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-48 flex-1">
                  <Field label={t("welfare.review.reason")}>
                    <Input value={reason} placeholder={t("welfare.review.reasonPlaceholder")} onChange={(e) => setReason(e.target.value)} />
                  </Field>
                </div>
                <Button variant="danger" loading={saving} disabled={reason.trim().length < 3} onClick={() => review(false)}>
                  {t("welfare.review.confirmReject")}
                </Button>
                <Button variant="secondary" onClick={() => setRejecting(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

// For reception and the manager: check the welfare cards patients sent.
export function WelfareReviewPage() {
  const { t } = useT();
  const [tab, setTab] = useState<WelfareStatus>("pending");
  const { state, reload, refresh } = useLoad(() => api.listWelfare(tab), tab, { every: 15000 });

  return (
    <>
      <PageHeader title={t("welfare.review.title")} description={t("welfare.review.subtitle")} />
      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((s) => (
          <Button key={s} variant={s === tab ? "primary" : "secondary"} onClick={() => setTab(s)}>
            {t(`welfare.review.tab.${s}`)}
          </Button>
        ))}
      </div>
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" &&
        (state.data.length === 0 ? (
          <EmptyState title={t(`welfare.review.empty.${tab}`)} />
        ) : (
          <Card className="py-0">
            <ul className="divide-y divide-slate-200">
              {state.data.map((w) => (
                <RequestCard key={w.id} request={w} onDone={refresh} />
              ))}
            </ul>
          </Card>
        ))}
    </>
  );
}
