/**
 * URL helpers for book store
 */
const BOOK_URL = '/bok';
const BOOKS_URL = '/bocker';
const AUTHORS_URL = '/information/forfattare';

export function bookUrl(handle: string) {
	return `${BOOK_URL}/${handle}`;
}

export function booksUrl(handle: string) {
	return `${BOOKS_URL}/${handle}`;
}

export function authorUrl(handle: string) {
	return `${AUTHORS_URL}/${handle}`;
}

/**
 * Type guards and filters
 */
export function notEmpty<TValue>(value: TValue | null | undefined): value is TValue {
	return value !== null && value !== undefined;
}

export const isNonNil = <T>(value: T | null | undefined | void): value is T => value != null;

/**
 * Date formatting (Swedish)
 */
const months = [
	'januari',
	'februari',
	'mars',
	'april',
	'maj',
	'juni',
	'juli',
	'augusti',
	'september',
	'oktober',
	'november',
	'december'
];

export function publishMonth(date: string) {
	const d = new Date(date);
	const year = d.getFullYear();
	const month = months[d.getMonth()];
	return `${month} ${year}`;
}

/**
 * JSON parsing helper
 */
export function parseJSON(input: string | null) {
	if (input) {
		try {
			return JSON.parse(input);
		} catch (e) {
			console.error('Failed to parse JSON:', e);
			return null;
		}
	}
	return null;
}

/**
 * Price formatting
 */
export function formatPrice(price: { amount: string | number; currencyCode: string }) {
	const amount = typeof price.amount === 'string' ? parseFloat(price.amount) : price.amount;
	const formattedAmount = amount.toFixed(2).replace('.00', '');

	switch (price.currencyCode) {
		case 'SEK':
			return `${formattedAmount} kr`;
		case 'USD':
			return `$${formattedAmount}`;
		case 'EUR':
			return `€${formattedAmount}`;
		default:
			return `${formattedAmount} ${price.currencyCode}`;
	}
}

/**
 * Simple price formatting (from database)
 */
export function formatSimplePrice(amount: number, currency: string = 'SEK') {
	return formatPrice({ amount: amount.toString(), currencyCode: currency });
}
