import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { convertTextToSchema, updateRichText } from '$lib/utils/richtext';

const db = () => getRequestEvent().locals.db;

/** Form payloads arrive as strings; ids are transformed to numbers after validation */
const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

const authorFields = {
	title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Name is required')),
	handle: v.optional(v.pipe(v.string(), v.trim()), ''),
	bio: v.optional(v.string(), ''),
	status: v.picklist(schema.statusEnum)
};

/**
 * Matches the handle convention of the existing Shopify metaobjects:
 * ö→oe (goeran-olsson, selma-lagerloef) but ä→a, å→a (emma-faldt)
 */
function slugify(title: string) {
	return title
		.toLowerCase()
		.replace(/ö/g, 'oe')
		.replace(/ø/g, 'oe')
		.replace(/æ/g, 'ae')
		.replace(/ß/g, 'ss')
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

async function findAuthor(id: number) {
	const author = await db().query.metaobject.findFirst({
		where: eq(schema.metaobject.id, id)
	});

	if (!author || !schema.isAuthor(author)) {
		error(404, 'Author not found');
	}

	return author;
}

export const createAuthor = form(
	v.object(authorFields),
	async ({ title, handle, bio, status }) => {
		const fields: schema.AuthorFields = {
			name: title,
			description: bio ? convertTextToSchema(bio) : null
		};

		const [created] = await db()
			.insert(schema.metaobject)
			.values({
				handle: handle || slugify(title),
				type: 'author',
				title,
				fields,
				status
			})
			.returning({ id: schema.metaobject.id });

		redirect(303, `/admin/authors/${created.id}`);
	}
);

export const updateAuthor = form(
	v.object({ id: idField, ...authorFields }),
	async ({ id, title, handle, bio, status }) => {
		const existing = await findAuthor(id);

		const fields: schema.AuthorFields = {
			...existing.fields,
			name: title,
			description: updateRichText(existing.fields?.description, bio)
		};

		await db()
			.update(schema.metaobject)
			.set({
				title,
				handle: handle || existing.handle,
				fields,
				status,
				updatedAt: new Date().toISOString()
			})
			.where(eq(schema.metaobject.id, id));

		return { success: true };
	}
);

export const deleteAuthor = form(v.object({ id: idField }), async ({ id }) => {
	await db().delete(schema.metaobject).where(eq(schema.metaobject.id, id));

	redirect(303, '/admin/authors');
});
