import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, Community, Proposal } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'nv-community-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="nv-container">
      @if (loading) {
        <div class="skeleton-hero">
          <div class="skeleton skeleton-h1"></div>
          <div class="skeleton skeleton-p"></div>
          <div class="skeleton skeleton-p short"></div>
        </div>
      }

      @if (community) {
        <!-- Hero -->
        <section class="community-hero">
          <div class="hero-top">
            <h1 class="hero-name">{{ community.name }}</h1>
            @if (community.verified) {
              <span class="verified-tag">VERIFIED</span>
            }
          </div>
          <p class="hero-desc">{{ community.description }}</p>
          <div class="hero-stats">
            <span class="stat"><strong>{{ community.member_count }}</strong> {{ i18n.t('communities.members') }}</span>
            <span class="stat-divider"></span>
            <span class="stat"><strong>{{ community.proposal_count }}</strong> {{ i18n.t('communities.proposals') }}</span>
            <span class="stat-divider"></span>
            <span class="badge-cat">{{ community.category }}</span>
            <span class="stat-divider"></span>
            <span class="stat region-tag">{{ community.region_code }}</span>
          </div>
          <div class="hero-actions">
            @if (auth.isLoggedIn()) {
              <button
                class="nv-btn"
                [class.nv-btn-outline]="!isMember"
                [class.nv-btn-joined]="isMember"
                (click)="joinCommunity()"
                [disabled]="joining || isMember || !canJoin"
              >
                {{ joining ? i18n.t('community.joining') : (isMember ? '✓ ' + i18n.t('community.joined') : (canJoin ? i18n.t('community.join') : i18n.t('community.noteligible'))) }}
              </button>
              <a [routerLink]="['/proposals/new']" [queryParams]="{ communityId: community.id, slug: community.slug }"
                 class="nv-btn nv-btn-primary">
                {{ i18n.t('community.newproposal') }}
              </a>
            }
          </div>

          @if (!canJoin && joinReason) {
            <div class="message message-error">{{ joinReason }}</div>
          }
          @if (joinMessage) {
            <div class="message"
              [class.message-success]="joinMessage.includes('success') || joinMessage.includes('approved')"
              [class.message-warning]="joinMessage.includes('pending') || joinMessage.includes('awaiting')"
              [class.message-error]="joinMessage.includes('Failed') || joinMessage.includes('error')">
              {{ joinMessage }}
            </div>
          }
        </section>

        <div class="section-divider"></div>

        <h2 class="section-heading">{{ i18n.t('community.proposals') }}</h2>

        @for (proposal of proposals; track proposal.id) {
          <a [routerLink]="['/proposal', proposal.id]" class="proposal-card">
            <div class="proposal-meta">
              <span class="nv-badge nv-badge-primary">{{ proposal.category }}</span>
              <a class="meta-author" [routerLink]="['/user', proposal.author_id]" (click)="$event.stopPropagation()">
                {{ i18n.t('proposal.by') }} {{ proposal.author_name }}
              </a>
            </div>
            <h3 class="proposal-title">{{ proposal.title }}</h3>
            <p class="proposal-text">
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

        @if (!loadingProposals && proposals.length === 0) {
          <div class="empty-state">
            <p>{{ i18n.t('community.empty') }}</p>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    /* ── Hero ── */
    .community-hero {
      padding: var(--sp-4) 0;
    }

    .hero-top {
      display: flex;
      align-items: center;
      gap: var(--sp-1);
      margin-bottom: 8px;
    }

    .hero-name {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-primary);
    }

    .verified-tag {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 10px;
      background: var(--success);
      color: white;
      border-radius: var(--r-sm);
    }

    .hero-desc {
      font-size: var(--fs-sm);
      color: var(--text-secondary);
      line-height: 1.6;
      max-width: 600px;
      margin-bottom: var(--sp-2);
    }

    .hero-stats {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      flex-wrap: wrap;
      margin-bottom: var(--sp-3);
    }

    .stat {
      font-size: var(--fs-sm);
      color: var(--muted);
    }

    .stat strong {
      font-weight: 800;
      color: var(--text-primary);
    }

    .stat-divider {
      width: 2px;
      height: 16px;
      background: var(--border);
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

    .region-tag {
      font-weight: 700;
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .hero-actions {
      display: flex;
      gap: var(--sp-2);
      flex-wrap: wrap;
    }

    .nv-btn-joined {
      background: var(--success);
      color: white;
      border: 2px solid var(--success);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: var(--fs-xs);
      padding: 10px 20px;
    }

    /* ── Messages ── */
    .message {
      margin-top: var(--sp-2);
      padding: var(--sp-1) var(--sp-2);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      font-size: var(--fs-sm);
    }

    .message-success {
      border-color: var(--success);
      color: var(--success);
      background: rgba(22,163,74,0.06);
    }

    .message-warning {
      border-color: var(--warning);
      color: var(--warning);
      background: rgba(234,179,8,0.06);
    }

    .message-error {
      border-color: var(--danger);
      color: var(--danger);
      background: rgba(220,38,38,0.06);
    }

    /* ── Section ── */
    .section-divider {
      height: 2px;
      background: var(--border);
      margin: var(--sp-2) 0;
    }

    .section-heading {
      font-size: var(--fs-lg);
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-primary);
      margin-bottom: var(--sp-2);
    }

    /* ── Proposal Cards ── */
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
    }

    .meta-author {
      font-size: var(--fs-xs);
      color: var(--muted);
      font-weight: 600;
      text-decoration: none;
    }

    .meta-author:hover {
      color: var(--brand-primary);
    }

    .proposal-title {
      font-size: var(--fs-base);
      font-weight: 700;
      margin-bottom: 6px;
      color: var(--text-primary);
    }

    .proposal-text {
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

    .status-badge[data-status="voting"] { border-color: var(--warning); color: var(--warning); }
    .status-badge[data-status="passed"],
    .status-badge[data-status="implemented"] { border-color: var(--success); color: var(--success); }
    .status-badge[data-status="failed"] { border-color: var(--danger); color: var(--danger); }

    /* ── Skeleton ── */
    .skeleton-hero { padding: var(--sp-4) 0; }
    .skeleton { background: var(--bg-muted); border-radius: var(--r-sm); animation: pulse 1.2s ease-in-out infinite; }
    .skeleton-h1 { width: 50%; height: 32px; margin-bottom: var(--sp-2); }
    .skeleton-p { width: 80%; height: 16px; margin-bottom: var(--sp-1); }
    .skeleton-p.short { width: 40%; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

    .empty-state {
      text-align: center;
      padding: var(--sp-6);
      border: 2px dashed var(--border);
      border-radius: var(--r-sm);
      color: var(--muted);
    }

    @media (max-width: 768px) {
      .hero-stats {
        gap: var(--sp-1);
      }
      .stat-divider { display: none; }
    }
  `],
})
export class CommunityDetailComponent implements OnInit {
  community: Community | null = null;
  proposals: Proposal[] = [];
  loading = true;
  loadingProposals = true;
  joining = false;
  isMember = false;
  canJoin = true;
  joinReason = '';
  joinMessage = '';

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private route: ActivatedRoute,
    public i18n: I18nService,
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug')!;
    this.api.getCommunity(slug).subscribe({
      next: (community) => {
        this.community = community;
        this.loading = false;
        this.loadProposals(community.id);
        if (this.auth.isLoggedIn()) {
          this.loadMembership(community.slug);
        }
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  loadProposals(communityId: string): void {
    this.api.getProposals({ communityId }).subscribe({
      next: (res) => {
        this.proposals = res.proposals;
        this.loadingProposals = false;
      },
      error: () => {
        this.loadingProposals = false;
      },
    });
  }

  loadMembership(slug: string): void {
    this.api.getCommunityMembership(slug).subscribe({
      next: (res) => {
        this.isMember = res.isMember;
        this.canJoin = res.canJoin;
        this.joinReason = res.canJoin ? '' : res.reason;
      },
      error: () => {
        this.canJoin = false;
        this.joinReason = 'Unable to verify eligibility. Try again later.';
      },
    });
  }

  joinCommunity(): void {
    if (!this.community) return;
    if (this.isMember || !this.canJoin) return;
    this.joining = true;
    this.joinMessage = '';

    this.api.joinCommunity(this.community.slug).subscribe({
      next: (res) => {
        this.joinMessage = res.message;
        this.joining = false;
        this.isMember = true;
        // Reload community to update member count
        if (this.community) {
          this.api.getCommunity(this.community.slug).subscribe({
            next: (community) => {
              this.community = community;
            },
          });
        }
      },
      error: (err) => {
        if (err.status === 409) {
          this.isMember = true;
          this.joinMessage = 'You are already a member of this community.';
        } else {
          this.joinMessage = err.error?.error || 'Failed to join community.';
        }
        this.joining = false;
      },
    });
  }
}
