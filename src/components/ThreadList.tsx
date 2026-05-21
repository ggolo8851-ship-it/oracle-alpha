import { useEffect, useState } from "react";
import {
  deleteThread,
  listThreads,
  newThread,
  type Thread,
} from "@/lib/threads";

export function ThreadList({
  activeId,
  onSelect,
  refreshKey,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  refreshKey: number;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    setThreads(listThreads());
  }, [refreshKey, activeId]);

  return (
    <div className="border border-border bg-card/60 backdrop-blur">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-secondary/40">
        <div className="font-mono text-[10px] tracking-[0.25em] text-primary">
          ▸ THREADS · MEMORY
        </div>
        <button
          onClick={() => {
            const t = newThread();
            onSelect(t.id);
          }}
          className="font-mono text-[10px] tracking-widest text-accent hover:text-primary"
        >
          + NEW
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-border">
        {threads.length === 0 && (
          <div className="px-3 py-3 font-mono text-[10px] text-muted-foreground">
            No threads yet. Click + NEW to start.
          </div>
        )}
        {threads.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-2 px-3 py-2 font-mono text-[11px] cursor-pointer ${
              t.id === activeId
                ? "bg-secondary text-primary"
                : "text-foreground hover:bg-secondary/60"
            }`}
            onClick={() => onSelect(t.id)}
          >
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-[9px] text-muted-foreground">
              {new Date(t.updatedAt).toLocaleDateString()}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteThread(t.id);
                setThreads(listThreads());
                const remaining = listThreads();
                if (t.id === activeId) onSelect(remaining[0]?.id ?? "");
              }}
              className="opacity-0 group-hover:opacity-100 text-destructive text-[10px]"
              title="Delete thread"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
