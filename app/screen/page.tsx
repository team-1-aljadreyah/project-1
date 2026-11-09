"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, GalleryHorizontal, Maximize, Volume2, VolumeX } from "lucide-react";
import { api, type BranchId, type ScreenDoctor } from "@/lib/api";
import { doctorName, doctorSpecialty } from "@/lib/display";
import { errorText, useT } from "@/lib/i18n";
import { useLoad } from "@/lib/useLoad";
import { LanguageSwitch } from "@/components/language-switch";
import { LogoMark } from "@/components/logo";
import { AboutSlide, Clock, DoctorsSlide, doctorsSlideMs, queueGrid, QueueStrip, SlideProgress, slideMotion, useDoctorsPerPage, useScreenWidth } from "@/components/screen-slides";

type BranchFilter = "all" | BranchId;
const BRANCHES: BranchFilter[] = ["all", "main", "second"];
const BRANCH_KEY = "alrahma.screen.branch";
const BRANCH_EVENT = "alrahma-screen-branch";
// A ticket called in the last 20 seconds glows, so people notice it changed.
const FRESH_MS = 20_000;
const SLIDES_KEY = "alrahma.screen.slides";

// The order of slides: the queue comes back after every info slide, so it is never away for long.
type Slide = "queue" | "about" | "doctors";
const SEQUENCE: Slide[] = ["queue", "about", "queue", "doctors"];
const QUEUE_MS = 25_000;
const ABOUT_MS = 15_000;

// A short two-note chime made by the browser itself, so there is no sound file to load.
function chime() {
  const audio = new AudioContext();
  [880, 660].forEach((frequency, i) => {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    const start = audio.currentTime + i * 0.35;
    volume.gain.setValueAtTime(0.25, start);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.6);
    tone.connect(volume).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.6);
  });
}

// Each TV remembers which branch it shows, the same way the theme and language are remembered.
function subscribeBranch(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(BRANCH_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(BRANCH_EVENT, onChange);
  };
}

function readBranch(): BranchFilter {
  try {
    const saved = localStorage.getItem(BRANCH_KEY) as BranchFilter | null;
    return saved && BRANCHES.includes(saved) ? saved : "all";
  } catch {
    return "all";
  }
}

// Whether this TV shows the info slides between the queue. On unless someone turns it off.
function readSlides(): boolean {
  try {
    return localStorage.getItem(SLIDES_KEY) !== "off";
  } catch {
    return true;
  }
}

function saveSlides(on: boolean) {
  try {
    localStorage.setItem(SLIDES_KEY, on ? "on" : "off");
  } catch {}
  window.dispatchEvent(new Event(BRANCH_EVENT));
}

function saveBranch(branch: BranchFilter) {
  try {
    localStorage.setItem(BRANCH_KEY, branch);
  } catch {}
  window.dispatchEvent(new Event(BRANCH_EVENT));
}

