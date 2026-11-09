"use client";

import { useState } from "react";
import { ArrowLeftRight, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, type DuplicateGroup } from "@/lib/api";
import { errorText, useT, type MessageKey } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { Button, Card, EmptyState, ErrorState, Field, LoadError, PageHeader, Select, Textarea } from "@/components/common";
import { AlertsBanner } from "@/components/medical-alerts";
import { CardsSkeleton } from "@/components/skeleton";

// Any "exact…" kind (the real server says "exact_phone_and_name", the demo "exact_match") is the same person for sure.
const isExact = (type: string) => type.startsWith("exact");

// The label for how the server matched the patients. Kinds we don't know yet get a general label.
function matchLabel(type: string): MessageKey {
  if (isExact(type)) return "merge.type.exact_match";
  return type === "shared_phone_family" ? "merge.type.shared_phone_family" : "merge.type.other";
}

// One side of the comparison: everything the manager needs to decide which file to keep.
function PatientSide({ patientId, title, keep }: { patientId: number; title: string; keep: boolean }) {
  const { t } = useT();
  const { state, reload } = useLoad(() => api.patientFile(patientId), String(patientId));
  return (
    <Card className={`space-y-3 ${keep ? "ring-2 ring-brand-500" : ""}`} data-merge-side={keep ? "keep" : "from"}>
      <p className={`text-sm font-semibold ${keep ? "text-brand-700" : "text-slate-500"}`}>{title}</p>
      {state.status === "loading" && <CardsSkeleton count={1} />}
      {state.status === "error" && <LoadError error={state.error} onRetry={reload} />}
      {state.status === "success" && (
        <>
          <div>
            <p className="text-lg font-bold">{state.data.patient.name}</p>
            <p className="text-sm text-slate-500" dir="ltr">
              {state.data.patient.phone}
            </p>
            <p className="text-xs text-slate-500">{state.data.patient.has_account ? t("patients.account") : t("patients.noAccount")}</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            {(
              [
                ["patients.stat.visits", state.data.patient.visits],
                ["patients.stat.appointments", state.data.patient.appointments],
                ["patients.stat.noShows", state.data.patient.no_shows],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-lg bg-slate-100 px-2 py-2">
                <dt className="text-xs text-slate-500">{t(label)}</dt>
                <dd className="text-lg font-bold">{n}</dd>
              </div>
            ))}
          </dl>
          {state.data.alerts.allergies.length + state.data.alerts.conditions.length > 0 || state.data.alerts.blood_type ? (
            <AlertsBanner alerts={state.data.alerts} />
          ) : (
            <p className="text-sm text-slate-500">{t("merge.noAlerts")}</p>
          )}
        </>
      )}
    </Card>
  );
}

// Compare two of the group's patients side by side, choose which file stays, give a reason, confirm, merge.
function MergePanel({ group, onDone, onCancel }: { group: DuplicateGroup; onDone: () => void; onCancel: () => void }) {
  const { t } = useT();
  // Start by keeping the file with the most history: fewer records have to move.
  const busiest = [...group.patients].sort((a, b) => b.visits + b.appointments - (a.visits + a.appointments));
  const [keepId, setKeepId] = useState(busiest[0].id);
  const [fromId, setFromId] = useState(busiest[1].id);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameOf = (id: number) => group.patients.find((p) => p.id === id)?.name ?? "";

  function pickKeep(id: number) {
    // The same patient can't be on both sides: the other side takes the next one.
    if (id === fromId) setFromId(keepId);
    setKeepId(id);
    setConfirming(false);
  }

  function ask() {
    if (reason.trim().length < 5) {
      setReasonError(true);
      return;
    }
    setConfirming(true);
  }

  async function merge() {
    setSaving(true);
    try {
      await api.mergePatients({ primary_patient_id: keepId, source_patient_id: fromId, reason: reason.trim() });
      toast.success(t("merge.done"));
      onDone();
    } catch (err) {
      toast.error(errorText(err, t));
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-4" data-merge-panel>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label={t("merge.keep")}>
            <Select value={keepId} onChange={(e) => pickKeep(Number(e.target.value))}>
              {group.patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.phone}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Button
          type="button"
          variant="secondary"
          aria-label={t("merge.swap")}
          title={t("merge.swap")}
          onClick={() => {
            setKeepId(fromId);
            setFromId(keepId);
            setConfirming(false);
          }}
        >
          <ArrowLeftRight className="size-4" aria-hidden />
        </Button>
        <div className="min-w-48 flex-1">
          <Field label={t("merge.from")}>
            <Select
              value={fromId}
              onChange={(e) => {
                setFromId(Number(e.target.value));
                setConfirming(false);
              }}
            >
              {group.patients
                .filter((p) => p.id !== keepId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.phone}
                  </option>
                ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PatientSide patientId={keepId} title={t("merge.keep")} keep />
        <PatientSide patientId={fromId} title={t("merge.from")} keep={false} />
      </div>

      <Field label={t("merge.reason")} error={reasonError ? "merge.reasonShort" : undefined}>
        <Textarea
          rows={2}
          value={reason}
          placeholder={t("merge.reasonHint")}
          aria-invalid={reasonError || undefined}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(false);
          }}
        />
      </Field>

      {confirming ? (
        <div role="alert" className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("merge.confirmText", { from: nameOf(fromId), keep: nameOf(keepId) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="danger" loading={saving} onClick={merge}>
              {t("merge.confirm")}
            </Button>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => setConfirming(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={ask}>
            {t("merge.button")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      )}
    </Card>
  );
}

// Manager: patients who may be registered twice. Compare, then merge them into one file.
export default function MergeRecordsPage() {
  const { t } = useT();
  const { state, reload } = useLoad(api.listDuplicates);
  // The group being compared, by its first patient's id (stays right when the list reloads).
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <>
      <PageHeader title={t("merge.title")} description={t("merge.subtitle")} />
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && state.data.length === 0 && <EmptyState title={t("merge.empty")} />}
      {state.status === "success" && (
        <ul className="space-y-4">
          {state.data.map((group) => {
            const id = group.patients[0].id;
            return (
              <li key={group.patients.map((p) => p.id).join("-")} className="space-y-3" data-duplicate-group={id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        isExact(group.match_type) ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {t(matchLabel(group.match_type))}
                    </span>
                    <p className="font-medium">
                      {group.patients.map((p) => (
                        <span key={p.id} className="me-3 inline-block">
                          {p.name} · <span dir="ltr">{p.phone}</span>
                        </span>
                      ))}
                    </p>
                    {group.reasons.length > 0 && <p className="text-xs text-slate-500">{group.reasons.join(" · ")}</p>}
                  </div>
                  {openId !== id && (
                    <Button type="button" variant="secondary" onClick={() => setOpenId(id)}>
                      {t("merge.compare")}
                    </Button>
                  )}
                </Card>
                {openId === id && (
                  <MergePanel
                    group={group}
                    onCancel={() => setOpenId(null)}
                    onDone={() => {
                      setOpenId(null);
                      reload();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
