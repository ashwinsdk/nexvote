import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { I18nService } from './services/i18n.service';
import { ToastService } from './services/toast.service';
import { LanguageTrayComponent } from './shared/language-tray.component';

@Component({
  selector: 'nv-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LanguageTrayComponent],
  template: `
    <!-- ── Header ── -->
    <header class="nv-header">
      <nav class="nv-container nv-nav">
        <!-- Logo -->
        <a [routerLink]="auth.isLoggedIn() ? '/home' : '/'" class="nv-logo" aria-label="NexVote Home">
          <img src="assets/nx.png" alt="" class="logo-mark" width="28" height="28" />
          <span class="logo-text">NexVote</span>
        </a>

        <!-- Desktop nav links -->
        <div class="nv-nav-links desktop-nav">
          @if (auth.isLoggedIn()) {
            <a routerLink="/home" routerLinkActive="active" class="nv-nav-link">{{ i18n.t('nav.home') }}</a>
            <a routerLink="/communities" routerLinkActive="active" class="nv-nav-link">{{ i18n.t('nav.communities') }}</a>
            <a routerLink="/users" routerLinkActive="active" class="nv-nav-link">{{ i18n.t('nav.users') }}</a>
            <a [routerLink]="['/user', auth.user()?.id]" routerLinkActive="active" class="nv-nav-link">{{ i18n.t('nav.profile') }}</a>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" routerLinkActive="active" class="nv-nav-link">{{ i18n.t('nav.dashboard') }}</a>
            }
          }
        </div>

        <!-- Right actions -->
        <div class="nv-nav-actions">
          <!-- Language button -->
          <button
            class="lang-btn"
            (click)="showLangTray.set(true)"
            [attr.aria-label]="i18n.t('lang.label')"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span class="lang-code">{{ i18n.locale().toUpperCase() }}</span>
          </button>

          @if (auth.isLoggedIn()) {
            <button (click)="auth.logout()" class="nv-btn nv-btn-outline nv-btn-sm">{{ i18n.t('nav.signout') }}</button>
          } @else {
            <a routerLink="/register" class="nv-btn nv-btn-outline nv-btn-sm">{{ i18n.t('nav.register') }}</a>
            <a routerLink="/login" class="nv-btn nv-btn-primary nv-btn-sm">{{ i18n.t('nav.signin') }}</a>
          }

          <!-- Mobile menu toggle (only when logged in) -->
          @if (auth.isLoggedIn()) {
            <button class="mobile-menu-btn" (click)="mobileMenuOpen.set(!mobileMenuOpen())" aria-label="Menu">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                @if (!mobileMenuOpen()) {
                  <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
                } @else {
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                }
              </svg>
            </button>
          }
        </div>
      </nav>

      <!-- Mobile nav dropdown -->
      @if (mobileMenuOpen()) {
        <div class="mobile-nav">
          @if (auth.isLoggedIn()) {
            <a routerLink="/home" (click)="mobileMenuOpen.set(false)" class="mobile-nav-link">{{ i18n.t('nav.home') }}</a>
            <a routerLink="/communities" (click)="mobileMenuOpen.set(false)" class="mobile-nav-link">{{ i18n.t('nav.communities') }}</a>
            <a routerLink="/users" (click)="mobileMenuOpen.set(false)" class="mobile-nav-link">{{ i18n.t('nav.users') }}</a>
            <a [routerLink]="['/user', auth.user()?.id]" (click)="mobileMenuOpen.set(false)" class="mobile-nav-link">{{ i18n.t('nav.profile') }}</a>
            @if (auth.isAdmin()) {
              <a routerLink="/admin" (click)="mobileMenuOpen.set(false)" class="mobile-nav-link">{{ i18n.t('nav.dashboard') }}</a>
            }
          }
        </div>
      }
    </header>

    <!-- ── Main ── -->
    <main class="nv-main">
      <router-outlet />
    </main>

    <!-- ── Footer ── -->
    <footer class="nv-footer">
      <div class="nv-container footer-content">
        <p class="nv-text-sm" style="color: var(--muted);">
          {{ i18n.t('footer.notice') }}
        </p>
        <div class="dev-badge">
          <span class="nv-text-sm" style="color: var(--muted);">{{ i18n.t('footer.builtwith') }}</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="var(--danger)" stroke="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <span class="nv-text-sm" style="color: var(--muted);">{{ i18n.t('footer.forgovernance') }}</span>
        </div>
      </div>
    </footer>

    <!-- ── Language Tray ── -->
    @if (showLangTray()) {
      <nv-language-tray (close)="showLangTray.set(false)" />
    }

    <!-- ── Toast ── -->
    <div class="nv-toast" [class.show]="toast.visible()">{{ toast.message() }}</div>
  `,
  styles: [`
    /* ── Header ── */
    .nv-header {
      position: sticky;
      top: 0;
      z-index: 100;
      background: var(--bg);
      border-bottom: 2px solid var(--border-strong);
    }

    .nv-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
      gap: var(--sp-2);
    }

    .nv-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      text-decoration: none;
      flex-shrink: 0;
    }

    .logo-mark {
      display: block;
    }

    .logo-text {
      font-size: var(--fs-lg);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-primary);
      text-transform: uppercase;
    }

    .nv-logo:hover .logo-text {
      background: var(--brand-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    /* ── Nav links ── */
    .nv-nav-links {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      justify-content: center;
    }

    .nv-nav-link {
      font-size: var(--fs-xs);
      font-weight: 700;
      color: var(--muted);
      text-decoration: none;
      padding: 6px 12px;
      border-radius: var(--r-sm);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      transition: all var(--motion-fast) var(--ease-out);
      white-space: nowrap;
    }

    .nv-nav-link:hover {
      color: var(--text-primary);
      background: var(--bg-muted);
      text-decoration: none;
    }

    .nv-nav-link.active {
      color: var(--brand-primary-dark);
      background: var(--brand-primary-light);
    }

    /* ── Nav actions ── */
    .nv-nav-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .lang-btn {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 10px;
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      font-size: var(--fs-xs);
      font-weight: 700;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all var(--motion-fast);
    }

    .lang-btn:hover {
      border-color: var(--brand-primary);
      color: var(--brand-primary-dark);
    }

    .lang-code {
      letter-spacing: 0.04em;
    }

    .mobile-menu-btn {
      display: none;
      width: 40px;
      height: 40px;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      cursor: pointer;
      color: var(--text-primary);
      transition: all var(--motion-fast);
    }

    .mobile-menu-btn:hover {
      border-color: var(--border-strong);
    }

    /* ── Mobile nav ── */
    .mobile-nav {
      display: none;
      flex-direction: column;
      border-top: 1px solid var(--border);
      padding: var(--sp-1) var(--sp-2);
      animation: slideDown var(--motion-medium) var(--ease-out);
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .mobile-nav-link {
      display: block;
      padding: 12px 8px;
      font-size: var(--fs-sm);
      font-weight: 700;
      color: var(--text-primary);
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
    }

    .mobile-nav-link:hover {
      color: var(--brand-primary-dark);
      text-decoration: none;
    }

    /* ── Main ── */
    .nv-main {
      min-height: calc(100vh - 56px - 100px);
      padding: var(--sp-3) 0;
    }

    /* ── Footer ── */
    .nv-footer {
      padding: var(--sp-3) 0;
      text-align: center;
      border-top: 2px solid var(--border);
    }

    .footer-content {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      align-items: center;
    }

    .dev-badge {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* ── Responsive ── */
    @media (max-width: 768px) {
      .desktop-nav {
        display: none;
      }

      .mobile-menu-btn {
        display: flex;
      }

      .mobile-nav {
        display: flex;
      }

      .nv-nav-actions .nv-btn {
        display: none;
      }

      .lang-btn .lang-code {
        display: none;
      }
    }

    @media (min-width: 769px) {
      .mobile-menu-btn {
        display: none;
      }

      .mobile-nav {
        display: none !important;
      }
    }
  `],
})
export class AppComponent {
  showLangTray = signal(false);
  mobileMenuOpen = signal(false);

  constructor(
    public auth: AuthService,
    public i18n: I18nService,
    public toast: ToastService
  ) { }
}
