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
  higherIsBetter?: boolean;
}

const MACRO_CONFIG = {
  calories: { icon: Flame, color: "text-orange-500", bgColor: "bg-orange-500/10", barColor: "bg-orange-500" },
  protein: { icon: Beef, color: "text-blue-500", bgColor: "bg-blue-500/10", barColor: "bg-blue-500" },
  carbs: { icon: Wheat, color: "text-green-500", bgColor: "bg-green-500/10", barColor: "bg-green-500" },
  fat: { icon: Droplet, color: "text-purple-500", bgColor: "bg-purple-500/10", barColor: "bg-purple-500" },
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
  higherIsBetter = false,
}: MacroStatCardProps) {
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const isOver = current > goal;
  const remaining = Math.max(goal - current, 0);
  const barColor = MACRO_CONFIG[label.toLowerCase() as keyof typeof MACRO_CONFIG]?.barColor ?? "bg-primary";

  const overIsGood = isOver && higherIsBetter;

  // Color-coded progress: green (on track), yellow (close, >80%), red (over, unless higherIsBetter)
  const progressBarColor = isOver
    ? (overIsGood ? "bg-green-500" : "bg-destructive")
    : percentage >= 80
      ? "bg-amber-500"
      : barColor;

  const overTextColor = overIsGood ? "text-green-500" : "text-destructive";

  return (
    <div className={cn(
      "glass-card rounded-2xl p-4 space-y-3",
      label.toLowerCase() === "calories" && "border-l-2 border-l-orange-500",
      label.toLowerCase() === "protein" && "border-l-2 border-l-blue-500",
      label.toLowerCase() === "carbs" && "border-l-2 border-l-green-500",
      label.toLowerCase() === "fat" && "border-l-2 border-l-purple-500",
    )}>
      <div className="flex items-center gap-3">
        <div className={cn("rounded-xl p-2.5", bgColor)}>
          <Icon className={cn("h-4 w-4", color)} />
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div>
        <span className={cn("text-2xl font-bold tabular-nums", isOver && overTextColor)}>
          {Math.round(current)}
        </span>
        <span className="text-sm text-muted-foreground ml-1">
          / {goal} {unit}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", progressBarColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className={cn(
        "text-xs",
        isOver ? overTextColor : "text-muted-foreground"
      )}>
        {isOver
          ? `${Math.round(current - goal)} ${unit} over`
          : `${Math.round(remaining)} ${unit} remaining`}
      </p>
    </div>
  );
}
