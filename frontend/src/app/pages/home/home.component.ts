import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Proposal } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'nv-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="nv-container">
      <!-- Hero -->
      <section class="hero">
        <h1 class="hero-title">
          <span class="hero-gradient">{{ i18n.t('home.hero.title1') }}</span><br>
          {{ i18n.t('home.hero.title2') }}
        </h1>
        <p class="hero-sub">
          {{ i18n.t('home.hero.subtitle') }}
        </p>
        <div class="hero-actions">
          @if (!auth.isLoggedIn()) {
            <a routerLink="/register" class="nv-btn nv-btn-primary">{{ i18n.t('landing.cta.getstarted') }}</a>
            <a routerLink="/communities" class="nv-btn nv-btn-outline">{{ i18n.t('general.browsecommunitites') }}</a>
          } @else {
            <a routerLink="/communities" class="nv-btn nv-btn-primary">{{ i18n.t('general.browsecommunitites') }}</a>
            <a routerLink="/proposals/new" class="nv-btn nv-btn-outline">{{ i18n.t('general.newproposal') }}</a>
          }
        </div>
      </section>

      <!-- Feed -->
      <section class="feed-section">
        <div class="feed-tabs">
          <button class="feed-tab" [class.active]="activeSort === 'hot'" (click)="loadProposals('hot')">
            {{ i18n.t('home.tab.trending') }}
          </button>
          <button class="feed-tab" [class.active]="activeSort === 'new'" (click)="loadProposals('new')">
            {{ i18n.t('home.tab.new') }}
          </button>
          <button class="feed-tab" [class.active]="activeSort === 'top'" (click)="loadProposals('top')">
            {{ i18n.t('home.tab.top') }}
          </button>
        </div>

        @if (loading) {
          <div class="skeleton-list">
            @for (s of [1,2,3]; track s) {
              <div class="skeleton-card">
                <div class="skeleton skeleton-badge"></div>
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-text"></div>
                <div class="skeleton skeleton-text short"></div>
              </div>
            }
          </div>
        }

        @for (proposal of proposals; track proposal.id) {
          <a [routerLink]="['/proposal', proposal.id]" class="proposal-card">
            <div class="proposal-meta">
              <span class="nv-badge nv-badge-primary">{{ proposal.category }}</span>
              <span class="meta-text">{{ proposal.community_name }}</span>
              <span class="meta-dot">·</span>
              <a class="meta-author" [routerLink]="['/user', proposal.author_id]" (click)="$event.stopPropagation()">
                {{ proposal.author_name }}
              </a>
            </div>
            <h3 class="proposal-title">{{ proposal.title }}</h3>
            <p class="proposal-summary">
              {{ proposal.summary || (proposal.text | slice:0:150) + '...' }}
            </p>
            <div class="proposal-footer">
              <div class="vote-counts">
                <span class="vote-yes">▲ {{ proposal.yes_count }}</span>
                <span class="vote-no">▼ {{ proposal.no_count }}</span>
              </div>
              <span class="status-badge" [attr.data-status]="proposal.status">{{ proposal.status }}</span>
            </div>
          </a>
        }

        @if (!loading && proposals.length === 0) {
          <div class="empty-state">
            <p>{{ i18n.t('home.empty') }}</p>
            <a routerLink="/proposals/new" class="nv-btn nv-btn-primary">{{ i18n.t('general.createproposal') }}</a>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    /* ── Hero ── */
    .hero {
      padding: var(--sp-6) 0 var(--sp-4);
      border-bottom: 2px solid var(--border);
    }

    .hero-title {
      font-size: clamp(2rem, 6vw, 3.2rem);
      font-weight: 800;
      line-height: 0.95;
      letter-spacing: -0.04em;
      color: var(--text-primary);
      margin-bottom: var(--sp-2);
    }

    .hero-gradient {
      background: var(--brand-gradient);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .hero-sub {
      max-width: 480px;
      color: var(--text-secondary);
      line-height: 1.6;
      font-size: var(--fs-sm);
      margin-bottom: var(--sp-3);
    }

    .hero-actions {
      display: flex;
      gap: var(--sp-2);
      flex-wrap: wrap;
    }

    /* ── Feed ── */
    .feed-section {
      padding-top: var(--sp-3);
    }

    .feed-tabs {
      display: flex;
      gap: 0;
      margin-bottom: var(--sp-3);
      border-bottom: 2px solid var(--border);
    }

    .feed-tab {
      background: none;
      border: none;
      padding: var(--sp-1) var(--sp-2);
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      border-bottom: 3px solid transparent;
      margin-bottom: -2px;
      cursor: pointer;
      transition: color var(--motion-fast), border-color var(--motion-fast);
    }

    .feed-tab:hover {
      color: var(--text-primary);
    }

    .feed-tab.active {
      color: var(--brand-primary-dark);
      border-bottom-color: var(--brand-primary-dark);
    }

    /* ── Skeleton ── */
    .skeleton-list {
      display: flex;
      flex-direction: column;
      gap: var(--sp-2);
    }

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

    .skeleton-badge {
      width: 80px;
      height: 22px;
      margin-bottom: var(--sp-1);
    }

    .skeleton-title {
      width: 70%;
      height: 20px;
      margin-bottom: var(--sp-1);
    }

    .skeleton-text {
      width: 100%;
      height: 14px;
      margin-bottom: 6px;
    }

    .skeleton-text.short {
      width: 60%;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* ── Proposal Card ── */
    .proposal-card {
      display: block;
      text-decoration: none;
      color: inherit;
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-2);
      transition:
        transform var(--motion-fast) var(--ease-out),
        box-shadow var(--motion-fast) var(--ease-out),
        border-color var(--motion-fast);
      cursor: pointer;
    }

    .proposal-card:hover {
      transform: translate(-2px, -2px);
      box-shadow: 4px 4px 0 var(--border);
      border-color: var(--brand-primary);
      text-decoration: none;
    }

    .proposal-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: var(--sp-1);
      flex-wrap: wrap;
    }

    .meta-text {
      font-size: var(--fs-xs);
      color: var(--muted);
      font-weight: 600;
    }

    .meta-dot {
      font-size: var(--fs-xs);
      color: var(--border);
    }

    .meta-author {
      font-size: var(--fs-xs);
      color: var(--muted);
      font-weight: 600;
      text-decoration: none;
      transition: color var(--motion-fast);
    }

    .meta-author:hover {
      color: var(--brand-primary);
    }

    .proposal-title {
      font-size: var(--fs-base);
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 6px;
      color: var(--text-primary);
    }

    .proposal-summary {
      font-size: var(--fs-sm);
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: var(--sp-2);
      overflow-wrap: anywhere;
    }

    .proposal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .vote-counts {
      display: flex;
      gap: var(--sp-2);
      font-size: var(--fs-sm);
      font-weight: 700;
    }

    .vote-yes { color: var(--success); }
    .vote-no { color: var(--danger); }

    .status-badge {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 3px 10px;
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
    }

    .status-badge[data-status="voting"] {
      border-color: var(--warning);
      color: var(--warning);
    }

    .status-badge[data-status="passed"],
    .status-badge[data-status="implemented"] {
      border-color: var(--success);
      color: var(--success);
    }

    .status-badge[data-status="failed"] {
      border-color: var(--danger);
      color: var(--danger);
    }

    /* ── Empty ── */
    .empty-state {
      text-align: center;
      padding: var(--sp-6);
      border: 2px dashed var(--border);
      border-radius: var(--r-sm);
    }

    .empty-state p {
      color: var(--muted);
      margin-bottom: var(--sp-2);
    }

    /* ── Mobile ── */
    @media (max-width: 768px) {
      .hero {
        padding: var(--sp-4) 0 var(--sp-3);
      }

      .hero-actions {
        flex-direction: column;
        max-width: 260px;
      }
    }
  `],
})
export class HomeComponent implements OnInit {
  proposals: Proposal[] = [];
  loading = false;
  activeSort = 'hot';

  constructor(public auth: AuthService, private api: ApiService, public i18n: I18nService) { }

  ngOnInit(): void {
    this.loadProposals('hot');
  }

  loadProposals(sort: string): void {
    this.activeSort = sort;
    this.loading = true;

    const params: any = { sort, limit: 20 };

    if (this.auth.isLoggedIn()) {
      this.api.getEligibleProposals(params).subscribe({
        next: (res) => {
          this.proposals = res.proposals;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
    } else {
      this.api.getProposals(params).subscribe({
        next: (res) => {
          this.proposals = res.proposals;
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        },
      });
    }
  }
}
