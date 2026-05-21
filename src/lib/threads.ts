// LocalStorage thread + message persistence for the Oracle console.
import type { UIMessage } from "ai";

const KEY = "anomaly_threads_v1";

export type Thread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: UIMessage[];
};

type Store = { threads: Thread[]; activeId: string | null };

function read(): Store {
  if (typeof window === "undefined") return { threads: [], activeId: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { threads: [], activeId: null };
    const parsed = JSON.parse(raw);
    if (!parsed.threads || !Array.isArray(parsed.threads)) return { threads: [], activeId: null };
    return parsed as Store;
  } catch {
    return { threads: [], activeId: null };
  }
}

function write(s: Store) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function listThreads(): Thread[] {
  return read().threads.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getActiveId(): string | null {
  return read().activeId;
}

export function setActiveId(id: string | null) {
  const s = read();
  s.activeId = id;
  write(s);
}

export function getThread(id: string): Thread | null {
  return read().threads.find((t) => t.id === id) ?? null;
}

export function newThread(): Thread {
  const id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : `t_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const t: Thread = {
    id,
    title: "New synthesis",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  const s = read();
  s.threads.unshift(t);
  s.activeId = id;
  write(s);
  return t;
}

export function deleteThread(id: string) {
  const s = read();
  s.threads = s.threads.filter((t) => t.id !== id);
  if (s.activeId === id) s.activeId = s.threads[0]?.id ?? null;
  write(s);
}

export function saveMessages(id: string, messages: UIMessage[]) {
  const s = read();
  const t = s.threads.find((x) => x.id === id);
  if (!t) return;
  t.messages = messages;
  t.updatedAt = Date.now();
  // Auto-title from first user message
  if (t.title === "New synthesis" || !t.title) {
    const first = messages.find((m) => m.role === "user");
    if (first) {
      const text = first.parts
        .map((p) => (p.type === "text" ? p.text : ""))
        .join(" ")
        .trim();
      if (text) t.title = text.slice(0, 64);
    }
  }
  write(s);
}

export function renameThread(id: string, title: string) {
  const s = read();
  const t = s.threads.find((x) => x.id === id);
  if (!t) return;
  t.title = title.slice(0, 80);
  write(s);
}
