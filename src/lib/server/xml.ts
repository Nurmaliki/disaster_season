/**
 * Minimal, dependency-free XML reader for the narrow subset BMKG publishes.
 *
 * The application only needs element text, attribute-free nesting, and repeated
 * child elements. Pulling in a full XML library for this would add weight and an
 * attack surface for no benefit, so this parser implements exactly that subset
 * with explicit limits. It throws on malformed input rather than guessing.
 *
 * Not a general-purpose parser: it deliberately ignores comments, processing
 * instructions, CDATA sections with nested markup, and mixed content ordering.
 */

export interface XmlNode {
	name: string;
	text: string;
	children: XmlNode[];
}

const MAX_XML_BYTES = 8 * 1024 * 1024;
const MAX_DEPTH = 64;

function decodeEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
		// &amp; must be decoded last so it cannot re-introduce markup
		.replace(/&amp;/g, '&');
}

/**
 * Parses an XML document into a tree.
 * @throws Error when the document is malformed or exceeds safety limits.
 */
export function parseXml(input: string): XmlNode {
	if (input.length > MAX_XML_BYTES) {
		throw new Error(`XML payload too large (${input.length} bytes)`);
	}

	// Strip BOM, comments, processing instructions and the XML declaration.
	const xml = input
		.replace(/^\uFEFF/, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<\?[\s\S]*?\?>/g, '')
		.replace(/<!DOCTYPE[^>]*>/gi, '');

	const stack: XmlNode[] = [];
	let root: XmlNode | null = null;
	let index = 0;

	while (index < xml.length) {
		const open = xml.indexOf('<', index);

		if (open === -1) {
			// Trailing text outside any element is ignored.
			break;
		}

		if (open > index && stack.length > 0) {
			stack[stack.length - 1].text += decodeEntities(xml.slice(index, open));
		}

		const close = xml.indexOf('>', open);
		if (close === -1) throw new Error('Malformed XML: unterminated tag');

		const raw = xml.slice(open + 1, close).trim();
		index = close + 1;

		if (raw.length === 0) continue;

		if (raw.startsWith('/')) {
			// Closing tag
			const name = raw.slice(1).trim();
			const node = stack.pop();
			if (!node) throw new Error(`Malformed XML: unexpected closing tag </${name}>`);
			if (node.name !== name) {
				throw new Error(`Malformed XML: </${name}> does not match <${node.name}>`);
			}
			if (stack.length === 0) root = node;
			else stack[stack.length - 1].children.push(node);
			continue;
		}

		const selfClosing = raw.endsWith('/');
		const nameMatch = /^([A-Za-z_][\w.:-]*)/.exec(raw);
		if (!nameMatch) throw new Error(`Malformed XML: invalid tag <${raw}>`);
		const name = nameMatch[1];

		if (stack.length >= MAX_DEPTH) throw new Error('Malformed XML: nesting too deep');

		const node: XmlNode = { name, text: '', children: [] };

		if (selfClosing) {
			if (stack.length === 0) root = node;
			else stack[stack.length - 1].children.push(node);
			continue;
		}

		stack.push(node);
	}

	if (stack.length !== 0) {
		throw new Error(`Malformed XML: unclosed <${stack[stack.length - 1].name}>`);
	}
	if (!root) throw new Error('Malformed XML: no root element');

	return root;
}

/** Returns the first direct child with the given local name (namespace-insensitive). */
export function child(node: XmlNode, name: string): XmlNode | null {
	return node.children.find((c) => localName(c.name) === name) ?? null;
}

/** Returns all direct children with the given local name. */
export function children(node: XmlNode, name: string): XmlNode[] {
	return node.children.filter((c) => localName(c.name) === name);
}

/** Depth-first search for the first descendant with the given local name. */
export function find(node: XmlNode, name: string): XmlNode | null {
	if (localName(node.name) === name) return node;
	for (const c of node.children) {
		const hit = find(c, name);
		if (hit) return hit;
	}
	return null;
}

/** All descendants with the given local name, in document order. */
export function findAll(node: XmlNode, name: string): XmlNode[] {
	const out: XmlNode[] = [];
	const walk = (n: XmlNode): void => {
		if (localName(n.name) === name) out.push(n);
		for (const c of n.children) walk(c);
	};
	walk(node);
	return out;
}

/** Reads the concatenated text of a named child. */
export function text(node: XmlNode, name: string): string | null {
	const target = child(node, name);
	if (!target) return null;
	const value = (target.text + target.children.map((c) => c.text).join('')).trim();
	return value.length ? value : null;
}

/** Strips an XML namespace prefix from an element name. */
export function localName(name: string): string {
	const colon = name.indexOf(':');
	return colon === -1 ? name : name.slice(colon + 1);
}
