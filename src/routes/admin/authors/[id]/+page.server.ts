import { eq } from "drizzle-orm";
import { error, fail, redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import * as schema from "$lib/db/schema";
import { updateRichText } from "$lib/utils/richtext";

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = locals.db;
  const authorId = parseInt(params.id);

  const author = await db.query.metaobject.findFirst({
    where: eq(schema.metaobject.id, authorId),
  });

  if (!author || !schema.isAuthor(author)) {
    error(404, "Author not found");
  }

  return { author };
};

export const actions: Actions = {
  update: async ({ request, locals, params }) => {
    const db = locals.db;
    const authorId = parseInt(params.id);
    const formData = await request.formData();

    const title = formData.get("title") as string;
    const handle = formData.get("handle") as string;
    const bio = formData.get("bio") as string;
    const status = formData.get("status") as "Active" | "Draft" | "Archived";

    if (!title) {
      return fail(400, { error: "Name is required" });
    }

    const existing = await db.query.metaobject.findFirst({
      where: eq(schema.metaobject.id, authorId),
    });

    if (!existing || !schema.isAuthor(existing)) {
      return fail(404, { error: "Author not found" });
    }

    try {
      const fields: schema.AuthorFields = {
        ...existing.fields,
        name: title,
        description: updateRichText(existing.fields?.description, bio),
      };

      await db
        .update(schema.metaobject)
        .set({
          title,
          handle,
          fields,
          status,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(schema.metaobject.id, authorId));

      return { success: true };
    } catch (error: any) {
      console.error("Error updating author:", error);
      return fail(500, { error: error.message });
    }
  },

  delete: async ({ locals, params }) => {
    const db = locals.db;
    const authorId = parseInt(params.id);

    try {
      await db
        .delete(schema.metaobject)
        .where(eq(schema.metaobject.id, authorId));
      redirect(303, "/admin/authors");
    } catch (error: any) {
      console.error("Error deleting author:", error);
      return fail(500, { error: error.message });
    }
  },
};
