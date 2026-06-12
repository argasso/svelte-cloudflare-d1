import { eq } from "drizzle-orm";
import { error, fail, redirect } from "@sveltejs/kit";
import type { PageServerLoad, Actions } from "./$types";
import * as schema from "$lib/db/schema";

export const load: PageServerLoad = async ({ locals, params }) => {
  const db = locals.db;
  const authorId = parseInt(params.id);

  const author = await db.query.metaobject.findFirst({
    where: eq(schema.metaobject.id, authorId),
  });

  if (!author || author.type !== "author") {
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
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = formData.get("email") as string;
    const website = formData.get("website") as string;
    const status = formData.get("status") as "Active" | "Draft" | "Archived";

    if (!title) {
      return fail(400, { error: "Name is required" });
    }

    try {
      const fields: Record<string, any> = {};
      if (bio) fields.bio = bio;
      if (firstName) fields.first_name = firstName;
      if (lastName) fields.last_name = lastName;
      if (email) fields.email = email;
      if (website) fields.website = website;

      await db
        .update(schema.metaobject)
        .set({
          title,
          handle,
          fields: Object.keys(fields).length > 0 ? fields : undefined,
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
