import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Community } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'nv-communities',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="nv-container">
      <div class="page-header">
        <h1 class="page-title">{{ i18n.t('communities.title') }}</h1>
        <p class="page-subtitle">{{ i18n.t('communities.subtitle') }}</p>
      </div>

      <!-- Controls -->
      <div class="controls">
        <input
          type="text"
          class="nv-input search-input"
          [placeholder]="i18n.t('communities.search')"
          [(ngModel)]="searchQuery"
          (input)="onSearch()"
        />
        <select class="nv-input filter-select" [(ngModel)]="selectedCategory" (change)="loadCommunities()">
          <option value="">{{ i18n.t('communities.all') }}</option>
          <option value="civic">Civic</option>
          <option value="education">Education</option>
          <option value="infrastructure">Infrastructure</option>
          <option value="health">Health</option>
          <option value="environment">Environment</option>
          <option value="other">Other</option>
        </select>
      </div>

      @if (loading) {
        <div class="card-grid">
          @for (s of [1,2,3,4,5,6]; track s) {
            <div class="skeleton-card">
              <div class="skeleton skeleton-title-block"></div>
              <div class="skeleton skeleton-text-block"></div>
              <div class="skeleton skeleton-meta-block"></div>
            </div>
          }
        </div>
      }

      @if (!loading) {
        <div class="card-grid">
          @for (community of communities; track community.id) {
            <a [routerLink]="['/community', community.slug]" class="community-card">
              <div class="card-top">
                <h3 class="card-name">{{ community.name }}</h3>
                @if (community.verified) {
                  <span class="verified-badge">✓</span>
                }
              </div>
              <p class="card-desc">
                {{ community.description || 'No description provided.' }}
              </p>
              <div class="card-meta">
                <span class="badge-cat">{{ community.category }}</span>
                <span class="meta-stat">{{ community.member_count }} {{ i18n.t('communities.members') }}</span>
                <span class="meta-stat">{{ community.proposal_count }} {{ i18n.t('communities.proposals') }}</span>
              </div>
            </a>
          }
        </div>
      }

      @if (!loading && communities.length === 0) {
        <div class="empty-state">
          <p>{{ i18n.t('communities.empty') }}</p>
        </div>
      }
    </div>
  `,
  styles: [`
    .page-header {
      padding: var(--sp-4) 0 var(--sp-3);
      border-bottom: 2px solid var(--border);
      margin-bottom: var(--sp-3);
    }

    .page-title {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .page-subtitle {
      font-size: var(--fs-sm);
      color: var(--text-secondary);
    }

    /* ── Controls ── */
    .controls {
      display: flex;
      gap: var(--sp-2);
      margin-bottom: var(--sp-3);
      flex-wrap: wrap;
    }

    .search-input {
      flex: 1;
      min-width: 200px;
    }

    .filter-select {
      width: 180px;
      appearance: auto;
    }

    /* ── Card Grid ── */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: var(--sp-2);
    }

    .community-card {
      display: flex;
      flex-direction: column;
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      text-decoration: none;
      color: inherit;
      transition:
        transform var(--motion-fast) var(--ease-out),
        box-shadow var(--motion-fast) var(--ease-out),
        border-color var(--motion-fast);
    }

    .community-card:hover {
      transform: translate(-2px, -2px);
      box-shadow: 4px 4px 0 var(--border);
      border-color: var(--brand-primary);
      text-decoration: none;
    }

    .card-top {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: var(--sp-1);
    }

    .card-name {
      font-size: var(--fs-base);
      font-weight: 700;
      color: var(--text-primary);
    }

    .verified-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border-radius: 2px;
      background: var(--success);
      color: white;
      font-size: 11px;
      font-weight: 700;
    }

    .card-desc {
      font-size: var(--fs-sm);
      color: var(--text-secondary);
      line-height: 1.5;
      flex: 1;
      margin-bottom: var(--sp-2);
    }

    .card-meta {
      display: flex;
      align-items: center;
      gap: var(--sp-1);
      flex-wrap: wrap;
    }

    .badge-cat {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border: 2px solid var(--brand-primary);
      border-radius: var(--r-sm);
      color: var(--brand-primary-dark);
    }

    .meta-stat {
      font-size: var(--fs-xs);
      color: var(--muted);
      font-weight: 600;
    }

    /* ── Skeleton ── */
    .skeleton-card {
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
    }

    .skeleton {
      background: var(--bg-muted);
      border-radius: var(--r-sm);
      animation: pulse 1.2s ease-in-out infinite;
    }

    .skeleton-title-block { width: 60%; height: 20px; margin-bottom: var(--sp-1); }
    .skeleton-text-block { width: 100%; height: 48px; margin-bottom: var(--sp-2); }
    .skeleton-meta-block { width: 50%; height: 16px; }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── Empty ── */
    .empty-state {
      text-align: center;
      padding: var(--sp-6);
      border: 2px dashed var(--border);
      border-radius: var(--r-sm);
      color: var(--muted);
    }

    /* ── Mobile ── */
    @media (max-width: 768px) {
      .card-grid {
        grid-template-columns: 1fr;
      }

      .controls {
        flex-direction: column;
      }

      .filter-select {
        width: 100%;
      }
    }
  `],
})
export class CommunitiesComponent implements OnInit {
  communities: Community[] = [];
  loading = false;
  searchQuery = '';
  selectedCategory = '';

  private searchTimeout: any;

  constructor(public auth: AuthService, private api: ApiService, public i18n: I18nService) { }

  ngOnInit(): void {
    this.loadCommunities();
  }

  loadCommunities(): void {
    this.loading = true;
    this.api
      .getCommunities({
        search: this.searchQuery || undefined,
        category: this.selectedCategory || undefined,
      })
      .subscribe({
        next: (res) => {
          this.communities = res.communities;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
  }

  onSearch(): void {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.loadCommunities(), 300);
  }
}
