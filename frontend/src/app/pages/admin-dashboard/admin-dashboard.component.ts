import { Component, OnInit } from '@angular/core';
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
        <span class="region-tag">{{ regionCode }}</span>
      </div>

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

        <h2 class="section-heading">{{ i18n.t('admin.active') }} ({{ regionCode }})</h2>
        @for (p of activeProposals; track p.id) {
          <div class="admin-card">
            <div class="admin-card-top">
              <a [routerLink]="['/proposal', p.id]" class="admin-card-title">{{ p.title }}</a>
              <span class="status-badge" data-status="voting">{{ p.status }}</span>
            </div>
            <div class="admin-card-meta">
              ▲ {{ p.yes_count }} · ▼ {{ p.no_count }} · — {{ p.abstain_count }}
              @if (p.deadline) { · {{ p.deadline | date:'shortDate' }} }
            </div>
            <div class="admin-card-actions">
              <button class="nv-btn nv-btn-primary" (click)="finalize(p.id)" [disabled]="finalizing">
                {{ i18n.t('admin.finalize') }}
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
  message = '';

  constructor(public auth: AuthService, private api: ApiService, public i18n: I18nService) { }

  ngOnInit(): void {
    this.loadDashboard();
  }

  loadDashboard(): void {
    this.api.getAdminDashboard().subscribe({
      next: (data) => {
        this.regionCode = data.regionCode;
        this.activeProposals = data.activeProposals;
        this.finalizedProposals = data.finalizedProposals;
        this.communities = data.communities;
        this.recentActions = data.recentActions;
        this.donationStats = data.donationStats;
        this.civicScore = data.civicScore;
      },
      error: () => {
        this.message = 'Failed to load dashboard.';
      },
    });
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
}
