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
          <div class="stat-card">
            <span class="stat-value">{{ transparencyTotals.participationRate | number:'1.0-1' }}%</span>
            <span class="stat-label">Participation Rate</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ transparencyTotals.approvalRate | number:'1.0-1' }}%</span>
            <span class="stat-label">Approval Rate</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">{{ transparencyTotals.activeVotes }}</span>
            <span class="stat-label">Active Votes</span>
          </div>
        </div>

        <h2 class="section-heading">Implementation Workspace</h2>
        <div class="settings-card">
          <div class="toggle-grid">
            <label class="toggle-row">Community
              <select class="nv-input" [(ngModel)]="selectedCommunityId" (ngModelChange)="onCommunityFilterChange($event)">
                <option value="all">All communities</option>
                @for (c of communities; track c.id) {
                  <option [value]="c.id">{{ c.name }}</option>
                }
              </select>
            </label>
            <label class="toggle-row">Proposal (community-tagged)
              <select class="nv-input" [(ngModel)]="implementationForm.proposalId" (ngModelChange)="onImplementationProposalChange($event)">
                <option value="">Select proposal</option>
                @for (p of filteredImplementationProposals(); track p.id) {
                  <option [value]="p.id">{{ p.community_name || 'Community' }} · {{ p.title }}</option>
                }
              </select>
            </label>
          </div>
        </div>

        <h2 class="section-heading">Implementation Status</h2>
        @if (implementationStatus.length > 0) {
          @for (item of implementationStatus; track item.status) {
            <div class="action-card impl-status-card">
              <div>
                <strong>{{ labelImplementationStatus(item.status) }}</strong>
                <div class="impl-status-meta">{{ item.count }} proposal(s)</div>
                @if (implementationProposalsByStatus(item.status).length > 0) {
                  <div class="impl-status-list">
                    @for (proposal of implementationProposalsByStatus(item.status); track proposal.id) {
                      <div>• {{ proposal.community_name || 'Community' }} · {{ proposal.proposal_title || proposal.title }}</div>
                    }
                  </div>
                }
              </div>
              <span class="status-badge" [attr.data-status]="item.status">{{ item.status }}</span>
            </div>
          }
        } @else {
          <p class="empty-msg">No implementation records yet.</p>
        }

        <h2 class="section-heading">Implementation Manager</h2>
        <div class="settings-card">
          <label class="toggle-row">Selected Proposal
            <input class="nv-input" [value]="selectedImplementationTitle()" readonly />
          </label>

          @if (implementationLoading) {
            <p class="impl-loading">Loading implementation details...</p>
          }

          @if (!implementationLoading && implementationDetails) {
            <div class="impl-snapshot">
              <div class="impl-snapshot-row">
                <span>Current Status</span>
                <strong>{{ labelImplementationStatus(implementationDetails.implementation?.status || 'not_started') }}</strong>
              </div>
              <div class="impl-snapshot-row">
                <span>Completion</span>
                <strong>{{ implementationDetails.implementation?.completion_percent || 0 }}%</strong>
              </div>
              <div class="impl-snapshot-row">
                <span>Milestones</span>
                <strong>{{ implementationDetails.milestones.length || 0 }}</strong>
              </div>
              <div class="impl-snapshot-row">
                <span>Progress Updates</span>
                <strong>{{ implementationDetails.updates.length || 0 }}</strong>
              </div>
            </div>
          }

          <div class="toggle-grid">
            <label class="toggle-row">Status
              <select class="nv-input" [(ngModel)]="implementationForm.status">
                <option value="not_started">not_started</option>
                <option value="in_progress">in_progress</option>
                <option value="blocked">blocked</option>
                <option value="completed">completed</option>
              </select>
            </label>
            <label class="toggle-row">Department
              <input class="nv-input" [(ngModel)]="implementationForm.department" />
            </label>
            <label class="toggle-row">Completion %
              <input type="number" min="0" max="100" class="nv-input" [(ngModel)]="implementationForm.completionPercent" />
            </label>
            <label class="toggle-row">Total Budget
              <input type="number" min="0" class="nv-input" [(ngModel)]="implementationForm.totalBudget" />
            </label>
            <label class="toggle-row">Target Date
              <input type="datetime-local" class="nv-input" [(ngModel)]="implementationForm.targetDate" />
            </label>
          </div>

          <div class="admin-card-actions">
            <button class="nv-btn nv-btn-primary" (click)="saveImplementation()" [disabled]="finalizing || !implementationForm.proposalId">
              Save Implementation
            </button>
          </div>

          <div class="toggle-grid">
            <label class="toggle-row">Milestone title
              <input class="nv-input" [(ngModel)]="milestoneForm.title" />
            </label>
            <label class="toggle-row">Milestone due date
              <input type="datetime-local" class="nv-input" [(ngModel)]="milestoneForm.dueDate" />
            </label>
          </div>
          <div class="admin-card-actions">
            <button class="nv-btn nv-btn-outline" (click)="addMilestone()" [disabled]="!implementationForm.proposalId || !milestoneForm.title">Add Milestone</button>
          </div>

          <div class="toggle-grid">
            <label class="toggle-row">Update message
              <input class="nv-input" [(ngModel)]="updateForm.message" />
            </label>
            <label class="toggle-row">Update completion %
              <input type="number" min="0" max="100" class="nv-input" [(ngModel)]="updateForm.completionPercent" />
            </label>
          </div>
          <div class="admin-card-actions">
            <button class="nv-btn nv-btn-outline" (click)="addImplementationUpdate()" [disabled]="!implementationForm.proposalId || !updateForm.message">Add Progress Update</button>
          </div>

          <div class="toggle-grid">
            <label class="toggle-row">Budget stage
              <input type="number" min="1" class="nv-input" [(ngModel)]="budgetForm.stage" />
            </label>
            <label class="toggle-row">Release amount
              <input type="number" min="1" class="nv-input" [(ngModel)]="budgetForm.amount" />
            </label>
          </div>
          <div class="admin-card-actions">
            <button class="nv-btn nv-btn-outline" (click)="addBudgetRelease()" [disabled]="!implementationForm.proposalId || budgetForm.amount <= 0">Add Budget Release</button>
          </div>

          <div class="toggle-grid">
            <label class="toggle-row">Proof label
              <input class="nv-input" [(ngModel)]="proofForm.label" />
            </label>
            <label class="toggle-row">Proof URL
              <input class="nv-input" [(ngModel)]="proofForm.url" />
            </label>
          </div>
          <div class="admin-card-actions">
            <button class="nv-btn nv-btn-outline" (click)="addProof()" [disabled]="!implementationForm.proposalId || !proofForm.label || !proofForm.url">Add Proof</button>
          </div>
        </div>

        <h2 class="section-heading">Fraud Alerts</h2>
        <div class="settings-card">
          <label class="toggle-row">Filter
            <select class="nv-input" [(ngModel)]="fraudFilterStatus" (change)="loadFraudAlerts()">
              <option value="open">open</option>
              <option value="in_review">in_review</option>
              <option value="resolved">resolved</option>
              <option value="dismissed">dismissed</option>
              <option value="all">all</option>
            </select>
          </label>

          @if (fraudAlerts.length > 0) {
            @for (alert of fraudAlerts; track alert.id) {
              <div class="action-card fraud-alert-card">
                <div>
                  <div>
                    <strong>{{ alert.alert_type }}</strong>
                    <span class="status-badge" [attr.data-status]="alert.status">{{ alert.status }}</span>
                    <span class="status-badge fraud-severity" [attr.data-severity]="alert.severity">{{ alert.severity }}</span>
                  </div>
                  <div>{{ alert.summary }}</div>
                  @if (alert.reference_table && alert.reference_id) {
                    <div class="alert-ref">{{ alert.reference_table }}: {{ alert.reference_id }}</div>
                  }
                </div>
                <div class="admin-card-actions">
                  @if (alert.status === 'open' || alert.status === 'in_review') {
                    <button class="nv-btn nv-btn-outline" (click)="resolveFraudAlert(alert.id, 'resolved')" [disabled]="finalizing">
                      Resolve
                    </button>
                    <button class="nv-btn nv-btn-outline" (click)="resolveFraudAlert(alert.id, 'dismissed')" [disabled]="finalizing">
                      Dismiss
                    </button>
                  }
                </div>
              </div>
            }
          } @else {
            <p class="empty-msg">No fraud alerts in this filter.</p>
          }
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
    .impl-status-card {
      align-items: center;
    }
    .impl-status-meta {
      font-size: var(--fs-xs);
      color: var(--muted);
      margin-top: 2px;
    }
    .impl-status-list {
      margin-top: 6px;
      font-size: var(--fs-xs);
      color: var(--text-secondary);
      line-height: 1.4;
    }
    .impl-loading {
      margin: var(--sp-1) 0;
      font-size: var(--fs-sm);
      color: var(--muted);
    }
    .impl-snapshot {
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      padding: var(--sp-2);
      margin-bottom: var(--sp-2);
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-1);
      background: var(--bg-muted);
    }
    .impl-snapshot-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-1);
      font-size: var(--fs-sm);
    }
    .impl-snapshot-row span {
      color: var(--muted);
    }
    .fraud-alert-card {
      align-items: flex-start;
    }
    .fraud-severity[data-severity="critical"] { border-color: var(--danger); color: var(--danger); }
    .fraud-severity[data-severity="high"] { border-color: var(--warning); color: var(--warning); }
    .fraud-severity[data-severity="medium"] { border-color: var(--brand-primary); color: var(--brand-primary); }
    .fraud-severity[data-severity="low"] { border-color: var(--muted); color: var(--muted); }
    .alert-ref {
      font-size: var(--fs-xs);
      color: var(--muted);
      margin-top: 4px;
      word-break: break-all;
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
  transparencyTotals = {
    proposals: 0,
    activeVotes: 0,
    approvalRate: 0,
    participationRate: 0,
    quorumSuccessRate: 0,
  };
  implementationStatus: Array<{ status: string; count: number }> = [];
  implementationOverview: any[] = [];
  selectedCommunityId = 'all';
  implementationDetails: {
    implementation: any;
    milestones: any[];
    updates: any[];
    budgetReleases: any[];
    proofFiles: any[];
  } | null = null;
  implementationLoading = false;
  fraudAlerts: any[] = [];
  fraudFilterStatus: 'open' | 'in_review' | 'resolved' | 'dismissed' | 'all' = 'open';
  implementationForm = {
    proposalId: '',
    status: 'not_started' as 'not_started' | 'in_progress' | 'blocked' | 'completed',
    department: '',
    completionPercent: 0,
    totalBudget: 0,
    targetDate: '',
  };
  milestoneForm = {
    title: '',
    dueDate: '',
  };
  updateForm = {
    message: '',
    completionPercent: 0,
  };
  budgetForm = {
    stage: 1,
    amount: 0,
  };
  proofForm = {
    label: '',
    url: '',
  };
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
        this.loadTransparency();
        this.loadFraudAlerts();
        this.loading = false;
      },
      error: () => {
        this.message = 'Failed to load dashboard.';
        this.loading = false;
      },
    });
  }

  private loadTransparency(): void {
    this.api.getTransparencyMetrics().subscribe({
      next: (data) => {
        this.transparencyTotals = {
          proposals: data?.totals?.proposals || 0,
          activeVotes: data?.totals?.activeVotes || 0,
          approvalRate: data?.totals?.approvalRate || 0,
          participationRate: data?.totals?.participationRate || 0,
          quorumSuccessRate: data?.totals?.quorumSuccessRate || 0,
        };
        this.implementationStatus = (data?.implementationStatus || []).map((item: any) => ({
          status: item.status,
          count: Number(item.count || 0),
        }));
      },
    });

    this.api.getImplementationOverview().subscribe({
      next: (res) => {
        this.implementationOverview = res.implementations || [];
      },
      error: () => {
        this.implementationOverview = [];
      },
    });
  }

  onCommunityFilterChange(_communityId: string): void {
    if (!this.implementationForm.proposalId) return;
    const stillVisible = this.filteredImplementationProposals().some((p) => p.id === this.implementationForm.proposalId);
    if (!stillVisible) {
      this.implementationForm.proposalId = '';
      this.implementationDetails = null;
    }
  }

  filteredImplementationProposals(): Proposal[] {
    const source = [...this.finalizedProposals, ...this.activeProposals];
    const dedup = new Map<string, Proposal>();
    for (const item of source) {
      if (!dedup.has(item.id)) {
        dedup.set(item.id, item);
      }
    }
    const all = Array.from(dedup.values());

    if (this.selectedCommunityId === 'all') {
      return all;
    }

    return all.filter((p) => p.community_id === this.selectedCommunityId);
  }

  implementationProposalsByStatus(status: string): any[] {
    return this.implementationOverview.filter((item) => item.status === status);
  }

  selectedImplementationTitle(): string {
    if (!this.implementationForm.proposalId) return '-';
    const match = this.filteredImplementationProposals().find((p) => p.id === this.implementationForm.proposalId);
    if (!match) return this.implementationForm.proposalId;
    return `${match.community_name || 'Community'} · ${match.title}`;
  }

  loadFraudAlerts(): void {
    this.api.getFraudAlerts({ status: this.fraudFilterStatus, limit: 50 }).subscribe({
      next: (data) => {
        this.fraudAlerts = data.alerts || [];
      },
      error: () => {
        this.fraudAlerts = [];
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

  saveImplementation(): void {
    if (!this.implementationForm.proposalId) return;
    this.finalizing = true;
    this.api.updateImplementation(this.implementationForm.proposalId, {
      status: this.implementationForm.status,
      department: this.implementationForm.department || undefined,
      completionPercent: Number(this.implementationForm.completionPercent) || 0,
      totalBudget: Number(this.implementationForm.totalBudget) || undefined,
      targetDate: this.implementationForm.targetDate
        ? new Date(this.implementationForm.targetDate).toISOString()
        : undefined,
    }).subscribe({
      next: (res) => {
        this.message = res.message;
        this.onImplementationProposalChange(this.implementationForm.proposalId);
        this.finalizing = false;
        this.loadDashboard();
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to save implementation.';
        this.finalizing = false;
      },
    });
  }

  addMilestone(): void {
    if (!this.implementationForm.proposalId || !this.milestoneForm.title) return;
    this.finalizing = true;
    this.api.addImplementationMilestone(this.implementationForm.proposalId, {
      title: this.milestoneForm.title,
      dueDate: this.milestoneForm.dueDate
        ? new Date(this.milestoneForm.dueDate).toISOString()
        : undefined,
    }).subscribe({
      next: () => {
        this.message = 'Milestone added.';
        this.milestoneForm = { title: '', dueDate: '' };
        this.onImplementationProposalChange(this.implementationForm.proposalId);
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to add milestone.';
        this.finalizing = false;
      },
    });
  }

  addImplementationUpdate(): void {
    if (!this.implementationForm.proposalId || !this.updateForm.message) return;
    this.finalizing = true;
    this.api.addImplementationUpdate(this.implementationForm.proposalId, {
      message: this.updateForm.message,
      completionPercent: Number(this.updateForm.completionPercent) || undefined,
    }).subscribe({
      next: () => {
        this.message = 'Implementation update added.';
        this.updateForm = { message: '', completionPercent: 0 };
        this.onImplementationProposalChange(this.implementationForm.proposalId);
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to add implementation update.';
        this.finalizing = false;
      },
    });
  }

  addBudgetRelease(): void {
    if (!this.implementationForm.proposalId || this.budgetForm.amount <= 0) return;
    this.finalizing = true;
    this.api.addImplementationBudgetRelease(this.implementationForm.proposalId, {
      stage: Number(this.budgetForm.stage) || 1,
      amount: Number(this.budgetForm.amount),
    }).subscribe({
      next: () => {
        this.message = 'Budget release recorded.';
        this.budgetForm = { stage: 1, amount: 0 };
        this.onImplementationProposalChange(this.implementationForm.proposalId);
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to add budget release.';
        this.finalizing = false;
      },
    });
  }

  addProof(): void {
    if (!this.implementationForm.proposalId || !this.proofForm.label || !this.proofForm.url) return;
    this.finalizing = true;
    this.api.addImplementationProof(this.implementationForm.proposalId, {
      label: this.proofForm.label,
      url: this.proofForm.url,
    }).subscribe({
      next: () => {
        this.message = 'Proof uploaded.';
        this.proofForm = { label: '', url: '' };
        this.onImplementationProposalChange(this.implementationForm.proposalId);
        this.finalizing = false;
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to add proof.';
        this.finalizing = false;
      },
    });
  }

  resolveFraudAlert(alertId: string, status: 'resolved' | 'dismissed'): void {
    this.finalizing = true;
    this.api.resolveFraudAlert(alertId, { status }).subscribe({
      next: (res) => {
        this.message = res.message;
        this.finalizing = false;
        this.loadFraudAlerts();
      },
      error: (err) => {
        this.message = err.error?.error || 'Failed to update fraud alert.';
        this.finalizing = false;
      },
    });
  }

  onImplementationProposalChange(proposalId: string): void {
    if (!proposalId) {
      this.implementationDetails = null;
      return;
    }

    this.implementationLoading = true;
    this.api.getImplementation(proposalId).subscribe({
      next: (res) => {
        this.implementationDetails = res;

        const current = res.implementation;
        if (current) {
          this.implementationForm.status = current.status || 'not_started';
          this.implementationForm.department = current.department || '';
          this.implementationForm.completionPercent = Number(current.completion_percent || 0);
          this.implementationForm.totalBudget = Number(current.total_budget || 0);
          this.implementationForm.targetDate = current.target_date
            ? new Date(current.target_date).toISOString().slice(0, 16)
            : '';
        }

        this.implementationLoading = false;
      },
      error: () => {
        this.implementationDetails = null;
        this.implementationLoading = false;
      },
    });
  }

  labelImplementationStatus(status: string): string {
    const labels: Record<string, string> = {
      not_started: 'Not started',
      in_progress: 'In progress',
      blocked: 'Blocked',
      completed: 'Completed',
    };
    return labels[status] || status;
  }
}
