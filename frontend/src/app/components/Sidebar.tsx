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
    <div
      className="w-[220px] flex-shrink-0 flex flex-col h-full"
      style={{
        backgroundColor: "#0f1011",
        borderRight: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* App header */}
      <div className="px-4 py-4 flex items-center gap-2">
        <span className="text-[#5e6ad2] text-sm select-none">✦</span>
        <span
          className="text-[13px] font-semibold tracking-tight"
          style={{ color: "#f0f1f3", letterSpacing: "-0.01em" }}
        >
          YangChat
        </span>
      </div>

      {/* New chat button */}
      <div className="px-3 pb-3">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white text-[13px] font-medium transition-all duration-150"
          style={{ backgroundColor: "#5e6ad2" }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#6e7ae0")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#5e6ad2")
          }
        >
          <Plus size={14} />
          新對話
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-3">
        {conversations.length === 0 && (
          <p className="text-[12px] text-center mt-4" style={{ color: "#62666d" }}>
            尚無對話
          </p>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-150`}
            style={
              conv.id === activeId
                ? { backgroundColor: "rgba(255,255,255,0.07)", color: "#f0f1f3" }
                : { color: "#9499a5" }
            }
            onMouseEnter={(e) => {
              if (conv.id !== activeId) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor =
                  "rgba(255,255,255,0.04)";
                (e.currentTarget as HTMLDivElement).style.color = "#d0d4dc";
              }
            }}
            onMouseLeave={(e) => {
              if (conv.id !== activeId) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                (e.currentTarget as HTMLDivElement).style.color = "#9499a5";
              }
            }}
            onClick={() => onSelect(conv.id)}
          >
            <span className="flex-1 text-[13px] truncate">{conv.title}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(conv.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-all duration-150 flex-shrink-0"
              style={{ color: "#62666d" }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#f87171")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.color = "#62666d")
              }
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
