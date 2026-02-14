import { cn } from "@/lib/utils";

interface MacroProgressBarProps {
  label: string;
  current: number;
  goal: number;
  unit: string;
  color: string;
}

export function MacroProgressBar({
  label,
  current,
  goal,
  unit,
  color,
}: MacroProgressBarProps) {
  const percentage = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
  const isOver = current > goal;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={cn("text-muted-foreground", isOver && "text-destructive font-medium")}>
          {Math.round(current)} / {goal} {unit}
        </span>
      </div>
      <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
