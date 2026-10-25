import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { requireAdmin } from '$lib/server/auth';
import { richTextField } from '$lib/utils/tiptap';
import { slugify } from '$lib/utils/slugify';
import { reindexMetaobject, removeFromIndex } from '$lib/server/search';

// Exposed at /_app/remote, which Cloudflare Access path rules do NOT cover, so
// every mutation self-guards with requireAdmin (validates the Access JWT).
const db = () => getRequestEvent().locals.db;

/** Form payloads arrive as strings; ids are transformed to numbers after validation */
const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

const authorFields = {
	title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Name is required')),
	handle: v.optional(v.pipe(v.string(), v.trim()), ''),
	bio: richTextField,
	status: v.picklist(schema.statusEnum)
};

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
		await requireAdmin(getRequestEvent());
		const fields: schema.AuthorFields = {
			name: title,
			description: bio
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

		try {
			await reindexMetaobject(db(), created.id);
		} catch (e) {
			console.error('search reindex (createAuthor)', created.id, e);
		}
		redirect(303, `/admin/authors/${created.id}`);
	}
);

export const updateAuthor = form(
	v.object({ id: idField, ...authorFields }),
	async ({ id, title, handle, bio, status }) => {
		await requireAdmin(getRequestEvent());
		const existing = await findAuthor(id);

		const fields: schema.AuthorFields = {
			...existing.fields,
			name: title,
			description: bio
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

		try {
			await reindexMetaobject(db(), id);
		} catch (e) {
			console.error('search reindex (updateAuthor)', id, e);
		}
		return { success: true };
	}
);

export const deleteAuthor = form(v.object({ id: idField }), async ({ id }) => {
	await requireAdmin(getRequestEvent());
	await db().delete(schema.metaobject).where(eq(schema.metaobject.id, id));

	try {
		await removeFromIndex(db(), 'author', id);
	} catch (e) {
		console.error('search reindex (deleteAuthor)', id, e);
	}
	redirect(303, '/admin/authors');
});
