"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import type { LabResult, ResultRow, Service } from "@/lib/api";
import { money } from "@/lib/display";
import { useT } from "@/lib/i18n";
import { useMediaUrl } from "@/lib/media";

export function serviceName(service: Service, locale: "ar" | "en") {
  return locale === "ar" ? service.name_ar : service.name;
}

export function priceText(service: Service, t: (key: "common.currency" | "common.usd") => string) {
  return `${money(service.price)} ${service.currency === "USD" ? t("common.usd") : t("common.currency")}`;
}

export type RowFlag = "low" | "high" | "normal" | null;

// Below the normal range is low, above it is high. null when the lab gave no range.
export function rowFlag(row: Pick<ResultRow, "value" | "ref_low" | "ref_high">): RowFlag {
  if (row.ref_low === null && row.ref_high === null) return null;
  if (row.ref_low !== null && row.value < row.ref_low) return "low";
  if (row.ref_high !== null && row.value > row.ref_high) return "high";
  return "normal";
}

// "70 – 110", "< 200" or "> 30": the normal range as the lab gave it.
export function rangeText(row: Pick<ResultRow, "ref_low" | "ref_high">) {
  if (row.ref_low !== null && row.ref_high !== null) return `${row.ref_low} – ${row.ref_high}`;
  if (row.ref_high !== null) return `< ${row.ref_high}`;
  if (row.ref_low !== null) return `> ${row.ref_low}`;
  return "—";
}

// A small "high ↑" or "low ↓" label. Red for high, amber for low, and nothing when normal.
export function FlagBadge({ flag }: { flag: RowFlag }) {
  const { t } = useT();
  if (flag !== "high" && flag !== "low") return null;
  const Arrow = flag === "high" ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${flag === "high" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
      <Arrow className="size-3" aria-hidden />
      {t(`lab.flag.${flag}`)}
    </span>
  );
}

// Readings as a small table with their normal ranges; or one number (older results); or a file,
// where images show a preview and every file can be downloaded.
export function ResultView({ result }: { result: LabResult }) {
  const { t } = useT();
  if (result.type === "number") {
    return (
      <p className="text-lg font-semibold" dir="ltr">
        {result.value} {result.unit}
      </p>
    );
  }
  if (result.type === "values") {
    return (
      <div className="space-y-2">
        <table className="w-full text-sm" data-result-table>
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="py-1 text-start font-normal">{t("lab.reading")}</th>
              <th className="py-1 text-start font-normal">{t("lab.value")}</th>
              <th className="py-1 text-start font-normal">{t("lab.normalRange")}</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, index) => {
              const flag = rowFlag(row);
              return (
                <tr key={index} className="border-t border-slate-200">
                  <td className="py-1.5" dir="ltr">
                    {row.name}
                  </td>
                  <td className="py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span dir="ltr" className={`font-semibold ${flag === "high" ? "text-red-700" : flag === "low" ? "text-amber-700" : ""}`}>
                        {row.value} {row.unit}
                      </span>
                      <FlagBadge flag={flag} />
                    </span>
                  </td>
                  <td className="py-1.5 text-slate-500" dir="ltr">
                    {rangeText(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-slate-500">{t("lab.sampleIs", { sample: t(`lab.sample.${result.sample}`) })}</p>
        {result.note && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{result.note}</p>}
      </div>
    );
  }
  return <FileResult result={result} />;
}

// A result sent as a file (a scan or a PDF): a preview when it is a picture, and a download link.
function FileResult({ result }: { result: Extract<LabResult, { type: "file" }> }) {
  const { t } = useT();
  // The file is on the backend: this gives an address the browser can open ("" while it loads).
  const url = useMediaUrl(result.data_url, "lab-results");
  return (
    <div className="space-y-2">
      {result.file_type.startsWith("image/") && url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={result.file_name} className="max-h-48 rounded-lg border border-slate-200" />
      )}
      <a
        href={url || undefined}
        download={result.file_name}
        aria-disabled={!url}
        className={`inline-block text-sm font-medium text-brand-600 underline ${url ? "" : "pointer-events-none opacity-60"}`}
      >
        {t("lab.download")}: {result.file_name}
      </a>
      {result.note && <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{result.note}</p>}
    </div>
  );
}
