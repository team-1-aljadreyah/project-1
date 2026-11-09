"use client";

import type { ButtonHTMLAttributes, ComponentProps, ReactNode, TextareaHTMLAttributes } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppointmentStatus, DoseInstructions, Medicine } from "@/lib/api/types";
import { STATUS_COLOR } from "@/lib/display";
import { errorText, useT, type MessageKey } from "@/lib/i18n";
import { ApiError } from "@/lib/api/errors";
import { useSession } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button as UIButton, buttonVariants } from "@/components/ui/button";
import { Card as UICard } from "@/components/ui/card";
import { Input as UIInput } from "@/components/ui/input";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <UICard className={cn("block gap-0 p-6 shadow-sm", className)}>{children}</UICard>;
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT = { primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive" } as const;

export function buttonClass(variant: ButtonVariant = "secondary", className = "", size: "sm" | "default" = "sm") {
  return cn(buttonVariants({ variant: VARIANT[variant], size }), className);
}

export function Button({
  variant = "primary",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <UIButton {...props} variant={VARIANT[variant]} disabled={disabled || loading} className={className}>
      {loading && (
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </UIButton>
  );
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="block text-sm font-medium text-foreground">{label}</span>
      {children}
      <FieldError error={error} fallback={hint} />
    </label>
  );
}

export function FieldError({ error, fallback }: { error?: string; fallback?: string }) {
  const { t } = useT();
  if (error) return <span className="block text-xs text-destructive">{t(error as MessageKey)}</span>;
  if (fallback) return <span className="block text-xs text-muted-foreground">{fallback}</span>;
  return null;
}

// ComponentProps<"input"> includes `ref`: React 19 passes it like any other prop, so forms can focus the box.
export function Input({ invalid, className = "", ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <UIInput {...props} aria-invalid={invalid || undefined} className={className} />;
}

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-base outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30",
        className,
      )}
    />
  );
}

export { Select } from "@/components/select";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center" role="alert">
      <p className="font-medium text-red-800">{t("common.loadFailed")}</p>
      <p className="mt-1.5 text-sm text-red-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

// Something that failed to load. When the server says "not allowed" (403), trying again can't help,
// so a calm note shows instead of the red box with its Retry button.
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT();
  const { session } = useSession();
  if (error instanceof ApiError && error.status === 403) {
    const hint = session?.user.role === "doctor" ? "patients.noAccessDoctor" : "patients.noAccessHint";
    return <EmptyState title={t("patients.noAccess")} description={t(hint)} />;
  }
  return <ErrorState message={errorText(error, t)} onRetry={onRetry} />;
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const { t } = useT();
  return (
    <Badge variant="secondary" className={cn("h-auto border-transparent", STATUS_COLOR[status])}>
      {t(`status.${status}`)}
    </Badge>
  );
}

// The patient's queue number, like "A-012". Left to right so the letter stays first in Arabic too.
export function TicketBadge({ ticket, className = "" }: { ticket: string | null; className?: string }) {
  if (!ticket) return null;
  return (
    <span dir="ltr" className={cn("inline-block rounded-md bg-brand-50 px-2 py-0.5 font-mono font-bold text-brand-700", className)}>
      {ticket}
    </span>
  );
}

// "مرتين يومياً · بعد الأكل": how often, and when.
export function doseText(instructions: DoseInstructions, t: (key: MessageKey) => string) {
  const parts = [t(`dose.times.${instructions.times_per_day}` as MessageKey)];
  if (instructions.timing !== "any") parts.push(t(`dose.timing.${instructions.timing}`));
  return parts.join(" · ");
}

// Each medicine with the doctor's dose and days. After dispensing, the pharmacist's instructions show under it.
export function MedicineList({ medicines }: { medicines: Medicine[] }) {
  const { t } = useT();
  return (
    <ul className="space-y-2 text-sm">
      {medicines.map((m, index) => (
        <li key={index} className="space-y-0.5">
          <p>{t("visit.medicineLine", { name: m.name, dose: m.dose, days: m.days })}</p>
          {m.instructions && (
            <p data-dose className="font-semibold text-brand-700">
              {doseText(m.instructions, t)}
            </p>
          )}
          {m.instructions?.note && <p className="text-slate-600">{m.instructions.note}</p>}
        </li>
      ))}
    </ul>
  );
}

// Under a list shown in parts: how many are shown, and a button for the next part.
// Which page buttons to show: the first, the last, and the pages next to the open one. A jump is "…".
// Example: page 6 of 20 → 1 … 5 6 7 … 20.
function pageNumbers(page: number, pages: number): (number | "gap")[] {
  const keep = [...new Set([1, page - 1, page, page + 1, pages])].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  for (const n of keep) {
    const last = out[out.length - 1];
    // A jump over one page shows that page instead of "…".
    if (typeof last === "number" && n - last === 2) out.push(last + 1);
    else if (typeof last === "number" && n - last > 2) out.push("gap");
    out.push(n);
  }
  return out;
}

// Numbered pages under a long list. In Arabic page 1 sits on the right, like the text.
export function Pager({
  page,
  pageSize,
  total,
  loading = false,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPage: (page: number) => void;
}) {
  const { t } = useT();
  if (total === 0) return null;
  const pages = Math.ceil(total / pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  // After changing page, bring the top of the list back into view.
  const go = (n: number, el: HTMLElement) => {
    onPage(n);
    el.closest("[data-pager]")?.parentElement?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const box = "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium";

  return (
    <nav
      aria-label={t("paging.label")}
      aria-busy={loading || undefined}
      className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm text-slate-500"
      data-pager
    >
      <span>{t("paging.range", { from, to, total })}</span>
      {pages > 1 && (
        <div className={cn("flex flex-wrap items-center gap-1", loading && "opacity-60")}>
          <button
            type="button"
            className={cn(box, "border border-slate-300 hover:bg-slate-100 disabled:opacity-40")}
            disabled={page === 1}
            onClick={(e) => go(page - 1, e.currentTarget)}
            aria-label={t("paging.prev")}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          </button>
          {pageNumbers(page, pages).map((n, i) =>
            n === "gap" ? (
              <span key={`gap${i}`} className="px-1" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                aria-current={n === page ? "page" : undefined}
                className={cn(box, n === page ? "bg-primary text-primary-foreground" : "border border-slate-300 text-slate-700 hover:bg-slate-100")}
                onClick={(e) => go(n, e.currentTarget)}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            className={cn(box, "border border-slate-300 hover:bg-slate-100 disabled:opacity-40")}
            disabled={page === pages}
            onClick={(e) => go(page + 1, e.currentTarget)}
            aria-label={t("paging.next")}
          >
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </button>
        </div>
      )}
    </nav>
  );
}
