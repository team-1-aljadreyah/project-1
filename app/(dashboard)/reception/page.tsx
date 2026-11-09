"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { api, type Doctor } from "@/lib/api";
import { doctorName } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { flush, queue, useOnline, useOutbox } from "@/lib/offline";
import { useLoad } from "@/lib/useLoad";
import { UpcomingBookings } from "@/components/upcoming-bookings";
import { walkInSchema, type WalkInForm } from "@/lib/validation";
import { DuplicateWarning } from "@/components/duplicate-warning";
import { Button, Card, EmptyState, ErrorState, Field, Input, PageHeader, Select, StatusBadge, TicketBadge } from "@/components/common";
import { CardsSkeleton, FormSkeleton } from "@/components/skeleton";
import { VitalsEntry } from "@/components/vitals";
import { HeartPulse } from "lucide-react";

function QueueCard({ doctor, version }: { doctor: Doctor; version: number }) {
  const { t, locale } = useT();
  const { state, reload, refresh } = useLoad(() => api.doctorQueue(doctor.id), String(doctor.id), { every: 4000, live: ["appointment.*", "visit.*", "doctor.late", "doctor.absent"] });
  // The patient whose measurements are being typed in, if any.
  const [measuring, setMeasuring] = useState<number | null>(null);

  // After a check-in or walk-in, update the queue right away, without the skeleton.
  useEffect(() => {
    if (version > 0) refresh();
  }, [version, refresh]);

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">
        {t("queue.title")}: {doctorName(doctor, locale)}
      </h2>
      {state.status === "loading" && <CardsSkeleton count={1} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && state.data.length === 0 && <p className="text-sm text-slate-500">{t("queue.empty")}</p>}
      {state.status === "success" && (
        <ol className="space-y-2">
          {state.data.map((a) => (
            <li key={a.id} className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <TicketBadge ticket={a.ticket} />
                  {a.patient_name}
                </span>
                <span className="flex items-center gap-2">
                  {/* A tick once measured; otherwise a button to measure. */}
                  <button
                    type="button"
                    onClick={() => setMeasuring(measuring === a.id ? null : a.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${a.has_vitals ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                    data-vitals-button={a.id}
                  >
                    <HeartPulse className="size-3.5" aria-hidden />
                    {a.has_vitals ? `${t("vitals.short")} ✓` : t("vitals.short")}
                  </button>
                  {a.emergency ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{t("queue.emergency")}</span>
                  ) : (
                    <StatusBadge status={a.status} />
                  )}
                </span>
              </div>
              {measuring === a.id && (
                <VitalsEntry
                  appointmentId={a.id}
                  onCancel={() => setMeasuring(null)}
                  onSaved={() => {
                    setMeasuring(null);
                    refresh();
                  }}
                />
              )}
            </li>
          ))}
        </ol>
      )}
      <LateForm doctor={doctor} />
    </Card>
  );
}

const LATE_MINUTES = [10, 15, 30, 60];

// Tells every patient booked with this doctor today, so nobody has to phone them.
function LateForm({ doctor }: { doctor: Doctor }) {
  const { t } = useT();
  const [minutes, setMinutes] = useState(String(LATE_MINUTES[1]));
  const [saving, setSaving] = useState(false);

  async function send() {
    setSaving(true);
    try {
      const { notified } = await api.markLate(doctor.id, Number(minutes));
      toast.success(t("reception.lateSent", { n: notified }));
    } catch (err) {
      toast.error(errorText(err, t));
    }
    setSaving(false);
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
      <div className="w-32">
        <Field label={t("reception.late")}>
          <Select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
            {LATE_MINUTES.map((m) => (
              <option key={m} value={m}>
                {t("book.minutes", { n: m })}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button variant="secondary" loading={saving} onClick={send}>
        {t("reception.notifyLate")}
      </Button>
    </div>
  );
}

function WalkInCard({ doctors, onAdded }: { doctors: Doctor[]; onAdded: () => void }) {
  const { t, locale } = useT();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WalkInForm>({
    resolver: zodResolver(walkInSchema),
    defaultValues: { name: "", phone: "", doctor_id: String(doctors[0].id), emergency: false },
  });
  const [typedName, typedPhone] = useWatch({ control, name: ["name", "phone"] });

  async function onSubmit(values: WalkInForm) {
    const body = { name: values.name, phone: values.phone, doctor_id: Number(values.doctor_id), emergency: values.emergency };
    // One key per walk-in, used for the first send and for any retry.
    const key = crypto.randomUUID();
    // No internet: keep it in this browser and send it later, so reception never has to stop.
    if (!navigator.onLine) {
      queue({ id: key, type: "walkIn", body, label: values.name });
      toast.info(t("offline.saved"));
      reset();
      return;
    }
    try {
      const { duplicate } = await api.addWalkIn({ ...body, idempotency_key: key });
      if (duplicate) toast.info(t("reception.duplicate"));
      else toast.success(t("reception.added"));
      reset();
      onAdded();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <h2 className="font-semibold">{t("reception.walkIn")}</h2>
        <Field label={t("reception.name")} error={errors.name?.message}>
          <Input maxLength={60} placeholder={t("validation.nameExample")} invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label={t("login.phone")} error={errors.phone?.message}>
          <Input type="tel" inputMode="numeric" dir="ltr" placeholder="07XXXXXXXXX" invalid={!!errors.phone} {...register("phone")} />
        </Field>
        <DuplicateWarning
          name={typedName}
          phone={typedPhone}
          mode="walkIn"
          onUse={(p) => {
            setValue("name", p.name, { shouldValidate: true });
            setValue("phone", p.phone, { shouldValidate: true });
          }}
        />
        <Field label={t("reception.doctor")}>
          <Select {...register("doctor_id")}>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {doctorName(d, locale)}
              </option>
            ))}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-brand-600" {...register("emergency")} />
          {t("reception.emergency")}
        </label>
        <Button type="submit" loading={isSubmitting} className="w-full">
          {t("reception.add")}
        </Button>
      </form>
    </Card>
  );
}

export default function ReceptionPage() {
  const { t, locale } = useT();
  const doctors = useLoad(api.listDoctors);
  const booked = useLoad(api.bookedToday, "", { every: 4000, live: ["appointment.*", "payment.settled"] });
  // Goes up by one after every change at the desk, so the queue cards fetch again.
  const [version, setVersion] = useState(0);
  const online = useOnline();
  const outbox = useOutbox();
  const waitingIds = new Set(outbox.flatMap((item) => (item.type === "checkIn" ? [item.appointmentId] : [])));
  const refreshBooked = booked.refresh;
  const afterChange = useCallback(() => {
    refreshBooked();
    setVersion((v) => v + 1);
  }, [refreshBooked]);

  // When the connection comes back, send everything that waited.
  useEffect(() => {
    if (!online) return;
    void flush().then((sent) => {
      if (sent > 0) {
        toast.success(t("offline.sent", { n: sent }));
        afterChange();
      }
    });
  }, [online, afterChange, t]);

  // Only possible after the appointment time. Enough no-shows means the patient must pay a deposit next time.
  async function noShow(id: number) {
    try {
      await api.markNoShow(id);
      toast.success(t("reception.noShowDone"));
      afterChange();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  async function checkIn(id: number, emergency: boolean, label: string) {
    const key = crypto.randomUUID();
    if (!navigator.onLine) {
      queue({ id: key, type: "checkIn", appointmentId: id, emergency, label });
      toast.info(t("offline.saved"));
      return;
    }
    try {
      await api.checkIn(id, emergency, key);
      toast.success(t("reception.checkedIn"));
      afterChange();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  return (
    <>
      <PageHeader title={t("reception.title")} description={t("reception.subtitle")} />
      {(!online || outbox.length > 0) && (
        <div role="status" className={`mb-4 rounded-lg px-4 py-3 text-sm ${online ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-800"}`}>
          <p className="font-medium">{online ? t("offline.sending") : t("offline.title")}</p>
          {outbox.length > 0 && (
            <p>
              {t("offline.waiting", { n: outbox.length })}: {outbox.map((item) => item.label).join("، ")}
            </p>
          )}
        </div>
      )}
      {doctors.state.status === "loading" && <FormSkeleton />}
      {doctors.state.status === "error" && <ErrorState message={errorText(doctors.state.error, t)} onRetry={doctors.reload} />}
      {doctors.state.status === "success" && (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Card className="space-y-3">
              <h2 className="font-semibold">{t("reception.today")}</h2>
              {booked.state.status === "loading" && <CardsSkeleton count={1} />}
              {booked.state.status === "error" && <ErrorState message={errorText(booked.state.error, t)} onRetry={booked.reload} />}
              {booked.state.status === "success" && booked.state.data.length === 0 && <EmptyState title={t("reception.empty")} />}
              {booked.state.status === "success" &&
                booked.state.data
                  .filter((a) => !waitingIds.has(a.id))
                  .map((a) => {
                  const doctor = doctors.state.status === "success" ? doctors.state.data.find((d) => d.id === a.doctor_id) : undefined;
                  return (
                    <div key={a.id} data-appointment={a.time} className="space-y-2 border-t border-slate-200 pt-3">
                      <p className="text-sm">
                        <span className="font-semibold">{a.patient_name}</span>
                        {doctor && ` · ${doctorName(doctor, locale)}`} · <span dir="ltr">{a.time}</span>
                      </p>
                      <div className="flex gap-2">
                        <Button onClick={() => checkIn(a.id, false, a.patient_name)}>{t("reception.checkIn")}</Button>
                        <Button variant="danger" onClick={() => checkIn(a.id, true, a.patient_name)}>
                          {t("reception.emergency")}
                        </Button>
                        <Button variant="ghost" onClick={() => noShow(a.id)}>
                          {t("reception.noShow")}
                        </Button>
                      </div>
                    </div>
                  );
                })}
            </Card>
            <UpcomingBookings doctors={doctors.state.data} />
            <WalkInCard doctors={doctors.state.data} onAdded={afterChange} />
          </div>
          <div className="space-y-4">
            {doctors.state.data.map((d) => (
              <QueueCard key={d.id} doctor={d} version={version} />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
