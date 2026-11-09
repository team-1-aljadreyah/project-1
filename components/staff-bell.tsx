"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";
import { dateTime } from "@/lib/display";
import { useT } from "@/lib/i18n";
import { messageText } from "@/lib/notifications";
import { useLoad } from "@/lib/useLoad";

// The staff bell: an unread count, and a list that opens under it.
// Opening the list marks everything as read; the count updates every 15 seconds.
export function StaffBell() {
  const { t, locale } = useT();
  const { state, refresh } = useLoad(api.myNotifications, "", { every: 15000, live: ["notification.created", "lab.result_confirmed"] });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const list = state.status === "success" ? state.data : [];
  const unread = list.filter((n) => !n.read).length;

  // A click anywhere outside closes the list.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      await api.readNotifications();
      refresh();
    }
  }

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={toggle}
        aria-label={t("notifications.title")}
        aria-expanded={open}
        data-staff-bell
        className="relative inline-flex size-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span data-unread={unread} className="absolute -top-1.5 -end-1.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[11px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
      {open && (
        // Phone: a full-width box under the top bar. Computer: the bell is in the side menu at the screen's edge,
        // so the panel opens toward the page (start-0: leftwards in Arabic, rightwards in English), never off-screen.
        <div
          className="fixed inset-x-4 top-16 z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg md:absolute md:inset-x-auto md:start-0 md:top-10 md:w-80"
          data-staff-notifications
        >
          <p className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold">{t("notifications.title")}</p>
          {list.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-500">{t("notifications.empty")}</p>
          ) : (
            <ul className="max-h-96 divide-y divide-slate-200 overflow-y-auto">
              {list.slice(0, 20).map((n) => (
                <li key={n.id} className={`px-4 py-3 text-sm ${n.read ? "" : "bg-brand-50"}`}>
                  <p>{messageText(n, t, locale)}</p>
                  <time className="text-xs text-slate-500">{dateTime(n.at, locale)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
