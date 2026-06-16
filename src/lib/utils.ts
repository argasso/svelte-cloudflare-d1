export * from './utils/cn';
export * from './utils/index';
export * from './utils/menu';
export * from './utils/richtext';
export * from './utils/slugify';
export * from './utils/image';

// Type helpers expected by the vendored shadcn-svelte components
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
