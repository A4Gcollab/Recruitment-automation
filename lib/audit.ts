import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export async function logAudit(entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actor: entry.actor,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    beforeState: (entry.before ?? null) as never,
    afterState: (entry.after ?? null) as never,
    metadata: (entry.metadata ?? null) as never,
  });
}
