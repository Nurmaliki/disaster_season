// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		/**
		 * Shape of the error surfaced to `+error.svelte`. `status` and `message`
		 * are always present in SvelteKit; we keep them explicit for readability.
		 */
		interface Error {
			status?: number;
			message: string;
		}

		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
