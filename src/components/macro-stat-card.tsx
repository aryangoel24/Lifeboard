import { cn } from "@/lib/utils";
import { Flame, Beef, Wheat, Droplet, type LucideIcon } from "lucide-react";

interface MacroStatCardProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
}

const MACRO_CONFIG = {
  calories: { icon: Flame, color: "text-orange-500", bgColor: "bg-orange-500/10", barColor: "bg-orange-500" },
  protein: { icon: Beef, color: "text-sky-500", bgColor: "bg-sky-500/10", barColor: "bg-sky-500" },
  carbs: { icon: Wheat, color: "text-emerald-500", bgColor: "bg-emerald-500/10", barColor: "bg-emerald-500" },
  fat: { icon: Droplet, color: "text-amber-500", bgColor: "bg-amber-500/10", barColor: "bg-amber-500" },
} as const;

export { MACRO_CONFIG };

export function MacroStatCard({
  label,
  current,
  goal,
  unit,
  icon: Icon,
  color,
  bgColor,
}: MacroStatCardProps) {
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const isOver = current > goal && goal > 0;
  const barColor = MACRO_CONFIG[label.toLowerCase() as keyof typeof MACRO_CONFIG]?.barColor ?? "bg-primary";

  return (
    <div className="group rounded-xl border border-border/60 bg-card p-4 space-y-3 transition-all hover:shadow-md hover:border-border">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-1.5", bgColor)}>
          <Icon className={cn("h-3.5 w-3.5", color)} />
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-bold tracking-tight text-card-foreground", isOver && "text-destructive")}>
          {Math.round(current)}
        </span>
        <span className="text-xs text-muted-foreground font-medium">
          / {goal} {unit}
        </span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", barColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {percentage >= 100 ? "Goal reached" : `${Math.round(percentage)}% of goal`}
      </p>
    </div>
  );
}
