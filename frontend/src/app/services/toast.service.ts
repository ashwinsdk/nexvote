import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
    message = signal('');
    visible = signal(false);
    private timeout: any;

    show(message: string, duration = 2200): void {
        clearTimeout(this.timeout);
        this.message.set(message);
        this.visible.set(true);
        this.timeout = setTimeout(() => {
            this.visible.set(false);
        }, duration);
    }
}
