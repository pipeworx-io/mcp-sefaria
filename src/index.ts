interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Sefaria MCP — the free digital library of Jewish texts.
 * Fetch any passage (Torah, Talmud, Mishnah, Midrash, commentaries) in Hebrew
 * and/or English by reference, validate/autocomplete a reference, and list the
 * commentaries and cross-references on a passage. Keyless.
 */


const BASE = 'https://www.sefaria.org/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'get_text',
    description:
      'Fetch a passage of Jewish text from Sefaria by reference, in Hebrew and/or English. Works for Torah/Tanakh, Talmud, Mishnah, Midrash, Halacha, Kabbalah, and commentaries. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: {
          type: 'string',
          description: 'Textual reference, e.g. "Genesis.1.1", "Genesis.1.1-5", "Psalms.23", "Shabbat.2a", "Mishnah_Berakhot.1.1".',
        },
        language: {
          type: 'string',
          description: 'Which translation(s) to return: "en", "he", or "both" (default "both").',
        },
      },
      required: ['ref'],
    },
  },
  {
    name: 'lookup_ref',
    description:
      'Validate or autocomplete a Sefaria reference or title (e.g. "Genesis", "Rashi", "Berakhot"). Returns whether it is a valid reference/book and a list of completions. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A partial title or reference to validate/autocomplete.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_commentaries',
    description:
      'List the commentaries and cross-references on a passage (e.g. Rashi, Targum, quoting commentaries) from Sefaria\'s link graph. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Textual reference, e.g. "Genesis.1.1", "Shabbat.2a".' },
        category: {
          type: 'string',
          description: 'Filter to links of this category, case-insensitive (e.g. "Commentary", "Targum"). Default "Commentary".',
        },
        limit: { type: 'number', description: 'Max results (default 25, max 100).' },
      },
      required: ['ref'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'get_text':
        return await getText(args);
      case 'lookup_ref':
        return await lookupRef(args);
      case 'get_commentaries':
        return await getCommentaries(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function getText(args: Record<string, unknown>): Promise<unknown> {
  const ref = reqStr(args, 'ref');
  const language = ((args.language as string | undefined) ?? 'both').toLowerCase();
  const wantEn = language === 'en' || language === 'both';
  const wantHe = language === 'he' || language === 'both';

  const data = (await sefariaGet(`/texts/${encodeURIComponent(ref)}`)) as Record<string, unknown>;
  if (data.error) return { error: 'text not found', ref };

  const english = wantEn ? toSegments(data.text).map(stripHtml).join(' ').trim() : undefined;
  const hebrew = wantHe ? toSegments(data.he).map(stripHtml).join(' ').trim() : undefined;

  return {
    ref: data.ref,
    book: data.book,
    ...(wantEn ? { english } : {}),
    ...(wantHe ? { hebrew } : {}),
    sections: data.sections,
  };
}

async function lookupRef(args: Record<string, unknown>): Promise<unknown> {
  const name = reqStr(args, 'name');
  const data = (await sefariaGet(`/name/${encodeURIComponent(name)}`)) as Record<string, unknown>;
  const completions = Array.isArray(data.completions) ? (data.completions as string[]).slice(0, 20) : [];
  return {
    name,
    is_reference: Boolean(data.is_ref),
    is_book: Boolean(data.is_book),
    completions,
  };
}

async function getCommentaries(args: Record<string, unknown>): Promise<unknown> {
  const ref = reqStr(args, 'ref');
  const category = ((args.category as string | undefined) ?? 'Commentary').trim();
  const limit = Math.min(Math.max(Number(args.limit) || 25, 1), 100);

  const data = await sefariaGet(`/links/${encodeURIComponent(ref)}`);
  if (!Array.isArray(data)) {
    const err = (data as Record<string, unknown>)?.error;
    return { error: err ? String(err) : 'no links found', ref };
  }

  const catLower = category.toLowerCase();
  const filtered = category
    ? data.filter((l) => typeof l?.category === 'string' && l.category.toLowerCase() === catLower)
    : data;

  const commentaries = filtered.slice(0, limit).map((l) => ({
    ref: l?.ref ?? null,
    commentator: l?.collectiveTitle?.en ?? null,
    category: l?.category ?? null,
  }));

  return { ref, count: filtered.length, commentaries };
}

async function sefariaGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) {
    const body = await res.text().then((t) => t.slice(0, 200)).catch(() => '');
    throw new Error(`Sefaria: ${res.status} ${body}`);
  }
  return res.json();
}

/** Normalize a Sefaria text field (string OR nested array of strings) into a flat array of strings. */
function toSegments(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    const out: string[] = [];
    for (const item of value) out.push(...toSegments(item));
    return out;
  }
  return [];
}

/** Strip HTML tags and decode a few common entities for clean text output. */
function stripHtml(s: string): string {
  return s
    // Drop footnote markers and footnote bodies ENTIRELY (tag + inner text),
    // otherwise the footnote prose bleeds into the running translation
    // (e.g. "...create<sup>a</sup><i class=footnote>...note...</i> heaven...").
    .replace(/<sup class="footnote-marker">.*?<\/sup>/gis, '')
    .replace(/<i class="footnote">.*?<\/i>/gis, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&thinsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

function reqStr(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${key}" is missing.`);
  return v;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
