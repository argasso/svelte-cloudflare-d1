/**
 * Fixed-choice values for book metafields, mirroring the Shopify metafield
 * definitions' `choices` validations. Used by the admin enum selects.
 */
export const BINDINGS = [
	'Kartonnage',
	'Mjukband',
	'Inbunden',
	'Flexband',
	'Danskt band',
	'CD-bok',
	'E-bok',
	'E-ljudbok'
];

export const AGES = [
	'från 6 år',
	'från 7 år',
	'från 8 år',
	'från 9 år',
	'från 10 år',
	'från 11 år',
	'från 12 år',
	'från 13 år',
	'från 15 år'
];

// book.reading_level is number_integer, 1–4.
export const READING_LEVELS = ['1', '2', '3', '4'];
