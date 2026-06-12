import { eq } from "drizzle-orm";
import type { PageServerLoad } from "./$types";
import * as schema from "$lib/db/schema";

export const load: PageServerLoad = async ({ locals }) => {
  const parentOptions = await locals.db
    .select({
      id: schema.metaobject.id,
      title: schema.metaobject.title,
    })
    .from(schema.metaobject)
    .where(eq(schema.metaobject.type, "page"))
    .orderBy(schema.metaobject.title);

  return { parentOptions };
};
