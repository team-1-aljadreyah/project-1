"use client";

// Pictures and files that live on the backend (welfare card photos, lab result files).
// The backend sends short addresses like "/files/lab-results/12_scan.png". The site and the API are on
// different addresses, so a short one would be looked for on the site and break. These helpers turn it into
// a full API address. A private file without its own pass (?token=) is downloaded with the person's sign-in
// in a header, never with the sign-in written into the address.

import { useEffect, useState } from "react";
import { API_URL } from "./config";
import { http } from "./api/axios";

// Already complete: pictures inside the page (data:, blob:) or full addresses (http..., https...).
const COMPLETE = /^(data:|blob:|https?:\/\/)/i;

// A lab file sent as a bare name ("12_scan.png") lives in the backend's "lab-results" folder.
function pathOf(value: string, folder: string) {
  if (value.startsWith("/")) return value;
  if (!value.includes("/")) return `/files/${folder}/${encodeURIComponent(value)}`;
  return `/${value}`;
}

// A private backend address with no pass of its own: it needs the sign-in to open.
const needsSignIn = (path: string) => /^\/(files|storage\/v1\/object\/authenticated)\//.test(path) && !/[?&]token=/.test(path);

// Gives an address the browser can open for a backend file, or "" while it is still loading or if it failed.
export function useMediaUrl(value: string | null | undefined, folder = "lab-results") {
  const raw = value ?? "";
  const complete = !raw || COMPLETE.test(raw);
  const path = complete ? "" : pathOf(raw, folder);
  const viaHeader = !complete && needsSignIn(path);
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!viaHeader) return;
    let url = "";
    let cancelled = false;
    http
      .get<Blob>(path, { responseType: "blob" })
      .then(({ data }) => {
        if (cancelled) return;
        url = URL.createObjectURL(data);
        setLoaded({ path, url });
      })
      .catch(() => !cancelled && setLoaded({ path, url: "" }));
    return () => {
      cancelled = true;
      // Frees the downloaded copy when the picture is no longer shown.
      if (url) URL.revokeObjectURL(url);
    };
  }, [path, viaHeader]);

  if (complete) return raw;
  if (!viaHeader) return `${API_URL}${path}`;
  return loaded?.path === path ? loaded.url : "";
}
