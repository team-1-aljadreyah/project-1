"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { api, type PatientFile, type PatientSummary } from "@/lib/api";
import { dateTime, shortDate, yearDate } from "@/lib/display";
import { errorText, useT, type MessageKey } from "@/lib/i18n";
import { usePaged } from "@/lib/paging";
import { useLoad } from "@/lib/useLoad";
import { localToday } from "@/lib/validation";
import { Button, Card, EmptyState, ErrorState, Input, LoadError, MedicineList, PageHeader, Pager, StatusBadge } from "@/components/common";
import { AmountsText, amountText } from "@/components/money";
import { ResultView, serviceName } from "@/components/result-view";
import { PrintButton, PrintSection } from "@/components/print";
import { AlertsBanner } from "@/components/medical-alerts";
import { CardsSkeleton } from "@/components/skeleton";
import { PaymentLog } from "@/components/payment-log";

const TABS = ["visits", "appointments", "tests", "payments"] as const;
type Tab = (typeof TABS)[number];
// Reception books and takes money, so it sees appointments and payments only. Diagnoses, medicines,
// tests and medical alerts are for the doctor and the manager (the server also leaves them out for reception).
const BASIC_TABS: Tab[] = ["appointments", "payments"];

// ---------- the search list ----------

function PatientRow({ patient, onOpen }: { patient: PatientSummary; onOpen: () => void }) {
  const { t } = useT();
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        data-patient={patient.id}
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-3 text-start hover:bg-slate-100"
      >
        <span>
          <span className="block font-medium">{patient.name}</span>
          <span className="block text-sm text-slate-500" dir="ltr">
            {patient.phone}
          </span>
        </span>
        <span className="text-sm text-slate-500">
          {patient.last_visit ? t("patients.lastVisit", { d: shortDate(patient.last_visit) }) : t("patients.never")}
          {" · "}
          {t("patients.visitsCount", { n: patient.visits })}
        </span>
      </button>
    </li>
  );
}

function PatientSearch({ onOpen }: { onOpen: (id: number) => void }) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  // Waits until typing stops for a moment, so every letter doesn't send a request.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const patients = usePaged((q) => api.searchPatients(search, q), search);
  const { state, reload, items } = patients;

  return (
    <Card className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-slate-400" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("patients.search")}
          aria-label={t("patients.search")}
          className="h-11 ps-9"
        />
      </div>
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && items.length === 0 && <EmptyState title={t("patients.empty")} />}
      {state.status === "success" && (
        <ul className="divide-y divide-slate-200">
          {items.map((p) => (
            <PatientRow key={p.id} patient={p} onOpen={() => onOpen(p.id)} />
          ))}
        </ul>
      )}
      <Pager page={patients.page} pageSize={patients.pageSize} total={patients.total} loading={patients.loadingPage} onPage={patients.setPage} />
    </Card>
  );
}

// ---------- one patient's file ----------

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{children}</p>
    </Card>
  );
}

