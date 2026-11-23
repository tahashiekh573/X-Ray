import bundled from '@data/anatomy_content.json';
import type { AnatomyContent, StructureContent } from '@/types/anatomy';

/**
 * Educational content comes from the backend API (GET only, no user data sent). If the API is
 * unreachable (static hosting, offline), the copy bundled at build time from the same source
 * file (data/anatomy_content.json) is used.
 */
export const BUNDLED_CONTENT = bundled as AnatomyContent;

export async function fetchContent(
  fetcher: typeof fetch = fetch,
  timeoutMs = 2500,
): Promise<{ content: AnatomyContent; source: 'api' | 'bundled' }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const [structuresRes, categoriesRes] = await Promise.all([
      fetcher('/api/v1/anatomy/structures', { signal: controller.signal, credentials: 'omit' }),
      fetcher('/api/v1/anatomy/categories', { signal: controller.signal, credentials: 'omit' }),
    ]);
    if (!structuresRes.ok || !categoriesRes.ok) throw new Error('API unavailable');
    const structures = (await structuresRes.json()) as { disclaimer: string; structures: StructureContent[] };
    const categories = (await categoriesRes.json()) as { categories: AnatomyContent['categories'] };
    if (!Array.isArray(structures.structures) || !Array.isArray(categories.categories)) {
      throw new Error('Malformed API response');
    }
    return {
      content: {
        version: BUNDLED_CONTENT.version,
        disclaimer: structures.disclaimer,
        categories: categories.categories,
        structures: structures.structures,
      },
      source: 'api',
    };
  } catch {
    return { content: BUNDLED_CONTENT, source: 'bundled' };
  } finally {
    clearTimeout(timer);
  }
}

export function findStructure(content: AnatomyContent | null, id: string | null): StructureContent | null {
  if (!content || !id) return null;
  return content.structures.find((s) => s.id === id) ?? null;
}
