import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../services/api.service';

@Component({
    selector: 'nv-transparency-dashboard',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="nv-container">
      <section class="header">
        <h1 class="title">Transparency Dashboard</h1>
        <p class="subtitle">Public governance metrics for proposals, voting, implementation, and on-chain verifiability.</p>
      </section>

      @if (loading) {
        <div class="skeleton-grid">
          @for (s of [1,2,3,4]; track s) {
            <div class="skeleton-card"></div>
          }
        </div>
      }

      @if (!loading) {
        <section class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">Total Proposals</span>
            <strong class="stat-value">{{ totals.proposals }}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">Active Votes</span>
            <strong class="stat-value">{{ totals.activeVotes }}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">Participation Rate</span>
            <strong class="stat-value">{{ totals.participationRate | number:'1.0-1' }}%</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">Approval Rate</span>
            <strong class="stat-value">{{ totals.approvalRate | number:'1.0-1' }}%</strong>
          </div>
        </section>

        <section class="panel-grid">
          <article class="panel">
            <h2>Final Outcomes</h2>
            @if (finalOutcomes.length === 0) {
              <p class="empty">No finalized outcomes yet.</p>
            }
            @for (item of finalOutcomes; track item.status) {
              <div class="row summary-row">
                <span>{{ item.status }}</span>
                <strong>{{ item.count }}</strong>
              </div>
              @if (outcomeDetailsForStatus(item.status).length > 0) {
                <div class="details-list">
                  @for (detail of outcomeDetailsForStatus(item.status); track detail.id) {
                    <div class="detail-item">
                      <div class="detail-title">{{ detail.title }}</div>
                      <div class="detail-meta">{{ detail.community_name }} · {{ displayDetailDate(detail) | date:'mediumDate' }}</div>
                    </div>
                  }
                </div>
              }
            }
          </article>

          <article class="panel">
            <h2>Implementation Status</h2>
            @if (implementationStatus.length === 0) {
              <p class="empty">No implementation records yet.</p>
            }
            @for (item of implementationStatus; track item.status) {
              <div class="row summary-row">
                <span>{{ item.status }}</span>
                <strong>{{ item.count }}</strong>
              </div>
              @if (implementationDetailsForStatus(item.status).length > 0) {
                <div class="details-list">
                  @for (detail of implementationDetailsForStatus(item.status); track detail.id) {
                    <div class="detail-item">
                      <div class="detail-title">{{ detail.proposal_title }}</div>
                      <div class="detail-meta">{{ detail.community_name }} · {{ detail.completion_percent || 0 }}% · {{ detail.department || 'No department' }}</div>
                    </div>
                  }
                </div>
              }
            }
          </article>

          <article class="panel">
            <h2>On-chain Verification</h2>
            <div class="row">
              <span>Proposal Anchored</span>
              <strong>{{ onChainVerification.proposalAnchored }}</strong>
            </div>
            <div class="row">
              <span>Result Anchored</span>
              <strong>{{ onChainVerification.resultAnchored }}</strong>
            </div>
          </article>
        </section>
      }
    </div>
  `,
    styles: [`
    .header {
      margin-bottom: var(--sp-3);
    }
    .title {
      font-size: clamp(1.6rem, 4vw, 2.4rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 6px;
    }
    .subtitle {
      color: var(--muted);
      font-size: var(--fs-sm);
      max-width: 760px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--sp-2);
      margin-bottom: var(--sp-3);
    }
    .stat-card {
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      padding: var(--sp-2);
      background: var(--bg-muted);
    }
    .stat-label {
      display: block;
      color: var(--muted);
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 4px;
      font-weight: 700;
    }
    .stat-value {
      font-size: clamp(1.3rem, 3vw, 2rem);
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .panel-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--sp-2);
    }
    .panel {
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      padding: var(--sp-2);
      background: white;
    }
    .panel h2 {
      font-size: var(--fs-sm);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: var(--sp-1);
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-top: 1px solid var(--border);
      padding: 8px 0;
      font-size: var(--fs-sm);
    }
    .summary-row {
      font-weight: 700;
      margin-top: 4px;
    }
    .row:first-of-type {
      border-top: 0;
    }
    .details-list {
      margin-bottom: 8px;
      border-left: 2px solid var(--border);
      padding-left: 10px;
    }
    .detail-item {
      padding: 6px 0;
      border-bottom: 1px dashed var(--border);
    }
    .detail-item:last-child {
      border-bottom: 0;
    }
    .detail-title {
      font-size: var(--fs-sm);
      color: var(--text-primary);
      font-weight: 600;
    }
    .detail-meta {
      font-size: var(--fs-xs);
      color: var(--muted);
      margin-top: 2px;
    }
    .empty {
      color: var(--muted);
      font-size: var(--fs-sm);
    }
    .skeleton-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: var(--sp-2);
    }
    .skeleton-card {
      height: 96px;
      border-radius: var(--r-sm);
      border: 2px solid var(--border);
      background: var(--bg-muted);
      animation: pulse 1.2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
    @media (max-width: 768px) {
      .skeleton-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `],
})
export class TransparencyDashboardComponent implements OnInit {
    loading = true;

    totals = {
        proposals: 0,
        activeVotes: 0,
        approvalRate: 0,
        participationRate: 0,
        quorumSuccessRate: 0,
    };

    finalOutcomes: Array<{ status: string; count: number }> = [];
    implementationStatus: Array<{ status: string; count: number }> = [];
    finalOutcomeDetails: Record<string, any[]> = {};
    implementationDetails: Record<string, any[]> = {};
    onChainVerification = {
        proposalAnchored: 0,
        resultAnchored: 0,
    };

    constructor(private api: ApiService) { }

    ngOnInit(): void {
        this.api.getPublicTransparencyMetrics().subscribe({
            next: (data) => {
                this.totals = {
                    proposals: data?.totals?.proposals || 0,
                    activeVotes: data?.totals?.activeVotes || 0,
                    approvalRate: data?.totals?.approvalRate || 0,
                    participationRate: data?.totals?.participationRate || 0,
                    quorumSuccessRate: data?.totals?.quorumSuccessRate || 0,
                };
                this.finalOutcomes = (data?.finalOutcomes || []).map((item: any) => ({
                    status: item.status,
                    count: Number(item.count || 0),
                }));
                this.implementationStatus = (data?.implementationStatus || []).map((item: any) => ({
                    status: item.status,
                    count: Number(item.count || 0),
                }));
                this.finalOutcomeDetails = data?.finalOutcomeDetails || {};
                this.implementationDetails = data?.implementationDetails || {};
                this.onChainVerification = {
                    proposalAnchored: Number(data?.onChainVerification?.proposalAnchored || 0),
                    resultAnchored: Number(data?.onChainVerification?.resultAnchored || 0),
                };
                this.loading = false;
            },
            error: () => {
                this.loading = false;
            },
        });
    }

    outcomeDetailsForStatus(status: string): any[] {
        return this.finalOutcomeDetails[status] || [];
    }

    implementationDetailsForStatus(status: string): any[] {
        return this.implementationDetails[status] || [];
    }

    displayDetailDate(detail: any): string | null {
        return detail?.finalized_at || detail?.updated_at || null;
    }
}
