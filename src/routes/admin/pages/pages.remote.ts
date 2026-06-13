import { error, invalid, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { form, getRequestEvent } from '$app/server';
import * as v from 'valibot';
import * as schema from '$lib/db/schema';
import { richTextField } from '$lib/utils/tiptap';
import { slugify } from '$lib/utils/slugify';

const db = () => getRequestEvent().locals.db;

/** Form payloads arrive as strings; ids are transformed to numbers after validation */
const idField = v.pipe(v.string(), v.regex(/^\d+$/, 'Invalid id'), v.transform(Number));

const pageFields = {
	title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Title is required')),
	name: v.optional(v.pipe(v.string(), v.trim()), ''),
	handle: v.optional(v.pipe(v.string(), v.trim()), ''),
	content: richTextField,
	metaTitleSeo: v.optional(v.pipe(v.string(), v.trim()), ''),
	metaDescriptionSeo: v.optional(v.pipe(v.string(), v.trim()), ''),
	parentId: v.optional(v.pipe(v.string(), v.regex(/^\d*$/, 'Invalid parent')), ''),
	status: v.picklist(schema.statusEnum)
};

async function findPage(id: number) {
	const page = await db().query.metaobject.findFirst({
		where: eq(schema.metaobject.id, id)
	});

	if (!page || !schema.isPage(page)) {
		error(404, 'Page not found');
	}

	return page;
}

type IssueFn = (message: string) => Parameters<typeof invalid>[number];

/**
 * Resolve and validate a parent selection. `selfId` guards against a page
 * becoming its own ancestor (the hierarchy is small, so walking up is cheap).
 */
async function resolveParentId(parentIdRaw: string, issueParent: IssueFn, selfId?: number) {
	if (!parentIdRaw) return null;

	const parentId = Number(parentIdRaw);
	if (selfId !== undefined && parentId === selfId) {
		invalid(issueParent('A page cannot be its own parent'));
	}

	const parent = await db().query.metaobject.findFirst({
		where: eq(schema.metaobject.id, parentId)
	});
	if (!parent || !schema.isPage(parent)) {
		invalid(issueParent('Parent page not found'));
	}

	if (selfId !== undefined) {
		let ancestorId = parent.parentId;
		while (ancestorId !== null) {
			if (ancestorId === selfId) {
				invalid(issueParent('A page cannot be nested inside one of its own sub-pages'));
			}
			const ancestor = await db().query.metaobject.findFirst({
				where: eq(schema.metaobject.id, ancestorId),
				columns: { parentId: true }
			});
			ancestorId = ancestor?.parentId ?? null;
		}
	}

	return parentId;
}

export const createPage = form(
	v.object(pageFields),
	async ({ title, name, handle, content, metaTitleSeo, metaDescriptionSeo, parentId, status }, issue) => {
		const resolvedParentId = await resolveParentId(parentId, issue.parentId);

		const fields: schema.PageFields = {
			title,
			name: name || null,
			content,
			meta_title_seo: metaTitleSeo || null,
			meta_description_seo: metaDescriptionSeo || null
		};

		const [created] = await db()
			.insert(schema.metaobject)
			.values({
				handle: handle || slugify(title),
				type: 'page',
				title,
				fields,
				parentId: resolvedParentId,
				status
			})
			.returning({ id: schema.metaobject.id });

		redirect(303, `/admin/pages/${created.id}`);
	}
);

export const updatePage = form(
	v.object({ id: idField, ...pageFields }),
	async (
		{ id, title, name, handle, content, metaTitleSeo, metaDescriptionSeo, parentId, status },
		issue
	) => {
		const existing = await findPage(id);
		const resolvedParentId = await resolveParentId(parentId, issue.parentId, id);

		// Note: fields.sub_pages (Shopify gids on the parent) is left untouched here;
		// parentId is the canonical hierarchy locally. Reconciling sub_pages happens
		// in the D1->Shopify sync layer.
		const fields: schema.PageFields = {
			...existing.fields,
			title,
			name: name || null,
			content,
			meta_title_seo: metaTitleSeo || null,
			meta_description_seo: metaDescriptionSeo || null
		};

		await db()
			.update(schema.metaobject)
			.set({
				title,
				handle: handle || existing.handle,
				fields,
				parentId: resolvedParentId,
				status,
				updatedAt: new Date().toISOString()
			})
			.where(eq(schema.metaobject.id, id));

		return { success: true };
	}
);

export const deletePage = form(v.object({ id: idField }), async ({ id }, issue) => {
	const children = await db().$count(schema.metaobject, eq(schema.metaobject.parentId, id));
	if (children > 0) {
		invalid(issue.id('This page has sub-pages — move or delete them first'));
	}

	// Product links cascade via the products_to_metaobjects FK
	await db().delete(schema.metaobject).where(eq(schema.metaobject.id, id));

	redirect(303, '/admin/pages');
});
