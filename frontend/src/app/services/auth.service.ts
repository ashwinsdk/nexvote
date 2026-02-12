import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '@env/environment';

export interface User {
    id: string;
    email: string;
    displayName: string;
    regionCode: string;
    role: string;
    signupVerified: boolean;
}

interface AuthResponse {
    token: string;
    user: User;
    message?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
    private currentUser = signal<User | null>(null);
    private token = signal<string | null>(null);

    user = this.currentUser.asReadonly();
    isLoggedIn = computed(() => !!this.token());
    isAdmin = computed(() => {
        const u = this.currentUser();
        return u?.role === 'admin' || u?.role === 'superadmin';
    });

    constructor(private http: HttpClient, private router: Router) {
        this.loadFromStorage();
    }

    private loadFromStorage(): void {
        // Try cookies first (30-day persistence), then fall back to localStorage
        const cookieToken = this.getCookie('nv_token');
        const cookieUser = this.getCookie('nv_user');

        if (cookieToken && cookieUser) {
            this.token.set(cookieToken);
            this.currentUser.set(JSON.parse(decodeURIComponent(cookieUser)));
            // Also sync to localStorage for compatibility
            localStorage.setItem('nv_token', cookieToken);
            localStorage.setItem('nv_user', decodeURIComponent(cookieUser));
        } else {
            // Fallback to localStorage
            const stored = localStorage.getItem('nv_token');
            const user = localStorage.getItem('nv_user');
            if (stored && user) {
                this.token.set(stored);
                this.currentUser.set(JSON.parse(user));
                // Migrate to cookies
                this.setCookie('nv_token', stored, 30);
                this.setCookie('nv_user', encodeURIComponent(user), 30);
            }
        }
    }

    private persist(token: string, user: User): void {
        const userJson = JSON.stringify(user);

        // Set both localStorage and cookies (cookies take precedence)
        localStorage.setItem('nv_token', token);
        localStorage.setItem('nv_user', userJson);

        // Set cookies with 30-day expiry
        this.setCookie('nv_token', token, 30);
        this.setCookie('nv_user', encodeURIComponent(userJson), 30);

        this.token.set(token);
        this.currentUser.set(user);
    }

    private setCookie(name: string, value: string, days: number): void {
        const date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        const expires = `expires=${date.toUTCString()}`;
        document.cookie = `${name}=${value};${expires};path=/;SameSite=Lax`;
    }

    private getCookie(name: string): string | null {
        const nameEQ = name + '=';
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            let cookie = cookies[i];
            while (cookie.charAt(0) === ' ') cookie = cookie.substring(1);
            if (cookie.indexOf(nameEQ) === 0) {
                return cookie.substring(nameEQ.length);
            }
        }
        return null;
    }

    private deleteCookie(name: string): void {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }

    getToken(): string | null {
        return this.token();
    }

    register(data: {
        email: string;
        password: string;
        displayName: string;
        regionCode: string;
    }) {
        return this.http.post<{ message: string; user: User }>(
            `${environment.apiUrl}/auth/register`,
            data
        );
    }

    verifyOtp(email: string, otp: string) {
        return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/verify-otp`, {
            email,
            otp,
        });
    }

    login(email: string, password: string) {
        return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, {
            email,
            password,
        });
    }

    handleAuthResponse(res: AuthResponse): void {
        this.persist(res.token, res.user);
    }

    logout(): void {
        // Clear localStorage
        localStorage.removeItem('nv_token');
        localStorage.removeItem('nv_user');

        // Clear cookies
        this.deleteCookie('nv_token');
        this.deleteCookie('nv_user');

        // Clear signals
        this.token.set(null);
        this.currentUser.set(null);

        // Navigate to landing
        this.router.navigate(['/']);
    }

    fetchProfile() {
        return this.http.get<User>(`${environment.apiUrl}/auth/me`);
    }
}
