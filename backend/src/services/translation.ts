import { franc } from 'franc';
import logger from '../logger';
import { aiService } from './ai';

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

export const normalizeLocale = (value?: string | null): Locale => {
    const trimmed = (value || '').toLowerCase().trim();
    if (SUPPORTED_LOCALES.includes(trimmed as Locale)) {
        return trimmed as Locale;
    }
    return 'en';
};

export const detectLocale = (text: string): Locale => {
    const sample = text.trim();
    if (sample.length < 3) {
        return 'en';
    }

    const lang = franc(sample, { minLength: 3 });
    return FRANC_TO_LOCALE[lang] || 'en';
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
        const translation = await aiService.translate(text, source, target);
        if (translationCache.size >= MAX_CACHE_ENTRIES) {
            translationCache.clear();
        }
        translationCache.set(key, translation);
        return translation;
    } catch (err) {
        logger.warn({ err, source, target }, 'Translation failed, returning original text');
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
