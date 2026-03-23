import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, Proposal } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

@Component({
  selector: 'nv-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="nv-container">
      <div class="page-header">
        <h1 class="page-title">{{ i18n.t('admin.title') }}</h1>
        <span class="region-tag">{{ regionCode || auth.user()?.regionCode || '-' }}</span>
        <button class="nv-btn nv-btn-outline refresh-btn" (click)="refreshNow()" [disabled]="loading">
          {{ i18n.t('admin.refresh') }}
        </button>
        <span class="live-pill">{{ i18n.t('admin.live') }}</span>
      </div>
      <p class="updated-at">{{ i18n.t('admin.lastupdated') }} {{ lastUpdated | date:'shortTime' }}</p>

      @if (!auth.isAdmin()) {
        <div class="access-denied">
          <p>{{ i18n.t('admin.noaccess') }}</p>
        </div>
      } @else {
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">{{ activeProposals.length }}</span>
            <span class="stat-label">{{ i18n.t('admin.active') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ finalizedProposals.length }}</span>
            <span class="stat-label">{{ i18n.t('admin.finalized') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ civicScore }}</span>
            <span class="stat-label">{{ i18n.t('admin.civicscore') }}</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ donationStats.totalDonations | currency:'INR' }}</span>
            <span class="stat-label">{{ i18n.t('admin.donations') }}</span>
          </div>
        </div>

        <h2 class="section-heading">{{ i18n.t('admin.active') }} ({{ regionCode || auth.user()?.regionCode || '-' }})</h2>
        @for (p of activeProposals; track p.id) {
          <div class="admin-card">
            <div class="admin-card-top">
              <a [routerLink]="['/proposal', p.id]" class="admin-card-title">{{ p.title }}</a>
              <span class="status-badge" data-status="voting">{{ p.status }}</span>
            </div>
            <div class="admin-card-meta">
              ▲ {{ p.yes_count }} · ▼ {{ p.no_count }} · — {{ p.abstain_count }}
              @if (p.deadline) { · {{ p.deadline | date:'shortDate' }} }
              @if (p.deadline) { · {{ getDeadlineState(p.deadline) }} }
            </div>
            <div class="admin-card-actions">
              <button class="nv-btn nv-btn-primary" (click)="finalize(p.id)" [disabled]="finalizing">
                {{ i18n.t('admin.finalize') }}
              </button>
              <input
                type="number"
                class="nv-input extend-days-input"
                min="1"
                max="30"
                [value]="getExtendDays(p.id)"
                (input)="setExtendDays(p.id, $event)"
              />
              <button class="nv-btn nv-btn-outline" (click)="extendVoting(p.id, getExtendDays(p.id))" [disabled]="finalizing">
                {{ i18n.t('admin.extendcustom') }}
              </button>
              <button class="nv-btn nv-btn-outline" (click)="archiveProposal(p.id)" [disabled]="finalizing">
                {{ i18n.t('admin.archive') }}
              </button>
            </div>
          </div>
        }
        @if (activeProposals.length === 0) {
          <p class="empty-msg">{{ i18n.t('admin.noactive') }}</p>
        }

        <h2 class="section-heading">{{ i18n.t('admin.finalized') }}</h2>
        @for (p of finalizedProposals; track p.id) {
          <div class="admin-card">
            <div class="admin-card-top">
              <a [routerLink]="['/proposal', p.id]" class="admin-card-title">{{ p.title }}</a>
              <span class="status-badge" [attr.data-status]="p.status">{{ p.status }}</span>
            </div>
            @if (p.status === 'passed') {
              <div class="admin-card-actions">
                <button class="nv-btn nv-btn-outline" (click)="markImplemented(p.id)" [disabled]="finalizing">
                  {{ i18n.t('admin.implement') }}
                </button>
                <button class="nv-btn nv-btn-outline" (click)="archiveProposal(p.id)" [disabled]="finalizing">
                  {{ i18n.t('admin.archive') }}
                </button>
              </div>
            } @else if (p.status === 'archived') {
              <div class="admin-card-actions">
                <button class="nv-btn nv-btn-outline" (click)="unarchiveProposal(p.id)" [disabled]="finalizing">
                  {{ i18n.t('admin.unarchive') }}
                </button>
              </div>
            } @else {
              <div class="admin-card-actions">
                <button class="nv-btn nv-btn-outline" (click)="archiveProposal(p.id)" [disabled]="finalizing">
                  {{ i18n.t('admin.archive') }}
                </button>
              </div>
            }
          </div>
        }

        @if (message) {
          <div class="status-msg">{{ message }}</div>
        }

        <h2 class="section-heading">{{ i18n.t('admin.actions') }}</h2>
        @for (action of recentActions; track action.id) {
          <div class="action-card">
            <div>
              <strong>{{ action.action_type }}</strong>
              @if (action.admin_name) { ({{ action.admin_name }}) }
              @if (action.description) { — {{ action.description }} }
            </div>
            <span class="action-date">{{ action.created_at | date:'short' }}</span>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      align-items: center;
      gap: var(--sp-2);
      padding: var(--sp-4) 0 var(--sp-3);
      border-bottom: 2px solid var(--border);
      margin-bottom: var(--sp-3);
    }
    .page-title {
      font-size: clamp(1.5rem, 4vw, 2.25rem);
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .region-tag {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 3px 10px;
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      color: var(--muted);
    }
    .refresh-btn {
      margin-left: auto;
    }
    .live-pill {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 4px 10px;
      border: 2px solid var(--success);
      border-radius: var(--r-sm);
      color: var(--success);
      background: rgba(22,163,74,0.06);
    }
    .updated-at {
      margin-top: -6px;
      margin-bottom: var(--sp-3);
      font-size: var(--fs-xs);
      color: var(--muted);
      text-align: right;
    }
    .access-denied {
      padding: var(--sp-6);
      border: 2px dashed var(--border);
      border-radius: var(--r-sm);
      text-align: center;
      color: var(--muted);
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--sp-2);
      margin-bottom: var(--sp-4);
    }
    .stat-card {
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      text-align: center;
    }
    .stat-value {
      display: block;
      font-size: var(--fs-2xl);
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .stat-label {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
    }
    .section-heading {
      font-size: var(--fs-base);
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-primary);
      margin: var(--sp-4) 0 var(--sp-2);
      padding-bottom: var(--sp-1);
      border-bottom: 2px solid var(--border);
    }
    .admin-card {
      padding: var(--sp-2);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-2);
    }
    .admin-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-1);
      margin-bottom: 6px;
    }
    .admin-card-title {
      font-weight: 700;
      font-size: var(--fs-sm);
      color: var(--text-primary);
      text-decoration: none;
    }
    .admin-card-title:hover { color: var(--brand-primary); }
    .status-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 8px;
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
    }
    .status-badge[data-status="voting"] { border-color: var(--warning); color: var(--warning); }
    .status-badge[data-status="passed"],
    .status-badge[data-status="implemented"] { border-color: var(--success); color: var(--success); }
    .status-badge[data-status="failed"] { border-color: var(--danger); color: var(--danger); }
    .admin-card-meta {
      font-size: var(--fs-xs);
      color: var(--muted);
      font-weight: 600;
      margin-bottom: var(--sp-1);
    }
    .admin-card-actions {
      display: flex;
      gap: var(--sp-1);
      flex-wrap: wrap;
    }
    .extend-days-input {
      width: 84px;
      min-height: 40px;
    }
    .status-msg {
      margin-top: var(--sp-2);
      padding: var(--sp-1) var(--sp-2);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      font-size: var(--fs-sm);
      background: var(--bg-muted);
    }
    .action-card {
      padding: var(--sp-1) var(--sp-2);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-1);
      font-size: var(--fs-sm);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
    }
    .action-card > div {
      flex: 1;
    }
    .action-date {
      font-size: var(--fs-xs);
      color: var(--muted);
      white-space: nowrap;
      flex-shrink: 0;
    }
    .empty-msg {
      text-align: center;
      padding: var(--sp-4);
      color: var(--muted);
      font-size: var(--fs-sm);
    }
  `],
})
export class AdminDashboardComponent implements OnInit {
  regionCode = '';
  activeProposals: Proposal[] = [];
  finalizedProposals: Proposal[] = [];
  communities: any[] = [];
  recentActions: any[] = [];
  donationStats = { totalDonations: 0, donationCount: 0 };
  civicScore = 0;
  finalizing = false;
  loading = false;
  message = '';
  lastUpdated = new Date();
  extendDaysMap: Record<string, number> = {};
  private refreshTimer: any = null;

  constructor(public auth: AuthService, private api: ApiService, public i18n: I18nService) { }

  ngOnInit(): void {
    this.startAutoRefresh();
    this.loadDashboard();
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  loadDashboard(): void {
    this.loading = true;
    this.api.getAdminDashboard().subscribe({
      next: (data) => {
        this.regionCode = data.regionCode;
        this.activeProposals = data.activeProposals;
        this.finalizedProposals = data.finalizedProposals;
        this.communities = data.communities;
        this.recentActions = data.recentActions;
        this.donationStats = data.donationStats;
        this.civicScore = data.civicScore;
        this.lastUpdated = new Date();
        this.loading = false;
      },
      error: () => {
        this.message = 'Failed to load dashboard.';
        this.loading = false;
      },
    });
  }

  refreshNow(): void {
    this.loadDashboard();
  }

  private startAutoRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.loadDashboard();
    }, 15000);
  }

  getDeadlineState(deadline: string): string {
    const deadlineDate = new Date(deadline).getTime();
    const now = Date.now();
    const diff = deadlineDate - now;

    if (diff <= 0) {
      return 'ended';
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 24) {
      return `${hours}h left`;
    }

    const days = Math.ceil(hours / 24);
    return `${days}d left`;
  }

  finalize(proposalId: string): void {
    this.finalizing = true;
    this.message = '';
    this.api.finalizeProposal(proposalId).subscribe({
      next: (res) => {
        this.message = res.message;
        this.loadDashboard();
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to finalize.';
        this.finalizing = false;
      },
    });
  }

  extendVoting(proposalId: string, days: number): void {
    const safeDays = Number.isInteger(days) ? Math.min(30, Math.max(1, days)) : 3;
    this.finalizing = true;
    this.message = '';
    this.api.extendProposalDeadline(proposalId, safeDays, `Extended by admin for ${safeDays} day(s).`).subscribe({
      next: (res) => {
        this.message = res.message;
        this.loadDashboard();
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to extend deadline.';
        this.finalizing = false;
      },
    });
  }

  markImplemented(proposalId: string): void {
    this.finalizing = true;
    this.message = '';
    this.api.updateProposalStatus(proposalId, 'implemented', 'Marked as implemented by admin.').subscribe({
      next: (res) => {
        this.message = res.message;
        this.loadDashboard();
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to update status.';
        this.finalizing = false;
      },
    });
  }

  archiveProposal(proposalId: string): void {
    this.finalizing = true;
    this.message = '';
    this.api.updateProposalStatus(proposalId, 'archived', 'Archived by admin.').subscribe({
      next: (res) => {
        this.message = res.message;
        this.loadDashboard();
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to archive proposal.';
        this.finalizing = false;
      },
    });
  }

  unarchiveProposal(proposalId: string): void {
    this.finalizing = true;
    this.message = '';
    this.api.unarchiveProposal(proposalId).subscribe({
      next: (res) => {
        this.message = res.message;
        this.loadDashboard();
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to unarchive proposal.';
        this.finalizing = false;
      },
    });
  }

  setExtendDays(proposalId: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.extendDaysMap[proposalId] = Number.isFinite(value) ? value : 3;
  }

  getExtendDays(proposalId: string): number {
    return this.extendDaysMap[proposalId] ?? 3;
  }
}
