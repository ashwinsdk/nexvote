import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'nv-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="nv-container">
      <div class="auth-page">
        <h1 class="auth-title">{{ i18n.t('auth.register.title') }}</h1>
        <p class="auth-subtitle">{{ i18n.t('auth.register.subtitle') }}</p>

        @if (error) {
          <div class="error-banner">{{ error }}</div>
        }

        <form (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label class="form-label" for="displayName">{{ i18n.t('auth.displayname') }}</label>
            <input id="displayName" type="text" class="nv-input" [(ngModel)]="displayName" name="displayName" [placeholder]="i18n.t('auth.placeholder.displayname')" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="email">{{ i18n.t('auth.email') }}</label>
            <input id="email" type="email" class="nv-input" [(ngModel)]="email" name="email" [placeholder]="i18n.t('auth.placeholder.email')" required autocomplete="email" />
          </div>
          <div class="form-group">
            <label class="form-label" for="password">{{ i18n.t('auth.password') }}</label>
            <input id="password" type="password" class="nv-input" [(ngModel)]="password" name="password" [placeholder]="i18n.t('auth.placeholder.password')" required minlength="8" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label class="form-label" for="regionCode">{{ i18n.t('auth.region') }}</label>
            <select id="regionCode" class="nv-input" [(ngModel)]="regionCode" name="regionCode" required>
              <option value="" disabled>{{ i18n.t('auth.placeholder.region') }}</option>
              <option value="IN-KA-BLR">Bangalore, Karnataka</option>
              <option value="IN-MH-MUM">Mumbai, Maharashtra</option>
              <option value="IN-DL-DEL">New Delhi</option>
              <option value="IN-TN-CHN">Chennai, Tamil Nadu</option>
              <option value="IN-KA-MYS">Mysore, Karnataka</option>
            </select>
          </div>

          <div class="proto-notice">
            Simulated / prototype only — No real identity documents are collected or stored.
          </div>

          <button type="submit" class="nv-btn nv-btn-primary submit-btn" [disabled]="submitting">
            {{ submitting ? 'Creating account...' : i18n.t('auth.register.title') }}
          </button>
        </form>

        <p class="auth-footer">
          {{ i18n.t('auth.hasaccount') }} <a routerLink="/login">{{ i18n.t('auth.signinlink') }}</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { max-width:420px; margin:var(--sp-6) auto; text-align:center; }
    .auth-title { font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; letter-spacing:-0.03em; margin-bottom:4px; }
    .auth-subtitle { font-size:var(--fs-sm); color:var(--text-secondary); margin-bottom:var(--sp-3); }
    .auth-form { text-align:left; }
    .form-group { margin-bottom:var(--sp-2); }
    .form-label { display:block; font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-primary); margin-bottom:6px; }
    .error-banner { padding:var(--sp-1) var(--sp-2); border:2px solid var(--danger); border-radius:var(--r-sm); font-size:var(--fs-sm); color:var(--danger); background:rgba(220,38,38,0.06); margin-bottom:var(--sp-2); animation:shake 0.4s ease; }
    @keyframes shake { 10%,90%{transform:translateX(-1px)} 20%,80%{transform:translateX(2px)} 30%,50%,70%{transform:translateX(-3px)} 40%,60%{transform:translateX(3px)} }
    .proto-notice { margin-bottom:var(--sp-2); padding:var(--sp-1) var(--sp-2); border:2px solid var(--warning); border-radius:var(--r-sm); font-size:var(--fs-xs); color:var(--muted); text-align:center; }
    select.nv-input { appearance:auto; }
    .submit-btn { width:100%; padding:14px; font-size:var(--fs-sm); }
    .auth-footer { margin-top:var(--sp-3); font-size:var(--fs-sm); color:var(--muted); }
    .auth-footer a { color:var(--brand-primary); font-weight:700; }
  `],
})
export class RegisterComponent {
  displayName = '';
  email = '';
  password = '';
  regionCode = '';
  error = '';
  submitting = false;

  constructor(private auth: AuthService, private router: Router, public i18n: I18nService) { }

  onSubmit(): void {
    if (!this.displayName || !this.email || !this.password || !this.regionCode) {
      this.error = 'All fields are required.';
      return;
    }

    if (this.password.length < 8) {
      this.error = 'Password must be at least 8 characters.';
      return;
    }

    this.submitting = true;
    this.error = '';

    this.auth
      .register({
        email: this.email,
        password: this.password,
        displayName: this.displayName,
        regionCode: this.regionCode,
      })
      .subscribe({
        next: () => {
          this.router.navigate(['/verify'], { queryParams: { email: this.email } });
        },
        error: (err) => {
          if (err.status === 409) {
            this.router.navigate(['/verify'], { queryParams: { email: this.email } });
            return;
          }
          this.error = err.error?.error || 'Registration failed.';
          this.submitting = false;
        },
      });
  }
}
