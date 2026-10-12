import { Activity, Smartphone, Brain, Moon, Pill, Stethoscope, UtensilsCrossed } from "lucide-react";
import type { EventType } from "@/lib/db";

export const TYPE_ICON: Record<EventType, typeof Moon> = {
  meal: UtensilsCrossed,
  sleep: Moon,
  activity: Activity,
  medication: Pill,
  symptom_physical: Stethoscope,
  psy: Brain,
  screen: Smartphone,
};

export const TYPE_COLOR: Record<EventType, string> = {
  meal: "bg-chart-5/20 text-foreground",
  sleep: "bg-chart-4/20 text-chart-4",
  activity: "bg-chart-1/20 text-chart-1",
  medication: "bg-secondary text-secondary-foreground",
  symptom_physical: "bg-chart-2/20 text-chart-2",
  psy: "bg-chart-3/20 text-chart-3",
  screen: "bg-accent/40 text-accent-foreground",
};