function VisitsTab({ file }: { file: PatientFile }) {
  const { t, locale } = useT();
  if (file.visits.length === 0) return <EmptyState title={t("patients.noVisits")} />;
  return (
    <ul className="space-y-3">
      {file.visits.map((v) => (
        <li key={v.id}>
          <Card className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
              <span>
                {dateTime(v.created_at, locale)} · {v.doctor_name}
              </span>
              {v.medicines.length > 0 && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.dispensed ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
                  {v.dispensed ? t("pharmacy.dispensed") : t("patients.notDispensed")}
                </span>
              )}
            </div>
            <p>
              <span className="font-semibold">{t("visit.diagnosis")}: </span>
              {v.diagnosis}
            </p>
            {v.medicines.length > 0 ? <MedicineList medicines={v.medicines} /> : <p className="text-sm text-slate-500">{t("visit.noMedicines")}</p>}
            {v.tests.length > 0 && (
              <p className="text-sm text-slate-500">{v.tests.map((test) => serviceName(test.test, locale)).join("، ")}</p>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function AppointmentsTab({ file }: { file: PatientFile }) {
  const { t } = useT();
  if (file.appointments.length === 0) return <EmptyState title={t("patients.noAppointments")} />;
  return (
    <Card className="divide-y divide-slate-200 p-0">
      {file.appointments.map((a) => (
        <div key={a.id} data-appointment={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
          <div className="space-y-0.5">
            <p className="font-medium">
              {shortDate(a.date)} · <span dir="ltr">{a.time || t("patients.walkIn")}</span> · {a.doctor_name}
            </p>
            <p className="text-slate-500">
              {t(`kind.${a.kind}`)} · {t(`branch.${a.branch}`)}
              {a.emergency && ` · ${t("queue.emergency")}`}
              {a.cancel_reason === "doctor_absent" && ` · ${t("book.absent")}`}
              {a.cancel_reason === "unpaid" && ` · ${t("appointments.unpaidShort")}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-slate-500">
              <AmountsText amounts={a.money.total} />
            </span>
            <StatusBadge status={a.status} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function TestsTab({ file }: { file: PatientFile }) {
  const { t, locale } = useT();
  const tests = file.visits.flatMap((v) => v.tests.map((test) => ({ ...test, at: v.created_at, doctor: v.doctor_name })));
  if (tests.length === 0) return <EmptyState title={t("patients.noTests")} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tests.map((test) => (
        <Card key={test.id} className="space-y-1">
          <p className="font-semibold">{serviceName(test.test, locale)}</p>
          <p className="text-sm text-slate-500">
            {dateTime(test.at, locale)} · {test.doctor}
          </p>
          {test.result ? <ResultView result={test.result} /> : <p className="text-sm text-amber-700">{t(`lab.status.${test.status}`)}</p>}
        </Card>
      ))}
    </div>
  );
}

function PaymentsTab({ file }: { file: PatientFile }) {
  const { t } = useT();
  if (file.payment_log.length === 0) return <EmptyState title={t("patients.noPayments")} />;
  return (
    <Card className="p-0">
      <PaymentLog entries={file.payment_log} />
    </Card>
  );
}

// The full file on paper: who the patient is, the totals, then every visit, appointment and payment.
function PrintedPatientFile({ file, medical }: { file: PatientFile; medical: boolean }) {
  const { t, locale } = useT();
  const p = file.patient;
  return (
    <>
      <PrintSection title={t("print.patientInfo")}>
        <p>
          {p.name} · <span dir="ltr">{p.phone}</span>
        </p>
        {medical && <AlertsBanner alerts={file.alerts} />}
        <p>
          {t("patients.stat.appointments")}: {p.appointments} · {t("patients.stat.visits")}: {p.visits} · {t("patients.stat.noShows")}: {p.no_shows}
        </p>
        <p>
          {t("patients.stat.paid")}: <AmountsText amounts={file.money.paid} /> · {t("patients.stat.balance")}: <AmountsText amounts={file.money.balance} />
        </p>
      </PrintSection>
      {medical && (
        <PrintSection title={t("patients.tab.visits")}>
          {file.visits.length === 0 && <p>{t("patients.noVisits")}</p>}
          {file.visits.map((v) => (
            <div key={v.id} className="print-keep space-y-1 border-b border-[#e2e8f0] pb-2">
              <p className="font-semibold">
                {dateTime(v.created_at, locale)} · {v.doctor_name}
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
      <PrintSection title={t("patients.tab.appointments")}>
        <table className="w-full text-sm">
          <tbody>
            {file.appointments.map((a) => (
              <tr key={a.id} className="border-b border-[#e2e8f0]">
                <td className="py-1">
                  {shortDate(a.date)} <span dir="ltr">{a.time || t("patients.walkIn")}</span>
                </td>
                <td className="py-1">{a.doctor_name}</td>
                <td className="py-1">{t(`status.${a.status}`)}</td>
                <td className="py-1 text-end">
                  <AmountsText amounts={a.money.total} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
      <PrintSection title={t("patients.tab.payments")}>
        <table className="w-full text-sm">
          <tbody>
            {/* On paper only money that moved, with its receipt number and visit. */}
            {file.payment_log
              .filter((pay) => pay.kind !== "attempt")
              .map((pay) => (
                <tr key={pay.id} className="border-b border-[#e2e8f0]">
                  <td className="py-1">{dateTime(pay.at, locale)}</td>
                  <td className="py-1">
                    {t(`paylog.${pay.kind as "payment" | "refund" | "reversal"}.${pay.method}`)} · {pay.doctor_name}
                    {pay.receipt_no !== null && ` · ${t("paylog.receipt", { n: pay.receipt_no })}`}
                  </td>
                  <td className="py-1 text-end" dir="auto">
                    {pay.kind === "payment" ? "" : "−"}
                    {amountText(pay.amount, pay.currency, t)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </PrintSection>
    </>
  );
}

function PatientFileView({ patientId, medical, onBack }: { patientId: number; medical: boolean; onBack: () => void }) {
  const { t, locale } = useT();
  const { state, reload } = useLoad(() => api.patientFile(patientId), String(patientId));
  const tabs = medical ? TABS : BASIC_TABS;
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}>
        <Back className="size-4" aria-hidden />
        {t("patients.back")}
      </Button>
      {state.status === "loading" && <CardsSkeleton count={4} />}
      {state.status === "error" && <LoadError error={state.error} onRetry={reload} />}
      {state.status === "success" && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold" data-file-name>
                {state.data.patient.name}
              </h2>
              <p className="text-sm text-slate-500" dir="ltr">
                {state.data.patient.phone}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
            <PrintButton title={t(medical ? "print.medicalFile" : "print.patientRecord")} subject={state.data.patient.name}>
              {() => state.status === "success" && <PrintedPatientFile file={state.data} medical={medical} />}
            </PrintButton>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              {state.data.patient.has_account
                ? t("patients.account")
                : state.data.patient.relation
                  ? t("patients.onFamily", { r: t(`relation.${state.data.patient.relation}` as MessageKey) })
                  : t("patients.noAccount")}
            </span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label={t("patients.stat.appointments")}>{state.data.patient.appointments}</Stat>
            <Stat label={t("patients.stat.visits")}>{state.data.patient.visits}</Stat>
            <Stat label={t("patients.stat.noShows")}>{state.data.patient.no_shows}</Stat>
            <Stat label={t("patients.stat.paid")}>
              <AmountsText amounts={state.data.money.paid} />
            </Stat>
            <Stat label={t("patients.stat.balance")}>
              <AmountsText amounts={state.data.money.balance} />
            </Stat>
          </div>

          {medical && <AlertsBanner alerts={state.data.alerts} quiet />}

          {state.data.welfare && (
            <p
              className={`rounded-lg px-3 py-2 text-sm ${
                state.data.welfare.status === "approved" && state.data.welfare.valid_until! >= localToday()
                  ? "bg-emerald-50 text-emerald-800"
                  : state.data.welfare.status === "pending"
                    ? "bg-amber-50 text-amber-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {state.data.welfare.status === "approved" && state.data.welfare.valid_until! >= localToday()
                ? t("welfare.file.approved", { date: yearDate(state.data.welfare.valid_until!, locale) })
                : state.data.welfare.status === "pending"
                  ? t("welfare.file.pending")
                  : state.data.welfare.status === "rejected"
                    ? t("welfare.file.rejected")
                    : t("welfare.file.expired")}
            </p>
          )}

          {state.data.family.length > 0 && (
            <p className="text-sm text-slate-600">
              {t("patients.family")}:{" "}
              {state.data.family.map((f) => `${f.name} (${t(`relation.${f.relation}`)})`).join("، ")}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {tabs.map((item) => (
              <Button key={item} variant={item === tab ? "primary" : "secondary"} onClick={() => setTab(item)}>
                {t(`patients.tab.${item}`)}
              </Button>
            ))}
          </div>
          {tab === "visits" && <VisitsTab file={state.data} />}
          {tab === "appointments" && <AppointmentsTab file={state.data} />}
          {tab === "tests" && <TestsTab file={state.data} />}
          {tab === "payments" && <PaymentsTab file={state.data} />}
          <p className="text-xs text-slate-500">{t(medical ? "patients.privateNote" : "patients.receptionNote")}</p>
        </>
      )}
    </div>
  );
}

function PatientHistory({ startId, medical }: { startId: number | null; medical: boolean }) {
  const { t } = useT();
  const [openId, setOpenId] = useState<number | null>(startId);

  return (
    <>
      <PageHeader title={t("patients.title")} description={t("patients.subtitle")} />
      {openId === null ? <PatientSearch onOpen={setOpenId} /> : <PatientFileView patientId={openId} medical={medical} onBack={() => setOpenId(null)} />}
    </>
  );
}

// Reads ?patient=ID. The key makes a new search result start fresh even when this page is already open.
function FromAddress({ medical }: { medical: boolean }) {
  const params = useSearchParams();
  const id = Number(params.get("patient")) || null;
  return <PatientHistory key={id ?? "list"} startId={id} medical={medical} />;
}

// Used by both reception and the manager: search, then open one patient.
// medical={false} (reception) leaves out everything medical. useSearchParams needs a Suspense boundary in a static export.
export function PatientHistoryPage({ medical = true }: { medical?: boolean }) {
  return (
    <Suspense fallback={<CardsSkeleton count={2} />}>
      <FromAddress medical={medical} />
    </Suspense>
  );
}
