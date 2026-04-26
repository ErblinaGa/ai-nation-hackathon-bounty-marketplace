import { DEMO_TASKS, type DemoTask } from "@/seed/demo_tasks";

// Difficulty display config
const DIFFICULTY_STYLES: Record<string, string> = {
  EASY: "text-success",
  MEDIUM: "text-accent",
  HARD: "text-danger",
};

// Infer difficulty from max_bounty_sats if not explicitly set
function getDifficulty(task: DemoTask): "EASY" | "MEDIUM" | "HARD" {
  if (task.max_bounty_sats <= 5000) return "EASY";
  if (task.max_bounty_sats <= 7500) return "MEDIUM";
  return "HARD";
}

interface TemplateButtonsProps {
  onSelect: (task: DemoTask) => void;
}

export default function TemplateButtons({ onSelect }: TemplateButtonsProps) {
  return (
    <div className="flex gap-3 flex-wrap" role="group" aria-label="Use a template">
      {DEMO_TASKS.map((task) => {
        const difficulty = getDifficulty(task);
        const diffStyle = DIFFICULTY_STYLES[difficulty];

        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task)}
            className="group flex items-center gap-3 border border-border hover:border-fg/40 px-4 py-3 bg-bg hover:bg-fg/[0.03] transition-colors text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label={`Use template: ${task.title}`}
          >
            <div>
              <div className="text-sm font-display font-semibold text-fg group-hover:text-fg tracking-tight leading-tight">
                {task.title}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-mono font-medium tracking-widest ${diffStyle}`}>
                  {difficulty}
                </span>
                <span className="text-[10px] font-mono text-muted">
                  {task.language === "typescript" ? "TS" : "PY"}
                </span>
                <span className="text-[10px] font-mono text-muted">
                  {task.max_bounty_sats.toLocaleString()} sats
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
