import { and, eq, ne } from "drizzle-orm";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import * as schema from "$lib/db/schema";

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = locals.db;
  const pageId = parseInt(params.id);

  const page = await db.query.metaobject.findFirst({
    where: eq(schema.metaobject.id, pageId),
  });

  if (!page || !schema.isPage(page)) {
    error(404, "Page not found");
  }

  // Self is excluded here; deeper cycle prevention happens in the remote function
  const parentOptions = await db
    .select({
      id: schema.metaobject.id,
      title: schema.metaobject.title,
    })
    .from(schema.metaobject)
    .where(and(eq(schema.metaobject.type, "page"), ne(schema.metaobject.id, pageId)))
    .orderBy(schema.metaobject.title);

  const children = await db
    .select({
      id: schema.metaobject.id,
      title: schema.metaobject.title,
      status: schema.metaobject.status,
    })
    .from(schema.metaobject)
    .where(eq(schema.metaobject.parentId, pageId))
    .orderBy(schema.metaobject.position, schema.metaobject.title);

  const productCount = await db.$count(
    schema.productsToMetaobjects,
    and(
      eq(schema.productsToMetaobjects.metaobjectId, pageId),
      eq(schema.productsToMetaobjects.relationType, "category"),
    ),
  );

  return { page, parentOptions, children, productCount };
};
