"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { errorText, useT, type MessageKey } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { AnalyticsSection } from "@/components/analytics";
import { AuditList } from "@/components/audit-list";
import { Card, EmptyState, ErrorState, PageHeader } from "@/components/common";
import { CardsSkeleton } from "@/components/skeleton";

const STATS = [
  { key: "appointments_today", label: "manager.appointmentsToday" },
  { key: "waiting_now", label: "manager.waitingNow" },
  { key: "visits_done_today", label: "manager.visitsDone" },
  { key: "doctors", label: "manager.doctors" },
  { key: "staff", label: "manager.staff" },
] as const satisfies readonly { key: string; label: MessageKey }[];

export default function ManagerPage() {
  const { t } = useT();
  const overview = useLoad(api.managerOverview, "", { every: 10000, live: ["appointment.*", "visit.*", "payment.settled"] });
  const audit = useLoad(() => api.listAudit({ limit: 5 }));

  return (
    <>
      <PageHeader title={t("manager.title")} description={t("manager.subtitle")} />
      {overview.state.status === "loading" && <CardsSkeleton count={4} />}
      {overview.state.status === "error" && <ErrorState message={errorText(overview.state.error, t)} onRetry={overview.reload} />}
      {overview.state.status === "success" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {STATS.map(({ key, label }) => (
            <Card key={key} className="p-4">
              <p className="text-sm text-slate-500">{t(label)}</p>
              <p className="mt-1 text-3xl font-bold" data-stat={key}>
                {overview.state.status === "success" && overview.state.data[key]}
              </p>
            </Card>
          ))}
        </div>
      )}

      <AnalyticsSection />

      <Card className="mt-8 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">{t("manager.recent")}</h2>
          <Link href="/manager/audit" className="text-sm font-medium text-brand-600 hover:underline">
            {t("manager.seeAll")}
          </Link>
        </div>
        {audit.state.status === "loading" && <CardsSkeleton count={1} />}
        {audit.state.status === "error" && <ErrorState message={errorText(audit.state.error, t)} onRetry={audit.reload} />}
        {audit.state.status === "success" && audit.state.data.items.length === 0 && <EmptyState title={t("audit.empty")} />}
        {audit.state.status === "success" && <AuditList entries={audit.state.data.items} />}
      </Card>
    </>
  );
}
