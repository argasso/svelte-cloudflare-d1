import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";
import * as schema from "$lib/db/schema";

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const db = locals.db;
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

    const authorHandle =
      handle ||
      title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const fields: Record<string, any> = {};
    if (bio) fields.bio = bio;
    if (firstName) fields.first_name = firstName;
    if (lastName) fields.last_name = lastName;
    if (email) fields.email = email;
    if (website) fields.website = website;

    try {
      const result = await db
        .insert(schema.metaobject)
        .values({
          handle: authorHandle,
          type: "author",
          title,
          fields: Object.keys(fields).length > 0 ? fields : undefined,
          status: status || "Active",
        })
        .returning({ id: schema.metaobject.id });

      redirect(303, `/admin/authors/${result[0].id}`);
    } catch (error: any) {
      console.error("Error creating author:", error);
      return fail(500, { error: error.message });
    }
  },
};
