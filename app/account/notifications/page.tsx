"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { messageText } from "@/lib/notifications";
import { useLoad } from "@/lib/useLoad";
import { Card, EmptyState, ErrorState, PageHeader } from "@/components/common";
import { CardsSkeleton } from "@/components/skeleton";

export default function NotificationsPage() {
  const { t, locale } = useT();
  const { state, reload } = useLoad(api.myNotifications, "", { every: 15000, live: ["notification.created"] });

  // Opening this page marks every message as read.
  useEffect(() => {
    void api.readNotifications();
  }, []);

  return (
    <>
      <PageHeader title={t("notifications.title")} description={t("notifications.subtitle")} />
      {state.status === "loading" && <CardsSkeleton count={2} />}
      {state.status === "error" && <ErrorState message={errorText(state.error, t)} onRetry={reload} />}
      {state.status === "success" && state.data.length === 0 && <EmptyState title={t("notifications.empty")} />}
      {state.status === "success" && (
        <div className="space-y-2">
          {state.data.map((n) => (
            <Card key={n.id} className={n.read ? "p-4" : "border-brand-300 bg-brand-50 p-4"}>
              <p className="text-sm">{messageText(n, t, locale)}</p>
              <time className="text-xs text-slate-500">{dateTime(n.at, locale)}</time>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