// One doctor's box. On a TV (fit) the box is a "size container": the text inside grows and shrinks with the
// box (cqw / cqh / cqmin = percent of the box's width / height / smaller side), so 2 or 15 doctors all fit.
function DoctorPanel({ item, fresh, fit }: { item: ScreenDoctor; fresh: boolean; fit: boolean }) {
  const { t, locale } = useT();
  return (
    <section
      data-screen-doctor={item.doctor.id}
      className={`flex flex-col gap-3 rounded-3xl border bg-white/5 p-4 backdrop-blur-sm transition-colors 2xl:p-6 ${
        fit ? "h-full min-h-0 overflow-hidden [container-type:size]" : ""
      } ${fresh ? "border-[#5eead4] shadow-[0_0_40px_rgb(94_234_212/0.35)]" : "border-white/10"}`}
    >
      <div className="min-w-0">
        <h2 className="truncate text-[clamp(1rem,7cqmin,2rem)] font-bold">{doctorName(item.doctor, locale)}</h2>
        <p className="truncate text-[clamp(0.8rem,4.5cqmin,1.25rem)] opacity-70 [@container(max-height:10rem)]:hidden">
          {doctorSpecialty(item.doctor, locale)} · {t(`branch.${item.branch}`)}
        </p>
      </div>

      {item.absent ? (
        // Fixed colors: the TV screen is always dark, so it must not follow the day/night theme.
        <p className="rounded-2xl bg-[#ef4444]/20 px-4 py-[6cqh] text-center text-[clamp(1rem,7cqmin,2rem)] font-semibold text-[#fecaca]">{t("screen.absent")}</p>
      ) : (
        <>
          <div className="rounded-2xl bg-black/20 px-3 py-[2cqh] text-center">
            <p className="text-[clamp(0.75rem,4cqmin,1rem)] uppercase tracking-wide opacity-70">{t("screen.now")}</p>
            <p
              dir="ltr"
              data-screen-now
              className={`font-mono text-[clamp(2.25rem,min(19cqw,24cqh),8rem)] leading-tight font-bold tracking-tight ${fresh ? "animate-pulse text-[#5eead4]" : ""}`}
            >
              {item.now ?? "—"}
            </p>
          </div>
          {/* "Next" on one line next to its label; tickets that don't fit are left out, not cut. */}
          <div className="flex min-w-0 items-center gap-2 overflow-hidden text-[clamp(0.75rem,4cqmin,1rem)] [@container(max-height:8.5rem)]:hidden">
            <span className="shrink-0 opacity-70">{t("screen.next")}:</span>
            {item.next.length === 0 ? (
              <span className="truncate opacity-60">{t("screen.nobody")}</span>
            ) : (
              <div className="flex h-[1.9em] min-w-0 flex-wrap gap-2 overflow-hidden">
                {item.next.map((ticket) => (
                  <span key={ticket} dir="ltr" className="rounded-lg bg-white/10 px-2 font-mono text-[1.2em] font-semibold">
                    {ticket}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="mt-auto flex flex-wrap justify-between gap-2 text-[clamp(0.75rem,4cqmin,1rem)] opacity-80 [@container(max-height:13rem)]:hidden">
            <span>{t("screen.waiting", { n: item.waiting })}</span>
            {item.late_minutes > 0 && <span className="text-[#fde68a]">{t("screen.late", { n: item.late_minutes })}</span>}
          </div>
        </>
      )}
    </section>
  );
}

// The waiting room TV. No sign-in: it only shows ticket numbers, never names.
export default function QueueScreenPage() {
  const { t, locale } = useT();
  const { state, reload } = useLoad(api.queueScreen, "", { every: 3000, live: ["appointment.*", "visit.*", "doctor.late", "doctor.absent"] });
  const doctorList = useLoad(api.listDoctors, "", { every: 60_000 });
  const branch = useSyncExternalStore(subscribeBranch, readBranch, () => "all" as const);
  const slidesOn = useSyncExternalStore(subscribeBranch, readSlides, () => true);
  // Which slide is showing, and since when.
  const [at, setAt] = useState({ step: 0, since: 0 });
  const [sound, setSound] = useState(false);
  // The current time, updated every second, so a new ticket's glow goes away by itself.
  const [nowMs, setNowMs] = useState(0);
  const lastCalls = useRef<Map<number, string | null> | null>(null);
  const Back = locale === "ar" ? ArrowRight : ArrowLeft;

  const data = state.status === "success" ? state.data : null;
  const allDoctors = doctorList.state.status === "success" ? doctorList.state.data : [];
  // On info slides the queue strip sits at the bottom, so the doctors get less height.
  const perPage = useDoctorsPerPage(110);
  const durationOf = (slide: Slide) => (slide === "queue" ? QUEUE_MS : slide === "about" ? ABOUT_MS : doctorsSlideMs(allDoctors.length, perPage, ABOUT_MS));
  // The latest call by any doctor. Kept in a ref so the once-a-second timer always sees the newest value.
  const latestCall = useRef(0);
  const live = useRef({ slidesOn, durationOf });
  useEffect(() => {
    latestCall.current = Math.max(0, ...(data ?? []).map((d) => (d.called_at ? Date.parse(d.called_at) : 0)));
    live.current = { slidesOn, durationOf };
  });

  // Every second: move to the next slide when its time is up. When a doctor calls a new number while an
  // info slide is showing, go straight back to the queue so nobody misses their number.
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      setAt((cur) => {
        const { slidesOn: on, durationOf: duration } = live.current;
        if (!on) return cur.step === 0 ? cur : { step: 0, since: now };
        if (cur.since === 0) return { step: 0, since: now };
        const slide = SEQUENCE[cur.step];
        const newCall = latestCall.current > cur.since && now - latestCall.current < FRESH_MS;
        if (newCall) return slide === "queue" ? { step: cur.step, since: now } : { step: (cur.step + 1) % SEQUENCE.length, since: now };
        if (now - cur.since >= duration(slide)) return { step: (cur.step + 1) % SEQUENCE.length, since: now };
        return cur;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Go to the next (or previous) slide now, from the button or the arrow keys (a TV remote's arrows work too).
  const step = (by: number) => setAt((cur) => ({ step: (cur.step + by + SEQUENCE.length) % SEQUENCE.length, since: Date.now() }));
  useEffect(() => {
    if (!slidesOn) return;
    const rtl = locale === "ar";
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      // In Arabic the next slide is to the left.
      if (e.key === (rtl ? "ArrowLeft" : "ArrowRight")) step(1);
      else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft")) step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slidesOn, locale]);

  // Chime when any doctor calls a new ticket. Not on the first load, only on changes.
  useEffect(() => {
    if (!data) return;
    const calls = new Map(data.map((d) => [d.doctor.id, d.called_at]));
    const before = lastCalls.current;
    lastCalls.current = calls;
    if (!before || !sound) return;
    if ([...calls].some(([id, at]) => at && at !== before.get(id))) chime();
  }, [data, sound]);

  const doctors = data?.filter((d) => branch === "all" || d.branch === branch) ?? [];
  // On a TV or computer every doctor fits on one screen: a grid as big as the space between header and footer.
  // Phones (narrower than 768 px) keep a normal list you can scroll.
  const fit = useScreenWidth() >= 768;
  const grid = queueGrid(doctors.length);
  const freshOf = (d: ScreenDoctor) => !!d.called_at && nowMs - Date.parse(d.called_at) < FRESH_MS;
  const slide: Slide = slidesOn ? SEQUENCE[at.step] : "queue";
  const motionProps = slideMotion(locale === "ar");

  return (
    <MotionConfig reducedMotion="user">
      <div className={`login-panel min-h-screen overflow-x-hidden p-6 text-[#f8fafc] lg:p-10 ${slide !== "queue" ? "pb-44 lg:pb-44 2xl:pb-52" : ""}`}>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <LogoMark size={56} />
            <div>
              <h1 className="text-3xl font-bold">{t("login.panel.tagline")}</h1>
              <p className="opacity-75">{t("screen.title")}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Always on screen (the bottom bar can cover the footer), but faded until pointed at. */}
            {slidesOn && (
              <button
                type="button"
                onClick={() => step(1)}
                data-next-slide
                aria-label={t("slides.next")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold opacity-50 transition-opacity hover:bg-white/20 hover:opacity-100 focus-visible:opacity-100"
              >
                {t("slides.next")}
                {locale === "ar" ? <ChevronLeft className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
              </button>
            )}
            <Clock />
          </div>
        </header>
        {slidesOn && at.since > 0 && (
          <div className="mb-6">
            <SlideProgress startedAt={at.since} ms={durationOf(slide)} />
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div key={`${at.step}-${slide}`} {...motionProps} data-slide={slide} className={slide === "queue" ? "" : "lg:flex lg:min-h-[calc(100vh-25rem)] lg:flex-col lg:justify-center"}>
            {slide === "queue" && (
              <>
                {state.status === "loading" && <p className="py-20 text-center text-xl opacity-70">{t("screen.loading")}</p>}
                {state.status === "error" && (
                  <button type="button" onClick={reload} className="mx-auto block py-20 text-xl underline">
                    {errorText(state.error, t)}
                  </button>
                )}
                {state.status === "success" && doctors.length === 0 && <p className="py-20 text-center text-2xl opacity-80">{t("screen.noDoctors")}</p>}
                {doctors.length > 0 && (
                  <div
                    data-queue-grid
                    className={fit ? `grid gap-4 2xl:gap-6 ${slidesOn ? "h-[calc(100vh-17rem)]" : "h-[calc(100vh-15rem)]"}` : "grid gap-6"}
                    style={fit ? { gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))` } : undefined}
                  >
                    {doctors.map((d) => (
                      <DoctorPanel key={d.doctor.id} item={d} fresh={freshOf(d)} fit={fit} />
                    ))}
                  </div>
                )}
              </>
            )}
            {slide === "about" && <AboutSlide doctors={allDoctors} today={data ?? []} />}
            {slide === "doctors" && <DoctorsSlide doctors={allDoctors} today={data ?? []} branchFirst={branch} perPage={perPage} />}
          </motion.div>
        </AnimatePresence>

        {/* On info slides the queue never disappears: it moves to a strip at the bottom. */}
        <AnimatePresence>{slide !== "queue" && doctors.length > 0 && <QueueStrip doctors={doctors} freshOf={freshOf} />}</AnimatePresence>

        {/* Small controls for whoever sets the TV up. They fade until pointed at. */}
        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 text-sm opacity-40 transition-opacity hover:opacity-100 focus-within:opacity-100">
          <Link href="/" className="inline-flex items-center gap-1.5 underline">
            <Back className="size-4" aria-hidden />
            {t("screen.back")}
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {BRANCHES.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => saveBranch(b)}
                className={`rounded-lg px-3 py-1.5 ${b === branch ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}
              >
                {b === "all" ? t("screen.allBranches") : t(`branch.${b}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => saveSlides(!slidesOn)}
              aria-pressed={slidesOn}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10"
            >
              <GalleryHorizontal className="size-4" aria-hidden />
              {slidesOn ? t("slides.on") : t("slides.off")}
            </button>
            <button type="button" onClick={() => setSound(!sound)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10">
              {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
              {sound ? t("screen.soundOn") : t("screen.soundOff")}
            </button>
            <button
              type="button"
              onClick={() => void document.documentElement.requestFullscreen?.()}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 hover:bg-white/10"
            >
              <Maximize className="size-4" aria-hidden />
              {t("screen.fullscreen")}
            </button>
            <LanguageSwitch />
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}
