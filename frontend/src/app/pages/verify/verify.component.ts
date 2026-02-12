import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'nv-verify',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="nv-container">
      <div class="auth-page">
        <h1 class="auth-title">{{ i18n.t('verify.title') }}</h1>
        <p class="auth-subtitle">{{ i18n.t('verify.subtitle') }} <strong>{{ email }}</strong></p>
        <div class="proto-notice">
          Simulated / prototype only — Check backend console for OTP.
        </div>
        @if (error) {
          <div class="error-banner">{{ error }}</div>
        }
        <form (ngSubmit)="onSubmit()" class="auth-form">
          <div class="form-group">
            <label class="form-label" for="otp">{{ i18n.t('verify.code') }}</label>
            <input id="otp" type="text" class="nv-input otp-input" [(ngModel)]="otp" name="otp" placeholder="000000" maxlength="6" pattern="[0-9]{6}" autocomplete="one-time-code" required />
          </div>
          <button type="submit" class="nv-btn nv-btn-primary submit-btn" [disabled]="submitting">
            {{ submitting ? i18n.t('verify.submitting') : i18n.t('verify.submit') }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { max-width:420px; margin:var(--sp-6) auto; text-align:center; }
    .auth-title { font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; letter-spacing:-0.03em; margin-bottom:4px; }
    .auth-subtitle { font-size:var(--fs-sm); color:var(--text-secondary); margin-bottom:var(--sp-2); }
    .auth-form { text-align:left; }
    .form-group { margin-bottom:var(--sp-2); }
    .form-label { display:block; font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-primary); margin-bottom:6px; }
    .otp-input { text-align:center; font-size:var(--fs-2xl); letter-spacing:0.4em; font-weight:800; }
    .error-banner { padding:var(--sp-1) var(--sp-2); border:2px solid var(--danger); border-radius:var(--r-sm); font-size:var(--fs-sm); color:var(--danger); background:rgba(220,38,38,0.06); margin-bottom:var(--sp-2); animation:shake 0.4s ease; }
    @keyframes shake { 10%,90%{transform:translateX(-1px)} 20%,80%{transform:translateX(2px)} 30%,50%,70%{transform:translateX(-3px)} 40%,60%{transform:translateX(3px)} }
    .proto-notice { margin-bottom:var(--sp-2); padding:var(--sp-1) var(--sp-2); border:2px solid var(--warning); border-radius:var(--r-sm); font-size:var(--fs-xs); color:var(--muted); }
    .submit-btn { width:100%; padding:14px; font-size:var(--fs-sm); }
  `],
})
export class VerifyComponent implements OnInit {
  email = '';
  otp = '';
  error = '';
  submitting = false;

  constructor(
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService
  ) { }

  ngOnInit(): void {
    this.email = this.route.snapshot.queryParamMap.get('email') || '';
  }

  onSubmit(): void {
    if (!this.otp || this.otp.length !== 6) {
      this.error = 'Enter a valid 6-digit code.';
      return;
    }

    this.submitting = true;
    this.error = '';

    this.auth.verifyOtp(this.email, this.otp).subscribe({
      next: (res) => {
        this.auth.handleAuthResponse(res);
        this.router.navigate(['/home']);
      },
      error: (err) => {
        this.error = err.error?.error || 'Verification failed.';
        this.submitting = false;
      },
    });
  }
}
