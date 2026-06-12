import { and, eq, getTableColumns, sql } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import * as schema from "$lib/db/schema";

export const load: PageServerLoad = async ({ locals }) => {
  const db = locals.db;

  const authors = await db
    .select({
      ...getTableColumns(schema.metaobject),
      bookCount: sql<number>`count(${schema.productsToMetaobjects.productId})`,
    })
    .from(schema.metaobject)
    .leftJoin(
      schema.productsToMetaobjects,
      and(  
        eq(schema.metaobject.id, schema.productsToMetaobjects.metaobjectId),
        eq(schema.productsToMetaobjects.relationType, 'author')
      )
    )
    .where(eq(schema.metaobject.type, "author"))
    .groupBy(schema.metaobject.id)
    .orderBy(schema.metaobject.title);

  const total = await db.$count(schema.metaobject, eq(schema.metaobject.type, "author"))

  return {
    authors,
    total,
  };
};
