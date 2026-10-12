import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BarChart3, BookOpen, Home, Lightbulb, Settings } from "lucide-react";
import { db, DEFAULT_TAGS, ensureTag, type EventType, type FullEvent } from "@/lib/db";
import { checkPin, hasPin, setPin, validPin } from "@/lib/pin";
import { checkReminders } from "@/lib/notifications";
import { EventEditor } from "./EventEditor";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import meadow from "@/assets/milo-meadow.jpg";

interface Ctx {
  openNew: (t: EventType) => void;
  openEdit: (e: FullEvent) => void;
  lock: () => void;
}
const AppCtx = createContext<Ctx>({ openNew: () => {}, openEdit: () => {}, lock: () => {} });
export const useApp = () => useContext(AppCtx);

const INACTIVITY_MS = 5 * 60 * 1000;

export function AppShell({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "onboarding" | "locked" | "unlocked">("loading");
  const [editor, setEditor] = useState<{ open: boolean; type: EventType; event: FullEvent | null }>({ open: false, type: "psy", event: null });
  const lastActive = useRef(Date.now());

  useEffect(() => {
    hasPin().then((h) => setState(h ? "locked" : "onboarding")).catch(() => setState("onboarding"));
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        setState((s) => (s === "unlocked" ? "locked" : s));
        setEditor((e) => ({ ...e, open: false }));
      } else checkReminders();
    };
    const bump = () => (lastActive.current = Date.now());
    document.addEventListener("visibilitychange", onVis);
    ["pointerdown", "keydown", "scroll"].forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const iv = setInterval(() => {
      if (Date.now() - lastActive.current > INACTIVITY_MS) setState((s) => (s === "unlocked" ? "locked" : s));
      checkReminders();
    }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      ["pointerdown", "keydown", "scroll"].forEach((e) => window.removeEventListener(e, bump));
      clearInterval(iv);
    };
  }, []);

  const openNew = useCallback((type: EventType) => setEditor({ open: true, type, event: null }), []);
  const openEdit = useCallback((event: FullEvent) => setEditor({ open: true, type: event.type, event }), []);
  const lock = useCallback(() => setState("locked"), []);

  if (state === "loading") return <div className="min-h-dvh bg-background" />;
  if (state === "onboarding") return <Onboarding onDone={() => { lastActive.current = Date.now(); setState("unlocked"); }} />;
  if (state === "locked") return <LockScreen onUnlock={() => { lastActive.current = Date.now(); setState("unlocked"); }} />;

  return (
    <AppCtx.Provider value={{ openNew, openEdit, lock }}>
      <div className="mx-auto min-h-dvh max-w-xl bg-background pb-24">{children}</div>
      <BottomNav />
      <EventEditor open={editor.open} type={editor.type} event={editor.event} onOpenChange={(o) => setEditor((e) => ({ ...e, open: o }))} />
      <Toaster position="top-center" />
    </AppCtx.Provider>
  );
}

function BottomNav() {
  const items = [
    { to: "/", label: "Aujourd'hui", icon: Home },
    { to: "/journal", label: "Journal", icon: BookOpen },
    { to: "/tendances", label: "Tendances", icon: BarChart3 },
    { to: "/pistes", label: "Pistes", icon: Lightbulb },
    { to: "/reglages", label: "Réglages", icon: Settings },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to} activeOptions={{ exact: to === "/" }}
             className="flex flex-col items-center gap-1 py-3 text-[10px] font-bold text-muted-foreground"
             activeProps={{ className: "text-primary font-extrabold bg-accent/60" }}>
             <Icon className="h-5 w-5" strokeWidth={2.2} />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function PinPad({ value, onChange, onSubmit, max = 6 }: { value: string; onChange: (v: string) => void; onSubmit: () => void; max?: number }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "OK"];
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-8 flex justify-center gap-3">
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < value.length ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
           <Button key={k} type="button" variant={k === "OK" ? "default" : "secondary"}
            onClick={() => (k === "⌫" ? onChange(value.slice(0, -1)) : k === "OK" ? onSubmit() : value.length < max && onChange(value + k))}
            className={`h-16 rounded-2xl text-xl font-medium ${k === "OK" ? "bg-primary text-primary-foreground" : "bg-card shadow-sm active:bg-accent"}`}>
            {k}
           </Button>
        ))}
      </div>
    </div>
  );
}

function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPinV] = useState("");
  const [err, setErr] = useState("");
  const submit = async () => {
    if (await checkPin(pin)) onUnlock();
    else { setErr("Code incorrect"); setPinV(""); }
  };
  useEffect(() => { if (pin.length === 6) submit(); }, [pin]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <img src={meadow} width={1536} height={1024} alt="Milo t’attend dans son jardin" className="mb-6 h-40 w-60 rounded-2xl object-cover" />
      <h1 className="mb-2 text-3xl">Rythme 🌼</h1>
      <p className="mb-8 text-sm text-muted-foreground">{err || "Entre ton code"}</p>
      <PinPad value={pin} onChange={(v) => { setErr(""); setPinV(v); }} onSubmit={submit} />
    </div>
  );
}

function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"intro" | "pin" | "confirm">("intro");
  const [pin, setPinV] = useState("");
  const [confirmV, setConfirm] = useState("");
  const [err, setErr] = useState("");
  if (step === "intro")
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 bg-background px-6">
        <img src={meadow} width={1536} height={1024} alt="Milo, ton nouveau petit compagnon" className="w-full rounded-2xl" />
        <h1 className="text-4xl leading-tight">Rythme 🌼</h1>
        <p className="text-lg font-bold">De petits pas pour toi. Une grande aventure avec Milo.</p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>• Tes données restent uniquement sur ce téléphone. Aucun compte, aucun serveur.</li>
          <li>• L'app montre des observations, jamais un diagnostic.</li>
          <li>• Sans sauvegarde exportée, une perte ou réinitialisation du téléphone efface tout.</li>
        </ul>
        <Button onClick={() => setStep("pin")} className="h-12 rounded-xl font-extrabold">Créer mon code</Button>
      </div>
    );
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <h1 className="mb-2 text-2xl">{step === "pin" ? "Choisis un code (4 à 6 chiffres)" : "Confirme ton code"}</h1>
      <p className="mb-8 h-5 text-sm text-destructive">{err}</p>
      {step === "pin" ? (
        <PinPad value={pin} onChange={(v) => { setErr(""); setPinV(v); }}
          onSubmit={() => (validPin(pin) ? setStep("confirm") : setErr("4 à 6 chiffres"))} />
      ) : (
        <PinPad value={confirmV} onChange={(v) => { setErr(""); setConfirm(v); }}
          onSubmit={async () => {
            if (confirmV !== pin) { setErr("Les codes ne correspondent pas"); setConfirm(""); return; }
            await setPin(pin);
            if ((await db().tags.count()) === 0) for (const t of DEFAULT_TAGS) await ensureTag(t);
            onDone();
          }} />
      )}
    </div>
  );
}
