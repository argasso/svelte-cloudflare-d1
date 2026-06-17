import { and, eq } from "drizzle-orm";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import * as schema from "$lib/db/schema";

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = locals.db;
  const authorId = parseInt(params.id);

  const author = await db.query.metaobject.findFirst({
    where: eq(schema.metaobject.id, authorId),
  });

  if (!author || !schema.isAuthor(author)) {
    error(404, "Author not found");
  }

  const media = await db
    .select()
    .from(schema.media)
    .where(
      and(
        eq(schema.media.entityType, "metaobject"),
        eq(schema.media.entityId, String(authorId)),
      ),
    )
    .orderBy(schema.media.position);

  return { author, media };
};
