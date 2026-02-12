import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { I18nService } from '../../services/i18n.service';

@Component({
    selector: 'nv-user-search',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    template: `
    <div class="nv-container">
      <h1 class="page-title">{{ i18n.t('user.search.title') }}</h1>
      <p class="page-subtitle">{{ i18n.t('user.search.subtitle') }}</p>

      <div class="search-bar">
        <input class="nv-input" type="text" [placeholder]="i18n.t('user.search.placeholder')" [(ngModel)]="query" (keyup.enter)="search()" />
        <button class="nv-btn nv-btn-primary" (click)="search()" [disabled]="loading">
          {{ loading ? i18n.t('user.search.searching') : i18n.t('user.search.button') }}
        </button>
      </div>

      @if (loading) {
        <div class="results">
          @for (i of [1,2,3]; track i) {
            <div class="skeleton-card skeleton-pulse"></div>
          }
        </div>
      }

      @if (!loading && searched && results.length === 0) {
        <div class="empty-state">
          <p>{{ i18n.t('user.search.empty') }} "{{ query }}"</p>
        </div>
      }

      @if (results.length > 0) {
        <div class="results">
          @for (user of results; track user.id) {
            <a [routerLink]="['/user', user.id]" class="result-card">
              <div class="result-avatar">{{ user.display_name?.charAt(0)?.toUpperCase() || '?' }}</div>
              <div class="result-info">
                <strong class="result-name">{{ user.display_name }}</strong>
                <div class="result-meta">
                  <span class="badge badge-region">{{ user.region_code }}</span>
                  @if (user.role === 'admin' || user.role === 'superadmin') {
                    <span class="badge badge-role">{{ user.role }}</span>
                  }
                </div>
              </div>
              <span class="view-link">View →</span>
            </a>
          }
        </div>
      }
    </div>
  `,
    styles: [`
    .page-title { font-size:clamp(1.75rem,4vw,2.5rem); font-weight:800; letter-spacing:-0.03em; margin-bottom:4px; }
    .page-subtitle { font-size:var(--fs-sm); color:var(--text-secondary); margin-bottom:var(--sp-3); }
    .search-bar { display:flex; gap:var(--sp-1); margin-bottom:var(--sp-3); }
    .search-bar .nv-input { flex:1; }
    .results { display:flex; flex-direction:column; gap:var(--sp-2); }
    .skeleton-card { height:72px; border:2px solid var(--border-strong); border-radius:var(--r-sm); background:var(--surface-alt); }
    .skeleton-pulse { animation:pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    .result-card { display:flex; align-items:center; gap:var(--sp-2); padding:var(--sp-2); border:2px solid var(--border-strong); border-radius:var(--r-sm); background:var(--surface); text-decoration:none; color:inherit; transition:transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease; }
    .result-card:hover { transform:translate(-2px,-2px); box-shadow:4px 4px 0 var(--border-strong); }
    .result-avatar { width:44px; height:44px; border-radius:var(--r-sm); border:2px solid var(--border-strong); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:var(--fs-lg); color:var(--brand-primary); background:var(--surface-alt); flex-shrink:0; }
    .result-info { flex:1; }
    .result-name { font-weight:700; }
    .result-meta { display:flex; gap:6px; margin-top:4px; }
    .badge { display:inline-block; padding:2px 10px; border:2px solid var(--border-strong); border-radius:var(--r-sm); font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
    .badge-region { background:var(--surface-alt); }
    .badge-role { background:var(--success); color:#fff; border-color:var(--success); }
    .view-link { font-size:var(--fs-sm); font-weight:700; color:var(--brand-primary); white-space:nowrap; }
    .empty-state { text-align:center; padding:var(--sp-4); border:2px dashed var(--border-strong); border-radius:var(--r-sm); color:var(--muted); }
    @media (max-width:640px) {
      .search-bar { flex-direction:column; }
    }
  `],
})
export class UserSearchComponent {
    query = '';
    results: any[] = [];
    loading = false;
    searched = false;

    constructor(private api: ApiService, public i18n: I18nService) { }

    search(): void {
        const q = this.query.trim();
        this.searched = true;
        if (!q) {
            this.results = [];
            return;
        }

        this.loading = true;
        this.api.searchUsers(q).subscribe({
            next: (res) => {
                this.results = res.users || [];
                this.loading = false;
            },
            error: () => {
                this.results = [];
                this.loading = false;
            },
        });
    }
}
