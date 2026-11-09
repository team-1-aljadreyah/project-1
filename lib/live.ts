"use client";

// Live updates from the server over one WebSocket for the whole tab.
// When something happens (a ticket is called, a booking is made, a payment is settled), the server sends an
// event right away and the pages that listen refresh at once, instead of waiting for their next check.
// The usual checks every few seconds (useLoad's `every`) keep running underneath, so if the live
// connection is down, nothing is lost: pages are only a few seconds slower.

import { useEffect, useRef } from "react";
import { API_URL, USE_MOCK } from "./config";
import { getToken, useSession } from "./auth";
import { http } from "./api/axios";

type Handler = (event: string) => void;

const handlers = new Set<Handler>();
let socket: WebSocket | null = null;
let opening = false;
let openedWith: string | null = null; // the sign-in the socket was opened with (null = not signed in)
let attempt = 0;
let everOpened = false;
let ping: ReturnType<typeof setInterval> | undefined;
let retry: ReturnType<typeof setTimeout> | undefined;

// After this many failed tries in a row without ever connecting, stop trying until the page is opened again
// (for a server that doesn't offer live updates yet). The checks every few seconds carry on.
const MAX_FAILS = 6;

async function open() {
  if (USE_MOCK || typeof WebSocket === "undefined" || handlers.size === 0 || socket || opening) return;
  opening = true;
  const token = getToken();
  let url = `${API_URL.replace(/^http/, "ws")}/ws`;
  if (token) {
    // A one-time pass that lasts 60 seconds, so the sign-in token itself never goes into an address.
    try {
      const { data } = await http.post<{ ticket: string }>("/realtime/ticket");
      if (data?.ticket) url += `?ticket=${encodeURIComponent(data.ticket)}`;
    } catch {
      // Without a pass the socket still gets the public waiting-room events.
    }
  }
  opening = false;
  if (handlers.size === 0 || socket) return;

  const ws = new WebSocket(url);
  socket = ws;
  openedWith = token;
  ws.onopen = () => {
    attempt = 0;
    everOpened = true;
    // A small "still here" message every 25 seconds keeps the connection from being cut as idle.
    ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: "ping" })), 25_000);
  };
  ws.onmessage = (e) => {
    let message: { event?: unknown } | null = null;
    try {
      message = JSON.parse(String(e.data));
    } catch {
      return;
    }
    const name = message?.event;
    if (typeof name !== "string" || name === "connected") return;
    handlers.forEach((h) => h(name));
  };
  ws.onclose = () => {
    clearInterval(ping);
    if (socket !== ws) return; // closed on purpose (sign-in changed, or nobody listens any more)
    socket = null;
    if (handlers.size === 0) return;
    attempt += 1;
    if (!everOpened && attempt >= MAX_FAILS) return;
    // Wait longer after each failure (1 s, 2 s, 4 s ... up to 30 s), plus a little randomness so many
    // screens don't all reconnect at the same moment after a restart.
    const wait = Math.min(30_000, 1000 * 2 ** (attempt - 1)) + Math.random() * 1000;
    retry = setTimeout(open, wait);
  };
}

function close() {
  clearTimeout(retry);
  clearInterval(ping);
  const s = socket;
  socket = null;
  s?.close();
}

// "appointment.*" matches every event that starts with "appointment.".
function matches(patterns: string[], name: string) {
  return patterns.some((p) => (p.endsWith(".*") ? name.startsWith(p.slice(0, -1)) : p === name));
}

// Calls onEvent when one of the listed events arrives. Several events close together cause one call.
export function useLive(patterns: string[] | undefined, onEvent: () => void) {
  const { session } = useSession();
  const token = session?.token ?? null;
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const key = patterns?.join("|") ?? "";

  useEffect(() => {
    if (!key) return;
    const list = key.split("|");
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handler: Handler = (name) => {
      if (!matches(list, name)) return;
      clearTimeout(timer);
      timer = setTimeout(() => onEventRef.current(), 300);
    };
    handlers.add(handler);
    // Signed in or out since the socket opened: open it again, so it gets this person's events.
    if (socket && openedWith !== token) close();
    attempt = 0;
    open();
    return () => {
      clearTimeout(timer);
      handlers.delete(handler);
      if (handlers.size === 0) close();
    };
  }, [key, token]);
}
