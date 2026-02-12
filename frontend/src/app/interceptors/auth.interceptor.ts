import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { I18nService } from '../services/i18n.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
    const auth = inject(AuthService);
    const i18n = inject(I18nService);
    const token = auth.getToken();
    const locale = i18n.locale();

    let headers = req.headers.set('X-Locale', locale);
    if (token) {
        headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return next(req.clone({ headers }));
};
