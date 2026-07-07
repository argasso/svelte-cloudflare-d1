import { tick } from 'svelte';

/**
 * Tracks whether a form differs from its loaded state, so the Save button can be
 * disabled until something changes and a "Discard" button can appear.
 *
 * Detection is a diff of the form's serialized FormData against a baseline taken
 * after mount (once custom fields — rich text, selects — have populated their
 * hidden inputs). A document-level capture listener catches input/change from
 * every control, including ones associated via the `form=` attribute (so it
 * works with the product page's detached form). Reverting is a full reload
 * (see the page), which is the only fully reliable reset given remote-form and
 * rich-text internal state — this just reports dirtiness.
 */
export function createFormChanges() {
	let dirty = $state(false);
	let baseline = '';
	let ready = false;
	let formEl: HTMLFormElement | null = null;

	const serialize = (f: HTMLFormElement) =>
		[...new FormData(f).entries()]
			.map(([k, v]) => `${k}=${typeof v === 'string' ? v : v.name}`)
			.join('\n');

	async function rebaseline() {
		ready = false;
		await tick();
		requestAnimationFrame(() => {
			if (formEl) {
				baseline = serialize(formEl);
				dirty = false;
				ready = true;
			}
		});
	}

	return {
		get dirty() {
			return dirty;
		},
		/** Svelte action for the `<form>` element. */
		attach(node: HTMLFormElement) {
			formEl = node;
			rebaseline();
			const doc = node.ownerDocument;
			const onChange = () => {
				if (ready && formEl) dirty = serialize(formEl) !== baseline;
			};
			doc.addEventListener('input', onChange, true);
			doc.addEventListener('change', onChange, true);
			return {
				destroy() {
					doc.removeEventListener('input', onChange, true);
					doc.removeEventListener('change', onChange, true);
				}
			};
		},
		/** Re-baseline after a successful save so the saved values become "clean". */
		markSaved() {
			rebaseline();
		}
	};
}
