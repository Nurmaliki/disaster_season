import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Theme store.
 *
 * The initial value is read from the DOM (which app.html already set before
 * hydration), so there is no flash of the wrong theme. We never read a user's
 * system preferences beyond the `prefers-color-scheme` media query.
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'idm-theme';

function readInitialTheme(): Theme {
	if (!browser) return 'light';
	// app.html has already applied the correct class; trust it.
	if (document.documentElement.classList.contains('dark')) return 'dark';
	return 'light';
}

export const theme = writable<Theme>(readInitialTheme());

/** Applies a theme to the document and persists the choice. */
export function setTheme(next: Theme): void {
	if (!browser) return;
	document.documentElement.classList.toggle('dark', next === 'dark');
	document.documentElement.style.colorScheme = next;
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		/* storage may be unavailable in private mode; the theme still applies */
	}
	theme.set(next);
}

export function toggleTheme(): void {
	setTheme(get(theme) === 'dark' ? 'light' : 'dark');
}

/**
 * Follows the OS preference only while the user has not made an explicit
 * choice (i.e. nothing is stored). Once they choose, their choice wins.
 */
export function initTheme(): () => void {
	if (!browser) return () => {};

	let explicit: boolean;
	try {
		explicit = localStorage.getItem(STORAGE_KEY) !== null;
	} catch {
		explicit = false;
	}

	if (explicit) return () => {};

	const media = window.matchMedia('(prefers-color-scheme: dark)');
	const listener = (event: MediaQueryListEvent): void => {
		setTheme(event.matches ? 'dark' : 'light');
		// setTheme persists, so undo that for the "follow system" case.
		try {
			localStorage.removeItem(STORAGE_KEY);
		} catch {
			/* ignore */
		}
	};

	media.addEventListener('change', listener);
	return () => media.removeEventListener('change', listener);
}
