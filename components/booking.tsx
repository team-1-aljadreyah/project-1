"use client";

import { api, type VisitKind } from "@/lib/api";
import { shortDate, weekdayName } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { cn } from "@/lib/utils";
import { Button, EmptyState, ErrorState } from "@/components/common";
import { Skeleton } from "@/components/skeleton";

// Shared by booking and rescheduling.

// New visit or follow-up. Only the name of each kind: how long a visit takes is the clinic's business,
// and the free times shown below already follow it.
const KINDS: VisitKind[] = ["new", "followup"];

export function KindPicker({ value, onChange }: { value: VisitKind; onChange: (kind: VisitKind) => void }) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 gap-2">
      {KINDS.map((kind) => (
        <Button key={kind} type="button" className="h-auto py-3" variant={kind === value ? "primary" : "secondary"} onClick={() => onChange(kind)}>
          {t(`kind.${kind}`)}
        </Button>
      ))}
    </div>
  );
}

export function DayPicker({ doctorId, value, onChange }: { doctorId: number; value: string; onChange: (date: string) => void }) {
  const { t, locale } = useT();
  const { state, reload } = useLoad(() => api.doctorDays(doctorId), String(doctorId));

  if (state.status === "loading") return <Skeleton className="h-20 w-full" />;
  if (state.status === "error") return <ErrorState message={errorText(state.error, t)} onRetry={reload} />;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-thin px-1 pb-2">
      {state.data.map((day, index) => {
        const off = !day.work || day.absent;
        const selected = day.date === value;
        const name = index === 0 ? t("day.today") : index === 1 ? t("day.tomorrow") : weekdayName(day.date, locale);
        return (
          <button
            key={day.date}
            type="button"
            disabled={off}
            aria-pressed={selected}
            data-date={day.date}
            onClick={() => onChange(day.date)}
            className={cn(
              "w-24 shrink-0 rounded-lg border p-2 text-center text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              selected ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 bg-white hover:bg-slate-50",
            )}
          >
            <span className="block font-semibold">{name}</span>
            <span className="block" dir="ltr">
              {shortDate(day.date)}
            </span>
            <span className="block text-xs text-slate-500">
              {day.absent ? t("book.absent") : day.work ? `${t(`branch.${day.work.branch}`)} · ${t(`shift.${day.work.shift}`)}` : t("book.dayOff")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SlotPicker({
  doctorId,
  date,
  kind,
  value,
  onPick,
}: {
  doctorId: number;
  date: string;
  kind: VisitKind;
  value: string;
  onPick: (time: string) => void;
}) {
  const { t } = useT();
  const { state, reload } = useLoad(() => api.doctorSlots(doctorId, date, kind), `${doctorId}|${date}|${kind}`, { every: 4000, live: ["appointment.*"] });

  if (!date) return <p className="text-sm text-slate-500">{t("book.pickDay")}</p>;
  if (state.status === "loading") return <Skeleton className="h-24 w-full" />;
  if (state.status === "error") return <ErrorState message={errorText(state.error, t)} onRetry={reload} />;
  if (!state.data.some((s) => s.available)) return <EmptyState title={t("book.noSlots")} />;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {state.data.map((slot) => (
        <Button
          key={slot.time}
          type="button"
          dir="ltr"
          className="h-11"
          variant={slot.time === value ? "primary" : "secondary"}
          disabled={!slot.available}
          onClick={() => onPick(slot.time)}
        >
          {slot.time}
        </Button>
      ))}
    </div>
  );
}
