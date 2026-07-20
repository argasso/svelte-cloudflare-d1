/**
 * Tracks whether a form differs from its loaded state, so the Save button can be
 * disabled until something changes and a "Discard" button can appear.
 *
 * Detection is a diff of the form's serialized FormData against a baseline.
 * Two listeners run in parallel:
 *   - document capture — catches events from controls form-associated via the
 *     `form=` attribute (rich-text hidden inputs, MetaobjectSelect items on the
 *     product page's detached form).
 *   - form bubble — belt-and-suspenders for controls that ARE descendants
 *     (variant forms), since some spread-attachment interactions from Kit's
 *     remote-form enhance can make capture-phase timing flaky.
 *
 * Baseline is captured synchronously on attach; late-hydrating fields
 * (RichTextEditor's `current`) then dispatch synthetic input events, so any
 * post-mount change re-runs the diff. Reverting is a full reload (see the
 * page), which is the only fully reliable reset given remote-form internal
 * state — this just reports dirtiness.
 */
export function createFormChanges(options?: {
	/**
	 * Re-capture the baseline once on the next animation frame after attach (only
	 * if still clean). Lets late-populating controls — TipTap, bits-ui selects
	 * writing their hidden inputs after mount — settle first, so a manual revert
	 * (Cmd-Z, reselecting the original option) diffs back to clean instead of
	 * sticking dirty. Safe when a page has a single tracker; avoid mixing with
	 * many trackers whose baselines could race.
	 */
	settleBeforeBaseline?: boolean;
}) {
	let dirty = $state(false);
	let baseline = '';
	let formEl: HTMLFormElement | null = null;

	const serialize = (f: HTMLFormElement) =>
		[...new FormData(f).entries()]
			.map(([k, v]) => `${k}=${typeof v === 'string' ? v : v.name}`)
			.join('\n');

	function rebaseline() {
		if (!formEl) return;
		baseline = serialize(formEl);
		dirty = false;
	}

	return {
		get dirty() {
			return dirty;
		},
		/** Svelte 5 attachment for the `<form>` element. Use with {@attach ...}. */
		attach(node: HTMLFormElement) {
			formEl = node;
			rebaseline();
			if (options?.settleBeforeBaseline) {
				requestAnimationFrame(() => {
					if (!dirty) rebaseline();
				});
			}
			const doc = node.ownerDocument;
			const onChange = () => {
				if (formEl) dirty = serialize(formEl) !== baseline;
			};
			doc.addEventListener('input', onChange, true);
			doc.addEventListener('change', onChange, true);
			node.addEventListener('input', onChange);
			node.addEventListener('change', onChange);
			return () => {
				doc.removeEventListener('input', onChange, true);
				doc.removeEventListener('change', onChange, true);
				node.removeEventListener('input', onChange);
				node.removeEventListener('change', onChange);
			};
		},
		/** Re-baseline after a successful save so the saved values become "clean". */
		markSaved() {
			rebaseline();
		}
	};
}
