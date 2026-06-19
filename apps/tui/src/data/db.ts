/**
 * In-memory persistence backend that mimics the subset of the Dexie API the
 * web app's repository/sync/backup layers use. GritTUI keeps the whole dataset
 * in memory for an instant UI; durability and multi-device sharing come from the
 * cloud (see sync.ts) — the cloud is the single source of truth, loaded fresh on
 * launch and written through on change. This file is the web's db.ts, reshaped
 * to a plain Map store so the rest of the data layer ports almost verbatim.
 */
import type {
  Task,
  Completion,
  LedgerEntry,
  Settings,
  CustomList,
  FoodItem,
  DayLog,
  ActiveFocus,
} from "@grit/core";

export interface Tombstone {
  key: string;
  table: string;
  id: string;
  updatedAt: number;
}

/** Suppress the updatedAt/tombstone hooks while applying remote (pulled) rows. */
export const syncControl = { suppress: false };

/** Tables that participate in cloud sync. */
export const SYNCED_TABLES = [
  "tasks",
  "completions",
  "ledger",
  "settings",
  "lists",
  "foods",
  "dayLogs",
  "focus",
] as const;

export type SyncedTable = (typeof SYNCED_TABLES)[number];

type WithId = { id: string };

/** Result of a where() narrowing — supports the terminal ops the repo uses. */
class WhereResult<T extends WithId> {
  constructor(
    private readonly table: MemTable<T>,
    private readonly predicate: (row: T) => boolean,
  ) {}

  private all(): T[] {
    return this.table.rows().filter(this.predicate);
  }
  async toArray(): Promise<T[]> {
    return this.all();
  }
  async first(): Promise<T | undefined> {
    return this.all()[0];
  }
  async count(): Promise<number> {
    return this.all().length;
  }
  async delete(): Promise<number> {
    const victims = this.all();
    for (const r of victims) await this.table.delete(r.id);
    return victims.length;
  }
}

/** A where("field") clause awaiting an .equals(value). */
class WhereField<T extends WithId> {
  constructor(
    private readonly table: MemTable<T>,
    private readonly field: string,
  ) {}
  equals(value: unknown): WhereResult<T> {
    return new WhereResult(
      this.table,
      (r) => (r as Record<string, unknown>)[this.field] === value,
    );
  }
}

export class MemTable<T extends WithId> {
  private store = new Map<string, T>();

  constructor(private readonly name: string) {}

  private get synced(): boolean {
    return (SYNCED_TABLES as readonly string[]).includes(this.name);
  }

  private stamp(obj: T): void {
    if (this.synced && !syncControl.suppress) {
      (obj as Record<string, unknown>).updatedAt = Date.now();
    }
  }

  /** Snapshot of all rows (insertion order, like a fresh toArray). */
  rows(): T[] {
    return [...this.store.values()];
  }

  async toArray(): Promise<T[]> {
    return this.rows();
  }

  async get(id: string): Promise<T | undefined> {
    return this.store.get(id);
  }

  async add(obj: T): Promise<string> {
    if ((obj as Record<string, unknown>).updatedAt === undefined) this.stamp(obj);
    this.store.set(obj.id, obj);
    return obj.id;
  }

  async bulkAdd(rows: T[]): Promise<void> {
    for (const r of rows) await this.add(r);
  }

  async put(obj: T): Promise<string> {
    this.stamp(obj);
    this.store.set(obj.id, obj);
    return obj.id;
  }

  async update(id: string, patch: Partial<T>): Promise<number> {
    const existing = this.store.get(id);
    if (!existing) return 0;
    const next: T = { ...existing, ...patch };
    this.stamp(next);
    this.store.set(id, next);
    return 1;
  }

  async delete(id: string): Promise<void> {
    const existed = this.store.delete(id);
    if (existed && this.synced && !syncControl.suppress) {
      db().tombstones.set(`${this.name}:${id}`, {
        key: `${this.name}:${id}`,
        table: this.name,
        id,
        updatedAt: Date.now(),
      });
    }
  }

  async clear(): Promise<void> {
    // Dexie's bulk clear() does not fire deleting hooks — no tombstones here.
    this.store.clear();
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  orderBy(field: keyof T & string): { toArray: () => Promise<T[]> } {
    return {
      toArray: async () =>
        this.rows().sort((a, b) => {
          const av = a[field] as unknown as number;
          const bv = b[field] as unknown as number;
          return av < bv ? -1 : av > bv ? 1 : 0;
        }),
    };
  }

  where(criteria: Record<string, unknown>): WhereResult<T>;
  where(field: string): WhereField<T>;
  where(arg: string | Record<string, unknown>): WhereResult<T> | WhereField<T> {
    if (typeof arg === "string") return new WhereField(this, arg);
    return new WhereResult(this, (r) =>
      Object.entries(arg).every(
        ([k, v]) => (r as Record<string, unknown>)[k] === v,
      ),
    );
  }
}

class MemDB {
  tasks = new MemTable<Task>("tasks");
  completions = new MemTable<Completion>("completions");
  ledger = new MemTable<LedgerEntry>("ledger");
  settings = new MemTable<Settings>("settings");
  lists = new MemTable<CustomList>("lists");
  foods = new MemTable<FoodItem>("foods");
  dayLogs = new MemTable<DayLog>("dayLogs");
  focus = new MemTable<ActiveFocus>("focus");
  /** Gravestones; keyed "table:id". */
  tombstones = new Map<string, Tombstone>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table(name: string): MemTable<any> {
    const t = (this as unknown as Record<string, unknown>)[name];
    if (!(t instanceof MemTable)) throw new Error(`unknown table: ${name}`);
    return t;
  }

  /** No real atomicity needed in memory — just run the unit of work. */
  async transaction<R>(
    _mode: string,
    _tables: unknown,
    fn: () => Promise<R>,
  ): Promise<R> {
    return fn();
  }
}

let _db: MemDB | null = null;

export function db(): MemDB {
  if (!_db) _db = new MemDB();
  return _db;
}

/** Wipe everything (e.g. on sign-out) so the next sign-in loads fresh. */
export function resetDb(): void {
  _db = new MemDB();
}
