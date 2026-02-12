import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { I18nService, SUPPORTED_LOCALES, Locale, LocaleInfo } from '../services/i18n.service';
import { ToastService } from '../services/toast.service';

@Component({
    selector: 'nv-language-tray',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="tray-backdrop" (click)="close.emit()">
      <div class="tray" (click)="$event.stopPropagation()">
        <div class="tray-header">
          <h2 class="tray-title">{{ i18n.t('lang.label') }}</h2>
          <button class="tray-close" (click)="close.emit()" aria-label="Close language selector">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="tray-options">
          @for (locale of getLocales(); track locale.code) {
            <button
              class="lang-option"
              [class.active]="locale.code === i18n.locale()"
              (click)="selectLocale(locale.code)"
            >
              <span class="lang-native">{{ locale.nativeName }}</span>
              <span class="lang-name">{{ locale.name }}</span>
              @if (locale.code === i18n.locale()) {
                <svg class="check-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
    styles: [`
    .tray-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 9999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      animation: fadeIn var(--motion-fast, 120ms) ease-out;
    }

    .tray {
      background: var(--bg, #fff);
      width: 100%;
      max-width: 480px;
      border: 2px solid var(--border-strong, #1f1f1f);
      border-bottom: none;
      border-radius: var(--r-sm, 4px) var(--r-sm, 4px) 0 0;
      padding: var(--sp-3, 24px);
      animation: slideUpTray var(--motion-medium, 220ms) cubic-bezier(0.2, 0.9, 0.2, 1);
    }

    @keyframes slideUpTray {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .tray-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--sp-3, 24px);
    }

    .tray-title {
      font-size: var(--fs-lg, 1.25rem);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .tray-close {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--border, #d4d0de);
      border-radius: var(--r-sm, 4px);
      cursor: pointer;
      transition: all var(--motion-fast, 120ms);
    }

    .tray-close:hover {
      border-color: var(--border-strong, #1f1f1f);
      background: var(--bg-muted, #f7f7fa);
    }

    .tray-options {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1, 8px);
    }

    .lang-option {
      display: flex;
      align-items: center;
      gap: var(--sp-2, 16px);
      padding: 14px var(--sp-2, 16px);
      border: 2px solid var(--border, #d4d0de);
      border-radius: var(--r-sm, 4px);
      cursor: pointer;
      font-family: var(--font);
      width: 100%;
      text-align: left;
      transition:
        border-color var(--motion-fast, 120ms),
        background var(--motion-fast, 120ms),
        transform var(--motion-fast, 120ms),
        box-shadow var(--motion-fast, 120ms);
    }

    .lang-option:hover {
      border-color: var(--brand-primary, #a270ff);
      background: var(--bg-muted, #f7f7fa);
    }

    .lang-option.active {
      border-color: var(--brand-primary-dark, #600AFF);
      background: var(--brand-primary-light, #e8dbff);
      box-shadow: 3px 3px 0 var(--brand-primary-dark, #600AFF);
    }

    .lang-native {
      font-size: var(--fs-lg, 1.25rem);
      font-weight: 700;
    }

    .lang-name {
      font-size: var(--fs-sm, 0.875rem);
      color: var(--muted, #7f7f8f);
      flex: 1;
    }

    .check-icon {
      color: var(--brand-primary-dark, #600AFF);
      flex-shrink: 0;
    }

    @media (min-width: 769px) {
      .tray-backdrop {
        align-items: center;
      }

      .tray {
        border-bottom: 2px solid var(--border-strong, #1f1f1f);
        border-radius: var(--r-sm, 4px);
        max-width: 420px;
        animation-name: scaleIn;
      }

      @keyframes scaleIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
    }
  `]
})
export class LanguageTrayComponent {
    @Output() close = new EventEmitter<void>();

    constructor(public i18n: I18nService, private toast: ToastService) { }

    getLocales() {
        return SUPPORTED_LOCALES;
    }

    selectLocale(code: Locale): void {
        const locale = SUPPORTED_LOCALES.find((l: LocaleInfo) => l.code === code);
        this.i18n.setLocale(code);
        this.toast.show(`${this.i18n.t('lang.set')} ${locale?.name ?? code}`);
        this.close.emit();
    }
}
