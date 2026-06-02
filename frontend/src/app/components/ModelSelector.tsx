import type { ModelInfo } from "../types";

interface Props {
  models: ModelInfo[];
  selected: string;
  onChange: (id: string) => void;
}

export function ModelSelector({ models, selected, onChange }: Props) {
  return (
    <select
      value={selected}
      onChange={(e) => onChange(e.target.value)}
      className="bg-transparent text-[13px] rounded-lg px-3 py-1.5 cursor-pointer outline-none transition-colors"
      style={{
        color: "#9499a5",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLSelectElement).style.borderColor =
          "rgba(255,255,255,0.15)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLSelectElement).style.borderColor =
          "rgba(255,255,255,0.08)")
      }
    >
      {models.map((m) => (
        <option key={m.id} value={m.id} style={{ backgroundColor: "#0f1011", color: "#f0f1f3" }}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
