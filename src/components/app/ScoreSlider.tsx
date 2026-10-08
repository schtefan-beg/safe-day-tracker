import { cn } from "@/lib/utils";

export function ScoreSlider({
  label, value, onChange, optional, hint,
}: { label: string; value: number | null | undefined; onChange: (v: number | null) => void; optional?: boolean; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">
          {value == null ? (optional ? "non renseigné" : "–") : `${value}/10`}
          {optional && value != null && (
            <button type="button" className="ml-2 text-xs underline" onClick={() => onChange(null)}>effacer</button>
          )}
        </span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={cn(
              "h-9 rounded-md text-xs font-medium tabular-nums transition-colors",
              value === i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground active:bg-accent",
            )}
            aria-label={`${label} ${i}`}
          >
            {i}
          </button>
        ))}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
