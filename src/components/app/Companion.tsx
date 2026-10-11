import { useState } from "react";
import { Heart, ShoppingBag, Sparkles, Star, Check, LockKeyhole, Award } from "lucide-react";
import { toast } from "sonner";
import meadow from "@/assets/milo-meadow.jpg";
import { ACCESSORIES, balance, buyAccessory, equipAccessory, level, type GameState } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export function Companion({ game }: { game: GameState }) {
  const [shop, setShop] = useState(false);
  const [badges, setBadges] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const accessory = ACCESSORIES.find((a) => a.id === game.equipped);
  const progress = (game.claims.length % 8) * 12.5;
  const badgeList = [
    { title: "Premier petit pas", emoji: "🌱", count: 1 },
    { title: "On prend son envol", emoji: "🪽", count: 8 },
    { title: "Un joli chemin", emoji: "🌈", count: 24 },
  ];
  return <>
    <section className="companion-scene relative overflow-hidden" aria-label="Milo, mon compagnon">
      <img src={meadow} width={1536} height={1024} alt="Milo, un petit oiseau turquoise joyeux dans une prairie fleurie" className="h-full w-full object-cover" />
      <div className="absolute left-5 top-5">
        <p className="text-xs font-extrabold uppercase text-scene-ink">Mon petit compagnon</p>
        <h2 className="mt-1 text-3xl font-extrabold text-scene-ink">Milo <span className="text-lg">🌱</span></h2>
      </div>
      <Button variant="secondary" size="icon" className="absolute right-4 top-4 rounded-full bg-card/90" onClick={() => setShop(true)} aria-label="La boutique de Milo"><ShoppingBag /></Button>
      <Button variant="ghost" className="absolute left-[28%] top-[25%] h-[54%] w-[44%] hover:bg-transparent" onClick={() => setGreeting((v) => !v)} aria-label="Dire bonjour à Milo" />
      {accessory && <span className="pointer-events-none absolute left-[46%] top-[24%] text-4xl" aria-label={accessory.name}>{accessory.emoji}</span>}
      <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-center gap-2 rounded-xl bg-card/95 px-4 py-3 text-sm font-bold text-scene-ink">
        <Heart className="h-4 w-4 shrink-0 text-game-pink" />
        {greeting ? "Coucou ! Je suis heureux de te voir 💛" : game.claims.length ? "Chaque petit pas compte. Je suis fier de toi !" : "Et si on prenait soin de nous aujourd’hui ?"}
      </div>
    </section>
    <div className="flex items-center gap-4 border-b border-border py-4">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"><Star className="h-5 w-5" /></span>
      <div className="flex-1">
        <div className="mb-1.5 flex justify-between text-xs font-extrabold"><span>Niveau {level(game)} · {level(game) === 1 ? "Petit explorateur" : "Compagnon curieux"}</span><span className="text-muted-foreground">{game.claims.length % 8}/8</span></div>
        <progress className="game-progress h-2 w-full" max={100} value={progress} aria-label="Progression du compagnon" />
      </div>
      <Button variant="ghost" size="icon" onClick={() => setBadges(true)} aria-label="Mes badges"><Award className="text-game-gold" /></Button>
    </div>
    <Dialog open={shop} onOpenChange={setShop}><DialogContent className="max-w-md rounded-2xl">
      <DialogTitle className="text-2xl font-extrabold">Le dressing de Milo</DialogTitle>
      <DialogDescription>{balance(game)} étoiles dans ta poche</DialogDescription>
      <div className="space-y-3">{ACCESSORIES.map((a) => {
        const owned = game.owned.includes(a.id);
        const equipped = game.equipped === a.id;
        return <div key={a.id} className="flex items-center gap-3 border-b border-border pb-3">
          <span className="text-4xl">{a.emoji}</span><div className="flex-1"><p className="font-bold">{a.name}</p><p className="text-xs text-muted-foreground">{owned ? "Dans ta collection" : `${a.cost} étoiles`}</p></div>
          <Button size="sm" variant={equipped ? "secondary" : "default"} disabled={!owned && balance(game) < a.cost} onClick={async () => {
            if (owned) await equipAccessory(equipped ? null : a.id);
            else if (await buyAccessory(a.id)) toast.success(`${a.name} débloqué !`);
          }}>{equipped ? <><Check />Porté</> : owned ? "Porter" : <><Sparkles />Choisir</>}</Button>
        </div>;
      })}</div>
    </DialogContent></Dialog>
    <Dialog open={badges} onOpenChange={setBadges}><DialogContent className="max-w-md rounded-2xl">
      <DialogTitle className="text-2xl font-extrabold">Mes petites victoires</DialogTitle><DialogDescription>Une collection qui grandit à ton rythme.</DialogDescription>
      {badgeList.map((b) => <div key={b.count} className="flex items-center gap-4 border-b border-border py-3"><span className={game.claims.length >= b.count ? "text-4xl" : "text-4xl grayscale opacity-40"}>{b.emoji}</span><div className="flex-1"><p className="font-bold">{b.title}</p><p className="text-xs text-muted-foreground">{b.count} quête{b.count > 1 ? "s" : ""} accomplie{b.count > 1 ? "s" : ""}</p></div>{game.claims.length >= b.count ? <Check className="text-primary" /> : <LockKeyhole className="h-4 w-4 text-muted-foreground" />}</div>)}
    </DialogContent></Dialog>
  </>;
}