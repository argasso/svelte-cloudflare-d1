import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import * as schema from "$lib/db/schema";

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = locals.db;
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();

  const pages = await db
    .select({
      ...getTableColumns(schema.metaobject),
      productCount: sql<number>`count(${schema.productsToMetaobjects.productId})`,
    })
    .from(schema.metaobject)
    .leftJoin(
      schema.productsToMetaobjects,
      and(
        eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId),
        eq(schema.productsToMetaobjects.relationType, "category"),
      ),
    )
    .where(eq(schema.metaobject.type, "page"))
    .groupBy(schema.metaobject.id)
    .orderBy(schema.metaobject.position, schema.metaobject.title);

  // While searching, show a flat filtered list (the tree can't be preserved when
  // ancestors are filtered out); otherwise render the indented hierarchy.
  if (q) {
    const matched = pages
      .filter(
        (p) =>
          (p.title ?? "").toLowerCase().includes(q) || p.handle.toLowerCase().includes(q),
      )
      .map((p) => ({ ...p, depth: 0, childCount: 0 }));
    return { pages: matched, total: pages.length, shown: matched.length, q, searching: true };
  }

  // Depth-first ordering so the table reads as an indented tree
  const byParent = new Map<number | null, typeof pages>();
  for (const page of pages) {
    const siblings = byParent.get(page.parentId) ?? [];
    siblings.push(page);
    byParent.set(page.parentId, siblings);
  }

  const ordered: Array<(typeof pages)[number] & { depth: number; childCount: number }> = [];
  const walk = (parentId: number | null, depth: number) => {
    for (const page of byParent.get(parentId) ?? []) {
      ordered.push({
        ...page,
        depth,
        childCount: byParent.get(page.id)?.length ?? 0,
      });
      walk(page.id, depth + 1);
    }
  };
  walk(null, 0);

  // Pages whose parent row is missing would otherwise disappear from the tree
  const seen = new Set(ordered.map((p) => p.id));
  for (const page of pages) {
    if (!seen.has(page.id)) {
      ordered.push({ ...page, depth: 0, childCount: byParent.get(page.id)?.length ?? 0 });
    }
  }

  return { pages: ordered, total: pages.length, shown: ordered.length, q, searching: false };
};
