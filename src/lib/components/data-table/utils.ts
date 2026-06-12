import { camelCaseToTitleCase } from '$lib/db/utils';
import type { ColumnDef, DisplayColumnDef } from '@tanstack/table-core';
import { getColumns, type InferSelectModel, type Table } from 'drizzle-orm';

export function getDefaultColumnDefs<T extends Table>(
	table: T,
	idSelection?: (keyof InferSelectModel<T>)[]
): ColumnDef<InferSelectModel<T>>[] {
	const columns = getColumns(table);
	return Object.keys(columns)
		.filter((id) => !idSelection || idSelection.includes(id))
		.map((id) => getDefaultColumnDef(table, id));
}

export function getDefaultColumnDef<T extends Table>(
	table: T,
	id: keyof InferSelectModel<T>
): ColumnDef<InferSelectModel<T>> {
	return {
		accessorKey: id,
		header: camelCaseToTitleCase(id)
	};
}
