import { Request, Response, NextFunction } from 'express';
import { normalizeLocale, Locale } from '../services/translation';

declare global {
    namespace Express {
        interface Request {
            locale?: Locale;
        }
    }
}

export const localeMiddleware = (req: Request, _res: Response, next: NextFunction) => {
    const headerLocale = req.headers['x-locale'];
    const queryLocale = typeof req.query.lang === 'string' ? req.query.lang : undefined;

    req.locale = normalizeLocale(
        typeof headerLocale === 'string' ? headerLocale : queryLocale
    );
    next();
};
