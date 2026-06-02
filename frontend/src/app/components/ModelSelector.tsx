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
      className="bg-gray-700 text-gray-100 text-sm rounded px-2 py-1 border border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      {models.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </select>
  );
}
