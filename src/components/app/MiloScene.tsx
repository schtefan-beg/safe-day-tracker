import { useEffect, useRef, useState } from "react";
import { Apple, Heart, Moon, Music2, Pause, Sparkles, Sun, Wind, X } from "lucide-react";
import garden from "@/assets/milo-garden.jpg";
import idle from "@/assets/milo-idle.png";
import sleeping from "@/assets/milo-sleep.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = "idle" | "cuddle" | "feed" | "dance" | "play" | "breathe" | "sleep" | "celebrate";
const ACTIONS = [
  { id: "cuddle", label: "Câlin", icon: Heart },
  { id: "feed", label: "Goûter", icon: Apple },
  { id: "dance", label: "Danser", icon: Music2 },
  { id: "play", label: "Jouer", icon: Sparkles },
  { id: "breathe", label: "Respirer", icon: Wind },
  { id: "sleep", label: "Repos", icon: Moon },
] as const;
const DURATIONS: Partial<Record<Action, number>> = { cuddle: 5, feed: 6, dance: 8, play: 20, breathe: 24, celebrate: 5 };
const MESSAGES: Record<Action, string> = {
  idle: "Un petit moment ensemble ? 💛",
  cuddle: "Un câlin tout doux, rien que pour nous !",
  feed: "Miam ! Merci pour cette petite baie 🍓",
  dance: "La danse des petits bonheurs !",
  play: "Attrapons trois papillons ensemble !",
  breathe: "On prend notre temps…",
  sleep: "Zzz… une pause bien méritée.",
  celebrate: "Bravo pour ton petit pas ! ✨",
};

export function MiloScene({ claims, accessory, children }: {
  claims: number;
  accessory?: { name: string; emoji: string } | undefined;
  children?: React.ReactNode;
}) {
  const [session, setSession] = useState<{ action: Action; id: number }>({ action: "idle", id: 0 });
  const [seconds, setSeconds] = useState(0);
  const [caught, setCaught] = useState(0);
  const previousClaims = useRef(claims);
  const { action } = session;
  const begin = (next: Action) => {
    setSeconds(0);
    setCaught(0);
    setSession((s) => ({ action: next, id: s.id + 1 }));
  };
  useEffect(() => {
    if (claims > previousClaims.current) {
      setSeconds(0);
      setCaught(0);
      setSession((s) => ({ action: "celebrate", id: s.id + 1 }));
    }
    previousClaims.current = claims;
  }, [claims]);
  useEffect(() => {
    const duration = DURATIONS[action];
    if (!duration) return;
    const interval = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    const timeout = window.setTimeout(() => {
      setSeconds(0);
      setSession((s) => ({ action: "idle", id: s.id + 1 }));
    }, duration * 1000);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
  }, [session.id, action]);

  const breath = seconds % 8 < 4 ? "Inspire doucement" : "Expire doucement";
  const message = action === "breathe" ? `${breath} · ${4 - seconds % 4}`
    : action === "play" ? `${MESSAGES.play} ${caught}/3`
    : MESSAGES[action];

  return <>
    <section className="companion-scene relative overflow-hidden" aria-label="Milo, mon compagnon" data-action={action}>
      <img src={garden} alt="La prairie fleurie de Milo" className="absolute h-full w-full object-cover" width={1536} height={1024} />
      <div className="absolute left-5 top-5 z-10">
        <p className="text-xs font-extrabold uppercase text-scene-ink">Mon petit compagnon</p>
        <h2 className="mt-1 text-3xl font-extrabold text-scene-ink">Milo <span className="text-lg">🌱</span></h2>
      </div>
      {children}
      {action === "breathe" && <div key={session.id} className="milo-breath-ring" aria-hidden="true" />}
      <div className="milo-position">
        <Button key={session.id} variant="ghost" className="milo-character"
          aria-label={action === "sleep" ? "Réveiller Milo" : "Caresser Milo"}
          onClick={() => begin(action === "sleep" ? "idle" : "cuddle")}>
          <span className={cn("milo-pose", `milo-${action}`)}><img src={action === "sleep" || action === "breathe" ? sleeping : idle}
            alt={action === "sleep" ? "Milo dort paisiblement" : action === "breathe" ? "Milo respire les yeux fermés" : "Milo, petit oiseau turquoise à l’écharpe corail"}
            className="h-full w-full object-contain" draggable={false} />
          {accessory && <span className="milo-accessory" aria-label={accessory.name}>{accessory.emoji}</span>}</span>
        </Button>
      </div>
      {(action === "cuddle" || action === "celebrate" || action === "dance") &&
        <div key={session.id} className="milo-particles" aria-hidden="true"><span>{action === "cuddle" ? "💗" : "✨"}</span><span>{action === "dance" ? "♫" : "💛"}</span><span>{action === "cuddle" ? "💕" : "⭐"}</span></div>}
      {action === "feed" && <span key={session.id} className="milo-berry" aria-hidden="true">🍓</span>}
      {action === "sleep" && <span className="milo-zzz" aria-hidden="true">Z z z</span>}
      {action === "play" && <Button variant="ghost" className={cn("milo-butterfly", `milo-target-${caught}`)} aria-label={`Attraper le papillon ${caught + 1}`} onClick={() => {
        if (caught === 2) begin("celebrate");
        else setCaught((n) => n + 1);
      }}>🦋</Button>}
      {action !== "idle" && <Button variant="secondary" size="icon" className="absolute bottom-20 right-4 z-20 rounded-full bg-card/95" aria-label={action === "sleep" ? "Réveiller Milo" : "Terminer ce moment"} onClick={() => begin("idle")}>
        {action === "sleep" ? <Sun /> : <X />}
      </Button>}
      <div className="absolute bottom-4 left-4 right-4 flex min-h-12 items-center gap-2 rounded-xl bg-card/95 px-3 py-2.5 text-sm font-bold text-card-foreground">
        {action === "sleep" ? <Moon className="h-4 w-4 shrink-0 text-primary" /> : <Heart className="h-4 w-4 shrink-0 text-game-pink" />}
        <p role="status" aria-live="polite" className="min-w-0 flex-1">{message}</p>
      </div>
    </section>
    <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Moments avec Milo">
      {ACTIONS.map(({ id, label, icon: Icon }) => <Button key={id} variant={action === id ? "secondary" : "ghost"}
        className="h-[66px] min-w-0 flex-col gap-1 rounded-xl px-0.5 text-[11px] font-bold" aria-label={label} aria-pressed={action === id} title={label}
        onClick={() => begin(action === id ? "idle" : id)}><Icon className={id === "cuddle" ? "text-game-pink" : "text-primary"} />{label}</Button>)}
    </div>
    {action === "breathe" && <div className="flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground"><span>Une pause ensemble · {Math.min(3, Math.floor(seconds / 8) + 1)}/3</span><Button variant="ghost" size="sm" onClick={() => begin("idle")}><Pause />Terminer</Button></div>}
  </>;
}