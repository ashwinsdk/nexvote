import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NetworkPreferencesService {
    private lowBandwidth = signal<boolean>(this.readLowBandwidth());
    private online = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

    isLowBandwidth = this.lowBandwidth.asReadonly();
    isOnline = this.online.asReadonly();
    shouldReducePayloads = computed(() => this.lowBandwidth() || !this.online());

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => this.online.set(true));
            window.addEventListener('offline', () => this.online.set(false));
        }
    }

    setLowBandwidth(value: boolean): void {
        this.lowBandwidth.set(value);
        try {
            localStorage.setItem('nv_low_bandwidth', value ? '1' : '0');
        } catch {
            // Ignore storage write errors (private mode/quota) and keep in-memory preference.
        }
    }

    private readLowBandwidth(): boolean {
        if (typeof localStorage === 'undefined') {
            return false;
        }
        try {
            return localStorage.getItem('nv_low_bandwidth') === '1';
        } catch {
            return false;
        }
    }
}
