"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api, type MyAppointment } from "@/lib/api";
import { doctorName, longDate } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { goToPayment, paymentReturnUrl } from "@/lib/payment";

// "10:45", in the page's language with western digits.
const timeOf = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === "ar" ? "ar-IQ-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
import { localToday } from "@/lib/validation";
import { DayPicker, SlotPicker } from "@/components/booking";
import { AmountsText, amountText } from "@/components/money";
import { Button, Card, EmptyState, ErrorState, PageHeader, StatusBadge, TicketBadge, buttonClass } from "@/components/common";
import { CardsSkeleton } from "@/components/skeleton";

function TurnText({ appointment }: { appointment: MyAppointment }) {
  const { t } = useT();
  if (appointment.status === "in_progress") return <>{t("appointments.withDoctor")}</>;
  if (appointment.ahead === 0) return <>{t("appointments.yourTurn")}</>;
  return <>{t("appointments.ahead", { n: appointment.ahead ?? 0 })}</>;
}

function ReschedulePanel({ appointment, onDone, onClose }: { appointment: MyAppointment; onDone: () => void; onClose: () => void }) {
  const { t } = useT();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.rescheduleAppointment(appointment.id, { date, time });
      toast.success(t("appointments.changed"));
      onDone();
    } catch (err) {
      toast.error(errorText(err, t));
      setTime("");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
      <DayPicker
        doctorId={appointment.doctor.id}
        value={date}
        onChange={(next) => {
          setDate(next);
          setTime("");
        }}
      />
      <SlotPicker doctorId={appointment.doctor.id} date={date} kind={appointment.kind} value={time} onPick={setTime} />
      <div className="flex gap-2">
        <Button disabled={!date || !time} loading={saving} onClick={save}>
          {t("appointments.saveChange")}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t("appointments.keep")}
        </Button>
      </div>
    </div>
  );
}

function PayRest({ appointment }: { appointment: MyAppointment }) {
  const { t } = useT();
  // One key per press of the button: pressing twice opens the same payment, not two.
  const [key] = useState(() => crypto.randomUUID());
  const [paying, setPaying] = useState(false);
  const rest = appointment.money.balance.IQD;

  // Opens the payment page. The money only counts once the server confirms it (on the result page).
  async function payNow() {
    setPaying(true);
    try {
      goToPayment(await api.startPayment(appointment.id, { idempotency_key: key, return_url: paymentReturnUrl() }));
    } catch (err) {
      toast.error(errorText(err, t));
      setPaying(false);
    }
  }

  return (
    <Button variant="secondary" loading={paying} onClick={payNow}>
      {t("appointments.payRest", { amount: amountText(rest, "IQD", t) })}
    </Button>
  );
}

function AppointmentCard({ appointment: a, cancelHours, onChanged }: { appointment: MyAppointment; cancelHours: number; onChanged: () => void }) {
  const { t, locale } = useT();
  const [moving, setMoving] = useState(false);

  async function cancel() {
    try {
      await api.cancelAppointment(a.id);
      toast.success(t("appointments.cancelled"));
      onChanged();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{doctorName(a.doctor, locale)}</h2>
        <StatusBadge status={a.status} />
      </div>
      <p className="text-sm text-slate-600">
        {a.patient_name} · {t(`kind.${a.kind}`)}
      </p>
      <p className="text-sm">
        {longDate(a.date, locale)} · <span dir="ltr">{a.time}</span> · {t(`branch.${a.branch}`)}
      </p>

      {a.cancel_reason === "unpaid" && (
        <div className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          <p>{t("appointments.cancelledUnpaid")}</p>
          <Link href="/account" replace className="font-medium underline">
            {t("appointments.bookAgain")}
          </Link>
        </div>
      )}
      {a.cancel_reason === "doctor_absent" && (
        <div className="space-y-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          <p>{t("appointments.cancelledAbsent")}</p>
          <Link href="/account" replace className="font-medium underline">
            {t("appointments.bookAgain")}
          </Link>
        </div>
      )}
      {a.status !== "cancelled" && (
        <p className="text-sm text-slate-600">
          {t("appointments.paidOf")} <AmountsText amounts={a.money.paid} /> / <AmountsText amounts={a.money.total} />
        </p>
      )}
      {a.status === "booked" && a.pay_by && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status" data-pay-by>
          {t("appointments.payBy", { time: timeOf(a.pay_by, locale) })}
        </p>
      )}
      {a.status === "booked" && a.money.balance.IQD > 0 && <PayRest appointment={a} />}
      {a.late_minutes > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
          {t("appointments.late", { n: a.late_minutes })}
        </p>
      )}
      {a.ahead !== null && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2 text-lg font-bold text-brand-700">
          <TurnText appointment={a} />
          {a.ticket && (
            <span className="text-sm font-medium">
              {t("appointments.ticket")} <TicketBadge ticket={a.ticket} className="bg-white text-lg" />
            </span>
          )}
        </div>
      )}

      {a.status === "booked" && a.can_change && !moving && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setMoving(true)}>
            {t("appointments.change")}
          </Button>
          <Button variant="danger" onClick={cancel}>
            {t("appointments.cancel")}
          </Button>
        </div>
      )}
      {a.status === "booked" && !a.can_change && (
        <p className="text-xs text-slate-500">{t("appointments.tooLate", { n: cancelHours })}</p>
      )}
      {moving && (
        <ReschedulePanel
          appointment={a}
          onClose={() => setMoving(false)}
          onDone={() => {
            setMoving(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

// Follow-ups the doctor asked for, each with a button that opens booking already set to that doctor.
function FollowUps() {
  const { t, locale } = useT();
  const { state } = useLoad(api.myFollowUps);
  if (state.status !== "success" || state.data.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {state.data.map((f) => {
        const late = f.due < localToday();
        return (
          <Card key={f.visit_id} className="flex flex-wrap items-center justify-between gap-3 border-brand-200 bg-brand-50">
            <p className="text-sm">
              <span className="font-semibold">{t("followUp.cardTitle", { doctor: doctorName(f.doctor, locale) })}</span>
              <span className="block text-slate-600">
                {f.patient_name} · {late ? t("followUp.late", { date: longDate(f.due, locale) }) : t("followUp.by", { date: longDate(f.due, locale) })}
              </span>
            </p>
            <Link
              href={`/account?doctor=${f.doctor.id}&kind=followup&patient=${f.patient_id}`}
              replace
              className={buttonClass("primary", "", "default")}
              data-follow-up-book
            >
              {t("followUp.book")}
            </Link>
          </Card>
        );
      })}
    </div>
  );
}

export default function AppointmentsPage() {
  const { t } = useT();
  const { state, reload } = useLoad(() => Promise.all([api.myAppointments(), api.getSettings()]), "", { every: 4000, live: ["payment.settled", "notification.created", "appointment.*"] });

  return (
    <>
      <PageHeader title={t("appointments.title")} description={t("appointments.subtitle")} />
      <FollowUps />
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && state.data[0].length === 0 && (
        <div className="space-y-4 text-center">
          <EmptyState title={t("appointments.empty")} description={t("appointments.emptyHint")} />
          <Link href="/account" replace className={buttonClass("primary", "h-11 px-5", "default")}>
            {t("appointments.bookNow")}
          </Link>
        </div>
      )}
      {state.status === "success" && (
        <div className="space-y-3">
          {state.data[0].map((a) => (
            <AppointmentCard key={a.id} appointment={a} cancelHours={state.data[1].cancel_hours} onChanged={reload} />
          ))}
        </div>
      )}
    </>
  );
}
