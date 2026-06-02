import { Trash2, Plus } from "lucide-react";
import type { Conversation } from "../types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function Sidebar({ conversations, activeId, onSelect, onDelete, onNew }: Props) {
  return (
    <div className="w-64 flex-shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col h-full">
      <div className="p-3 border-b border-gray-700">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          新對話
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {conversations.length === 0 && (
          <p className="text-gray-500 text-xs text-center mt-4">尚無對話</p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
              conv.id === activeId
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
            onClick={() => onSelect(conv.id)}
          >
            <span className="flex-1 text-sm truncate">{conv.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
