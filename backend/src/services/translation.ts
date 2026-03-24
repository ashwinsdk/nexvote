import logger from '../logger';

export type Locale = 'en' | 'ta' | 'hi' | 'kn' | 'ml' | 'te';

const FRANC_TO_LOCALE: Record<string, Locale> = {
    eng: 'en',
    tam: 'ta',
    hin: 'hi',
    kan: 'kn',
    mal: 'ml',
    tel: 'te',
};

const SUPPORTED_LOCALES: Locale[] = ['en', 'ta', 'hi', 'kn', 'ml', 'te'];

const translationCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 1000;

const cacheKey = (text: string, source: Locale, target: Locale) =>
    `${source}:${target}:${text}`;

let francModule: any = null;
const loadFranc = async () => {
    if (!francModule) {
        francModule = await import('franc');
    }
    return francModule.franc;
};

let googleTranslateFn: any = null;
const providerWarnTracker = new Map<string, number>();
const loadGoogleTranslate = async () => {
    if (!googleTranslateFn) {
        const mod: any = await import('@vitalets/google-translate-api');
        googleTranslateFn = mod.translate || mod.default || mod;
    }
    return googleTranslateFn;
};

const googleTranslate = async (
    text: string,
    source: Locale,
    target: Locale
): Promise<string> => {
    try {
        const translate = await loadGoogleTranslate();
        const result = await translate(text, { from: source, to: target });
        const translatedText = result?.text;
        return typeof translatedText === 'string' && translatedText.trim().length > 0
            ? translatedText
            : text;
    } catch (err) {
        logger.warn({ err, source, target }, 'Fallback translation failed, returning original text');
        return text;
    }
};

export const normalizeLocale = (value?: string | null): Locale => {
    const trimmed = (value || '').toLowerCase().trim();
    if (SUPPORTED_LOCALES.includes(trimmed as Locale)) {
        return trimmed as Locale;
    }
    return 'en';
};

export const detectLocale = async (text: string): Promise<Locale> => {
    const sample = text.trim();
    if (sample.length < 3) {
        return 'en';
    }

    try {
        const franc = await loadFranc();
        const lang = franc(sample, { minLength: 3 });
        return FRANC_TO_LOCALE[lang] || 'en';
    } catch (err) {
        logger.warn({ err }, 'Failed to detect language');
        return 'en';
    }
};

export const translateText = async (
    text: string,
    source: Locale,
    target: Locale
): Promise<string> => {
    if (!text || source === target) {
        return text;
    }

    const key = cacheKey(text, source, target);
    const cached = translationCache.get(key);
    if (cached) {
        return cached;
    }

    try {
        const translation = await googleTranslate(text, source, target);
        if (translationCache.size >= MAX_CACHE_ENTRIES) {
            translationCache.clear();
        }
        translationCache.set(key, translation);
        return translation;
    } catch (err) {
        const warnKey = `${source}->${target}`;
        const now = Date.now();
        const lastWarnAt = providerWarnTracker.get(warnKey) || 0;
        if (now - lastWarnAt > 60_000) {
            providerWarnTracker.set(warnKey, now);
            logger.debug(
                { source, target, message: (err as Error)?.message },
                'Google translation failed, returning original text'
            );
        } else {
            logger.debug({ source, target }, 'Google translation failed, returning original text');
        }
        return text;
    }
};

export const localizeField = async (params: {
    english: string | null;
    original?: string | null;
    originalLocale?: Locale | null;
    targetLocale: Locale;
}): Promise<string | null> => {
    const { english, original, originalLocale, targetLocale } = params;

    if (!english) {
        return english;
    }

    if (targetLocale === 'en') {
        return english;
    }

    if (original && originalLocale === targetLocale) {
        return original;
    }

    return translateText(english, 'en', targetLocale);
};
