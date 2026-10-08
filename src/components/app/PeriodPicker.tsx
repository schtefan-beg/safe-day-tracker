import { cn } from "@/lib/utils";

export function PeriodPicker({ value, onChange, options = [14, 28, 56] }: { value: number; onChange: (n: number) => void; options?: number[] }) {
  return (
    <div className="inline-flex rounded-full bg-muted p-1">
      {options.map((d) => (
        <button key={d} onClick={() => onChange(d)} className={cn("rounded-full px-4 py-1.5 text-sm", value === d ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}>
          {d} j
        </button>
      ))}
    </div>
  );
}
