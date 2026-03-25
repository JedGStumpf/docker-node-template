/**
 * ContentService — fetches and caches the class catalog from content.json.
 * Filters for classes with requestable: true.
 */

export interface ClassRecord {
  slug: string;
  title: string;
  description?: string;
  ageRange?: string;
  topics?: string[];
  typicalDurationMinutes?: number;
  equipmentNeeded?: string[];
  requestable: boolean;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ContentService {
  private cache: ClassRecord[] | null = null;
  private cacheExpiresAt = 0;
  private ttlMs: number;
  private contentUrl: string;

  constructor(contentUrl?: string, ttlMs?: number) {
    // Explicit empty string means "no URL" — don't fall back to env var.
    // Undefined means "use env var default".
    this.contentUrl = contentUrl !== undefined ? contentUrl : (process.env.CONTENT_JSON_URL || '');
    this.ttlMs = ttlMs !== undefined ? ttlMs : (Number(process.env.CONTENT_CACHE_TTL_MS) || DEFAULT_TTL_MS);
  }

  private async fetchClasses(): Promise<ClassRecord[]> {
    if (!this.contentUrl) {
      return [];
    }

    let data: any;
    if (this.contentUrl.startsWith('file://')) {
      // Local file — read directly (used in test environment)
      const { readFile } = await import('fs/promises');
      const { fileURLToPath } = await import('url');
      const filePath = fileURLToPath(this.contentUrl);
      const contents = await readFile(filePath, 'utf-8');
      data = JSON.parse(contents);
    } else {
      const resp = await fetch(this.contentUrl);
      if (!resp.ok) {
        throw new Error(`ContentService: failed to fetch content.json (${resp.status})`);
      }
      data = await resp.json();
    }
    // Handle both array format and { classes: [...] } format
    const items: any[] = Array.isArray(data) ? data : (data.classes || []);
    return items.map((item: any) => ({
      slug: item.slug,
      title: item.title,
      description: item.description,
      ageRange: item.ageRange || item.age_range,
      topics: item.topics || [],
      typicalDurationMinutes: item.typicalDurationMinutes || item.typical_duration_minutes,
      equipmentNeeded: item.equipmentNeeded || item.equipment_needed || [],
      requestable: Boolean(item.requestable),
    }));
  }

  async getRequestableClasses(): Promise<ClassRecord[]> {
    const now = Date.now();
    if (!this.cache || now >= this.cacheExpiresAt) {
      const all = await this.fetchClasses();
      this.cache = all.filter((c) => c.requestable);
      this.cacheExpiresAt = now + this.ttlMs;
    }
    return this.cache;
  }

  async getClassBySlug(slug: string): Promise<ClassRecord | null> {
    const classes = await this.getRequestableClasses();
    return classes.find((c) => c.slug === slug) || null;
  }

  /** Force-invalidate the cache (useful in tests). */
  invalidateCache() {
    this.cache = null;
    this.cacheExpiresAt = 0;
  }
}
