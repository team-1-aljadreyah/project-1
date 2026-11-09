"use client";

import { useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { api, type MedicalAlerts, type Service, type StaffAppointment } from "@/lib/api";
import { allergyMatch } from "@/lib/allergies";
import { useSession } from "@/lib/auth";
import { dateTime, doctorName, fullDate } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { UpcomingBookings } from "@/components/upcoming-bookings";
import { visitSchema, type VisitForm } from "@/lib/validation";
import { Button, Card, EmptyState, ErrorState, Field, Input, LoadError, MedicineList, PageHeader, Select, StatusBadge, Textarea, TicketBadge } from "@/components/common";
import { ResultView, serviceName } from "@/components/result-view";
import { PrintButton, PrintSection } from "@/components/print";
import { AlertsBanner, AlertsEditor } from "@/components/medical-alerts";
import { MedicineInput } from "@/components/medicine-input";
import { CardsSkeleton } from "@/components/skeleton";
import { VitalsEntry, VitalsHistory, VitalsSummary } from "@/components/vitals";

function History({ patientId, patientName, alerts }: { patientId: number; patientName: string; alerts: MedicalAlerts | null }) {
  const { t, locale } = useT();
  const { state, reload } = useLoad(() => api.patientHistory(patientId), String(patientId));

  if (state.status === "loading") return <CardsSkeleton count={1} />;
  if (state.status === "error") return <LoadError error={state.error} onRetry={reload} />;
  if (state.data.length === 0) return <p className="text-sm text-slate-500">{t("doctor.noHistory")}</p>;
  const visits = state.data;
  return (
    <div className="space-y-2">
      {/* The doctor's private notes stay out of the printout: paper leaves the clinic. */}
      <PrintButton title={t("print.medicalFile")} subject={patientName}>
        {() => (
          <PrintSection title={t("doctor.history")}>
            {alerts && <AlertsBanner alerts={alerts} quiet />}
            {visits.map((v) => (
              <div key={v.id} className="print-keep space-y-1 border-b border-[#e2e8f0] pb-2">
                <p className="font-semibold">
                  {dateTime(v.created_at, locale)} · {doctorName(v.doctor, locale)}
                </p>
                <p>
                  {t("visit.diagnosis")}: {v.diagnosis}
                </p>
                {v.medicines.length > 0 ? <MedicineList medicines={v.medicines} /> : <p>{t("visit.noMedicines")}</p>}
                {v.tests.map((test) => (
                  <div key={test.id} className="space-y-1">
                    <p className="font-medium">{serviceName(test.test, locale)}</p>
                    {test.result ? <ResultView result={test.result} /> : <p>{t(`lab.status.${test.status}`)}</p>}
                  </div>
                ))}
              </div>
            ))}
          </PrintSection>
        )}
      </PrintButton>
      {state.data.map((v) => (
        <div key={v.id} className="rounded-lg bg-brand-50 p-3 text-sm">
          <p>
            {t("visit.diagnosis")}: {v.diagnosis}
          </p>
          {v.internal_note && <p className="text-slate-600">{v.internal_note}</p>}
          {v.follow_up_on && <p className="text-brand-700">{t("followUp.asked", { date: fullDate(v.follow_up_on) })}</p>}
          {v.tests.map((test) => (
            <div key={test.id} className="mt-2 border-t border-brand-100 pt-2">
              <p className="font-medium">
                {serviceName(test.test, locale)} · <span className="text-slate-500">{t(`lab.status.${test.status}`)}</span>
              </p>
              {test.result && <ResultView result={test.result} />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function VisitForm({ appointment, services, onDone }: { appointment: StaffAppointment; services: Service[]; onDone: () => void }) {
  const { t, locale } = useT();
  // The lab handles tests and X-rays. Procedures are done in the room and only go on the bill.
  const orderable = services.filter((s) => s.kind === "test" || s.kind === "xray");
  const procedures = services.filter((s) => s.kind === "procedure");
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<VisitForm>({
    resolver: zodResolver(visitSchema),
    defaultValues: { diagnosis: "", internal_note: "", medicines: [], test_ids: [], procedure_ids: [], follow_up_days: "" },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "medicines" });
  const alerts = useLoad(() => api.patientAlerts(appointment.patient_id), String(appointment.patient_id));
  // This visit's measurements (if taken) and the earlier ones, for comparing.
  const vitals = useLoad(() => api.patientVitals(appointment.patient_id), String(appointment.patient_id));
  const [editingVitals, setEditingVitals] = useState(false);
  const vitalRecords = vitals.state.status === "success" ? vitals.state.data : [];
  const current = vitalRecords.find((r) => r.appointment_id === appointment.id) ?? null;
  const earlier = vitalRecords.filter((r) => r.appointment_id !== appointment.id);
  // The pharmacy's medicines for the name search. If it fails to load, names are simply typed by hand.
  const catalogLoad = useLoad(api.medicineCatalog);
  const catalog = catalogLoad.state.status === "success" ? catalogLoad.state.data : [];
  const [editingAlerts, setEditingAlerts] = useState(false);
  // The doctor ticks this to prescribe something the patient is allergic to, on purpose.
  const [allergyOk, setAllergyOk] = useState(false);
  const medicines = useWatch({ control, name: "medicines" });
  const allergies = alerts.state.status === "success" ? alerts.state.data.allergies : [];
  const conflicts = (medicines ?? []).map((m) => (m?.name ? allergyMatch(m.name, allergies) : null));
  const anyConflict = conflicts.some(Boolean);

  async function onSubmit(values: VisitForm) {
    if (anyConflict && !allergyOk) {
      toast.error(t("alerts.mustConfirm"));
      return;
    }
    try {
      const { next_ticket } = await api.finishVisit(appointment.id, {
        ...values,
        test_ids: values.test_ids.map(Number),
        procedure_ids: values.procedure_ids.map(Number),
        follow_up_days: values.follow_up_days ? Number(values.follow_up_days) : null,
      });
      // Finishing also calls the next patient in, so the doctor sees who comes next.
      toast.success(next_ticket ? t("doctor.finishedNext", { ticket: next_ticket }) : t("doctor.finished"));
      onDone();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <TicketBadge ticket={appointment.ticket} />
            {appointment.patient_name}
          </h2>
          <StatusBadge status={appointment.status} />
        </div>

        <div className="space-y-2" data-alerts-section>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t("alerts.title")}</h3>
            {alerts.state.status === "success" && !editingAlerts && (
              <Button type="button" variant="ghost" onClick={() => setEditingAlerts(true)}>
                {t("alerts.edit")}
              </Button>
            )}
          </div>
          {alerts.state.status === "loading" && <CardsSkeleton count={1} />}
          {alerts.state.status === "error" && <ErrorState message={errorText(alerts.state.error, t)} onRetry={alerts.reload} />}
          {alerts.state.status === "success" &&
            (editingAlerts ? (
              <AlertsEditor
                patientId={appointment.patient_id}
                alerts={alerts.state.data}
                onCancel={() => setEditingAlerts(false)}
                onSaved={(saved) => {
                  alerts.setData(() => saved);
                  setEditingAlerts(false);
                }}
              />
            ) : (
              <AlertsBanner alerts={alerts.state.data} />
            ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t("vitals.title")}</h3>
            {vitals.state.status === "success" && !editingVitals && (
              <Button type="button" variant="ghost" onClick={() => setEditingVitals(true)}>
                {current ? t("vitals.edit") : t("vitals.enter")}
              </Button>
            )}
          </div>
          {vitals.state.status === "loading" && <CardsSkeleton count={1} />}
          {vitals.state.status === "error" && <ErrorState message={errorText(vitals.state.error, t)} onRetry={vitals.reload} />}
          {editingVitals ? (
            <VitalsEntry
              appointmentId={appointment.id}
              current={current}
              onCancel={() => setEditingVitals(false)}
              onSaved={(saved) => {
                vitals.setData((list) => [saved, ...list.filter((r) => r.appointment_id !== saved.appointment_id)]);
                setEditingVitals(false);
              }}
            />
          ) : (
            vitals.state.status === "success" && (current ? <VitalsSummary vitals={current} /> : <p className="text-sm text-slate-500">{t("vitals.notYet")}</p>)
          )}
          {earlier.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-slate-500">{t("vitals.earlier", { n: earlier.length })}</summary>
              <div className="mt-2">
                <VitalsHistory records={earlier} />
              </div>
            </details>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium">{t("doctor.history")}</h3>
          <History
            patientId={appointment.patient_id}
            patientName={appointment.patient_name}
            alerts={alerts.state.status === "success" ? alerts.state.data : null}
          />
        </div>

        <Field label={t("visit.diagnosis")} error={errors.diagnosis?.message}>
          <Textarea aria-invalid={!!errors.diagnosis || undefined} {...register("diagnosis")} />
        </Field>
        <Field label={t("doctor.internalNote")}>
          <Textarea {...register("internal_note")} />
        </Field>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">{t("visit.prescription")}</h3>
          {fields.map((field, index) => {
            const rowErrors = errors.medicines?.[index];
            return (
              <div key={field.id} className="grid items-start gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_1fr_6rem_auto]">
                <Field label={t("doctor.medicine")} error={rowErrors?.name?.message}>
                  <Controller
                    control={control}
                    name={`medicines.${index}.name`}
                    render={({ field }) => (
                      <MedicineInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        inputRef={field.ref}
                        catalog={catalog}
                        invalid={!!rowErrors?.name}
                      />
                    )}
                  />
                </Field>
                <Field label={t("doctor.dose")} error={rowErrors?.dose?.message}>
                  <Input dir="ltr" invalid={!!rowErrors?.dose} {...register(`medicines.${index}.dose`)} />
                </Field>
                <Field label={t("doctor.days")} error={rowErrors?.days?.message}>
                  <Input type="number" min={1} invalid={!!rowErrors?.days} {...register(`medicines.${index}.days`, { valueAsNumber: true })} />
                </Field>
                {conflicts[index] && (
                  <p className="text-sm font-medium text-red-700 sm:col-span-4" role="alert" data-allergy-conflict>
                    {t("alerts.conflict", { allergy: conflicts[index]! })}
                  </p>
                )}
                <Button type="button" variant="danger" className="sm:mt-7" onClick={() => remove(index)}>
                  {t("doctor.removeMedicine")}
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="secondary" onClick={() => append({ name: "", dose: "", days: 1 })}>
            {t("doctor.addMedicine")}
          </Button>
          {anyConflict && (
            <label className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              <input type="checkbox" className="mt-0.5 size-4 accent-red-600" checked={allergyOk} onChange={(e) => setAllergyOk(e.target.checked)} />
              {t("alerts.confirmConflict")}
            </label>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("doctor.tests")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {orderable.map((s) => (
              <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                <input type="checkbox" value={s.id} className="size-4 accent-brand-600" {...register("test_ids")} />
                {serviceName(s, locale)}
              </label>
            ))}
          </div>
        </fieldset>

        {procedures.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("doctor.procedures")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {procedures.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm">
                  <input type="checkbox" value={s.id} className="size-4 accent-brand-600" {...register("procedure_ids")} />
                  {serviceName(s, locale)}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="w-56">
          <Field label={t("followUp.label")} hint={t("followUp.hint")}>
            <Select {...register("follow_up_days")}>
              <option value="">{t("followUp.none")}</option>
              {(["3", "7", "14", "30"] as const).map((n) => (
                <option key={n} value={n}>
                  {t(`followUp.d${n}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Button type="submit" className="h-11 w-full" loading={isSubmitting}>
          {t("doctor.finish")}
        </Button>
      </form>
    </Card>
  );
}

export default function DoctorPage() {
  const { t } = useT();
  const { session } = useSession();
  const doctorId = session?.user.doctor_id ?? 0;
  const { state, reload } = useLoad(() => api.doctorQueue(doctorId), String(doctorId), { every: 4000, live: ["appointment.*", "visit.*", "lab.result_confirmed"] });
  const services = useLoad(api.listServices);

  async function callNext(id: number) {
    try {
      await api.startVisit(id);
      reload();
    } catch (err) {
      toast.error(errorText(err, t));
    }
  }

  const current = state.status === "success" ? state.data.find((a) => a.status === "in_progress") : undefined;
  const waiting = state.status === "success" ? state.data.filter((a) => a.status === "arrived") : [];

  return (
    <>
      <PageHeader title={t("doctor.title")} description={t("doctor.subtitle")} />
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {current ? (
              <VisitForm key={current.id} appointment={current} services={services.state.status === "success" ? services.state.data : []} onDone={reload} />
            ) : (
              <EmptyState title={t("doctor.noCurrent")} description={t("doctor.noCurrentHint")} />
            )}
          </div>
          {/* The waiting list and the upcoming bookings share one column, so the second sits right under the first
              (in the grid it would start below the tall visit form). */}
          <div className="space-y-4">
            <Card className="space-y-3">
              <h2 className="font-semibold">{t("queue.title")}</h2>
              {waiting.length === 0 && <p className="text-sm text-slate-500">{t("queue.empty")}</p>}
              <ol className="space-y-2">
                {waiting.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <TicketBadge ticket={a.ticket} />
                      {a.patient_name}
                    </span>
                    {a.emergency && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">{t("queue.emergency")}</span>
                    )}
                  </li>
                ))}
              </ol>
              {!current && waiting.length > 0 && (
                <Button className="w-full" onClick={() => callNext(waiting[0].id)}>
                  {t("doctor.callNext")}
                </Button>
              )}
            </Card>
            <UpcomingBookings doctorId={doctorId} includeToday />
          </div>
        </div>
      )}
    </>
  );
}
