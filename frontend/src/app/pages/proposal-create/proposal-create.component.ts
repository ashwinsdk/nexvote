import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, ProposalTemplate } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { ToastService } from '../../services/toast.service';
import { OfflineDraftService } from '../../services/offline-draft.service';
import { NetworkPreferencesService } from '../../services/network-preferences.service';

@Component({
  selector: 'nv-proposal-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="nv-container">
      <div class="create-page">
        <h1 class="page-title">{{ i18n.t('create.title') }}</h1>
        @if (communityName) {
          <p class="page-context">{{ i18n.t('create.context') }} <strong>{{ communityName }}</strong></p>
        }

        @if (error) {
          <div class="error-banner">{{ error }}</div>
        }

        @if (duplicates.length > 0) {
          <div class="duplicate-warning">
            <p class="dup-title"><strong>Similar proposals found:</strong></p>
            @for (dup of duplicates; track dup.id) {
              <p class="dup-item">
                · {{ dup.title }} ({{ (dup.similarity * 100) | number:'1.0-0' }}% similar)
              </p>
            }
          </div>
        }

        <form (ngSubmit)="onSubmit()" class="create-form">
          <!-- Community Dropdown -->
          @if (!communityId) {
            <div class="form-group">
              <label class="form-label">{{ i18n.t('create.community.label') }}</label>
              <div class="dropdown-wrapper" (click)="showCommunityDropdown = !showCommunityDropdown">
                <div class="dropdown-trigger nv-input" [class.has-value]="selectedCommunity">
                  {{ selectedCommunity?.name || i18n.t('create.community.placeholder') }}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
              @if (showCommunityDropdown) {
                <div class="dropdown-panel">
                  <input
                    type="text"
                    class="nv-input dropdown-search"
                    [placeholder]="i18n.t('create.community.search')"
                    [(ngModel)]="communitySearch"
                    [ngModelOptions]="{standalone: true}"
                    (input)="filterCommunities()"
                  />
                  <div class="dropdown-list">
                    @for (c of filteredCommunities; track c.id) {
                      <button type="button" class="dropdown-item" (click)="selectCommunity(c)">
                        <span class="dropdown-item-name">{{ c.name }}</span>
                        <span class="dropdown-item-meta">{{ c.category }} · {{ c.member_count }} members</span>
                      </button>
                    }
                    @if (filteredCommunities.length === 0) {
                      <div class="dropdown-empty">No communities found</div>
                    }
                  </div>
                </div>
              }
            </div>
          }

          <div class="form-group">
            <label class="form-label" for="title">{{ i18n.t('create.title.label') }}</label>
            <input
              id="title"
              type="text"
              class="nv-input"
              [(ngModel)]="title"
              name="title"
              [placeholder]="i18n.t('create.title.placeholder')"
              required
              minlength="10"
              maxlength="300"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="template">Proposal Template</label>
            <select
              id="template"
              class="nv-input"
              [(ngModel)]="selectedTemplateId"
              name="selectedTemplateId"
              (ngModelChange)="onTemplateChange($event)"
            >
              <option value="">No template</option>
              @for (template of templates; track template.id) {
                <option [value]="template.id">{{ template.name }} ({{ template.category }})</option>
              }
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="text">{{ i18n.t('create.desc.label') }}</label>
            <textarea
              id="text"
              class="nv-input textarea"
              [(ngModel)]="text"
              name="text"
              [placeholder]="i18n.t('create.desc.placeholder')"
              required
              minlength="50"
              rows="8"
            ></textarea>
            <span class="char-count" [class.warning]="text.length < 50 && text.length > 0">
              {{ text.length }} / 50 min
            </span>
          </div>

          <div class="form-group">
            <label class="form-label" for="problemStatement">Problem Statement</label>
            <textarea
              id="problemStatement"
              class="nv-input textarea"
              [(ngModel)]="problemStatement"
              name="problemStatement"
              placeholder="Describe the public problem this proposal solves"
              required
              minlength="20"
              rows="4"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="beneficiaries">Beneficiaries</label>
            <textarea
              id="beneficiaries"
              class="nv-input"
              [(ngModel)]="beneficiaries"
              name="beneficiaries"
              placeholder="Who benefits and approximately how many people"
              required
              minlength="10"
              rows="3"
            ></textarea>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="timeline">Implementation Timeline</label>
              <input
                id="timeline"
                type="text"
                class="nv-input"
                [(ngModel)]="timeline"
                name="timeline"
                placeholder="e.g. 3 phases over 6 months"
                required
              />
            </div>

            <div class="form-group flex-1">
              <label class="form-label" for="expectedCost">Expected Cost</label>
              <input
                id="expectedCost"
                type="number"
                class="nv-input"
                [(ngModel)]="expectedCost"
                name="expectedCost"
                min="0"
                required
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="impactSummary">Impact Summary</label>
            <textarea
              id="impactSummary"
              class="nv-input"
              [(ngModel)]="impactSummary"
              name="impactSummary"
              placeholder="Expected measurable impact after implementation"
              required
              minlength="20"
              rows="3"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="riskAnalysis">Risk / Impact Analysis</label>
            <textarea
              id="riskAnalysis"
              class="nv-input"
              [(ngModel)]="riskAnalysis"
              name="riskAnalysis"
              placeholder="Major risks, mitigation, and negative side-effects"
              required
              minlength="20"
              rows="3"
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label" for="attachmentProofUrl">Attachment / Proof URL</label>
            <input
              id="attachmentProofUrl"
              type="url"
              class="nv-input"
              [(ngModel)]="attachmentProofUrl"
              name="attachmentProofUrl"
              placeholder="https://..."
              required
            />
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                [(ngModel)]="submitForReview"
                name="submitForReview"
              />
              Submit for review immediately after draft creation
            </label>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input
                type="checkbox"
                [checked]="networkPrefs.isLowBandwidth()"
                (change)="toggleLowBandwidth($event)"
              />
              Low-bandwidth mode
            </label>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="category">{{ i18n.t('create.category.label') }}</label>
              <select
                id="category"
                class="nv-input"
                [(ngModel)]="category"
                name="category"
                required
              >
                <option value="" disabled>{{ i18n.t('create.category.placeholder') }}</option>
                <option value="infrastructure">Infrastructure</option>
                <option value="education">Education</option>
                <option value="health">Health</option>
                <option value="environment">Environment</option>
                <option value="civic">Civic</option>
                <option value="safety">Safety</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div class="form-group flex-1">
              <label class="form-label" for="deadline">{{ i18n.t('create.deadline.label') }}</label>
              <input
                id="deadline"
                type="number"
                class="nv-input"
                [(ngModel)]="deadlineDays"
                name="deadlineDays"
                min="1"
                max="90"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            class="nv-btn nv-btn-primary submit-btn"
            [disabled]="submitting"
          >
            @if (submitting) {
              <span>{{ i18n.t('create.submitting') }}</span>
            } @else {
              <span>{{ i18n.t('create.submit') }}</span>
            }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .create-page {
      max-width: 560px;
      margin: 0 auto;
      padding: var(--sp-4) 0;
    }

    .page-title {
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .page-context {
      font-size: var(--fs-sm);
      color: var(--muted);
      margin-bottom: var(--sp-3);
    }

    .page-context strong {
      color: var(--text-primary);
    }

    .error-banner {
      padding: var(--sp-1) var(--sp-2);
      border: 2px solid var(--danger);
      border-radius: var(--r-sm);
      font-size: var(--fs-sm);
      color: var(--danger);
      background: rgba(220,38,38,0.06);
      margin-bottom: var(--sp-2);
      animation: shake 0.4s ease;
    }

    @keyframes shake {
      10%, 90% { transform: translateX(-1px); }
      20%, 80% { transform: translateX(2px); }
      30%, 50%, 70% { transform: translateX(-3px); }
      40%, 60% { transform: translateX(3px); }
    }

    .duplicate-warning {
      padding: var(--sp-2);
      border: 2px solid var(--warning);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-2);
      background: rgba(234,179,8,0.06);
    }

    .dup-title {
      font-size: var(--fs-sm);
      font-weight: 700;
      margin-bottom: 4px;
    }

    .dup-item {
      font-size: var(--fs-xs);
      color: var(--text-secondary);
    }

    /* ── Form ── */
    .create-form {
      margin-top: var(--sp-3);
    }

    .form-group {
      margin-bottom: var(--sp-3);
      position: relative;
    }

    .form-label {
      display: block;
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-primary);
      margin-bottom: 6px;
    }

    .form-row {
      display: flex;
      gap: var(--sp-2);
    }

    .flex-1 {
      flex: 1;
    }

    .textarea {
      resize: vertical;
      min-height: 160px;
    }

    .char-count {
      display: block;
      text-align: right;
      font-size: var(--fs-xs);
      color: var(--muted);
      margin-top: 4px;
    }

    .char-count.warning {
      color: var(--danger);
    }

    select.nv-input {
      appearance: auto;
    }

    /* ── Community Dropdown ── */
    .dropdown-wrapper {
      position: relative;
    }

    .dropdown-trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: pointer;
      color: var(--muted);
    }

    .dropdown-trigger.has-value {
      color: var(--text-primary);
      font-weight: 600;
    }

    .dropdown-panel {
      position: absolute;
      z-index: 50;
      left: 0;
      right: 0;
      border: 2px solid var(--border-strong);
      border-radius: var(--r-sm);
      background: var(--surface);
      box-shadow: 4px 4px 0 var(--border);
      margin-top: 4px;
      max-height: 320px;
      display: flex;
      flex-direction: column;
    }

    .dropdown-search {
      border: none;
      border-bottom: 2px solid var(--border);
      border-radius: 0;
    }

    .dropdown-list {
      overflow-y: auto;
      max-height: 260px;
    }

    .dropdown-item {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      padding: var(--sp-1) var(--sp-2);
      background: none;
      border: none;
      border-bottom: 1px solid var(--border);
      text-align: left;
      cursor: pointer;
      transition: background var(--motion-fast);
    }

    .dropdown-item:hover {
      background: var(--bg-muted);
    }

    .dropdown-item:last-child {
      border-bottom: none;
    }

    .dropdown-item-name {
      font-size: var(--fs-sm);
      font-weight: 700;
      color: var(--text-primary);
    }

    .dropdown-item-meta {
      font-size: var(--fs-xs);
      color: var(--muted);
    }

    .dropdown-empty {
      padding: var(--sp-2);
      text-align: center;
      color: var(--muted);
      font-size: var(--fs-sm);
    }

    /* ── Submit ── */
    .submit-btn {
      width: 100%;
      padding: 14px;
      font-size: var(--fs-sm);
    }

    @media (max-width: 768px) {
      .form-row {
        flex-direction: column;
        gap: 0;
      }
    }

  `],
})
export class ProposalCreateComponent implements OnInit {
  title = '';
  text = '';
  problemStatement = '';
  beneficiaries = '';
  timeline = '';
  expectedCost = 0;
  impactSummary = '';
  riskAnalysis = '';
  attachmentProofUrl = '';
  submitForReview = true;
  templates: ProposalTemplate[] = [];
  selectedTemplateId = '';
  private draftTimer: any;
  category = '';
  deadlineDays = 7;
  communityId = '';
  communityName = '';
  error = '';
  submitting = false;
  duplicates: any[] = [];

  // Community dropdown
  showCommunityDropdown = false;
  communitySearch = '';
  joinedCommunities: any[] = [];
  filteredCommunities: any[] = [];
  selectedCommunity: any = null;

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService,
    private toast: ToastService,
    private offlineDrafts: OfflineDraftService,
    public networkPrefs: NetworkPreferencesService
  ) { }

  ngOnInit(): void {
    this.communityId = this.route.snapshot.queryParamMap.get('communityId') || '';
    const communitySlug = this.route.snapshot.queryParamMap.get('slug') || '';

    if (communitySlug) {
      this.api.getCommunity(communitySlug).subscribe({
        next: (community) => {
          this.communityName = community.name;
          this.communityId = community.id;
          this.loadTemplates();
        },
        error: () => {
          this.error = 'Failed to load community details.';
        },
      });
    } else {
      // Load joined communities for dropdown
      this.loadJoinedCommunities();
    }

    this.restoreDraft();
    this.draftTimer = setInterval(() => this.persistDraft(), 3000);
  }

  ngOnDestroy(): void {
    if (this.draftTimer) {
      clearInterval(this.draftTimer);
    }
  }

  loadJoinedCommunities(): void {
    this.api.getCommunities({}).subscribe({
      next: (res) => {
        this.joinedCommunities = res.communities;
        this.filteredCommunities = [...this.joinedCommunities];
      },
    });
  }

  filterCommunities(): void {
    const q = this.communitySearch.toLowerCase();
    this.filteredCommunities = this.joinedCommunities.filter(c =>
      c.name.toLowerCase().includes(q) || c.category?.toLowerCase().includes(q)
    );
  }

  selectCommunity(community: any): void {
    this.selectedCommunity = community;
    this.communityId = community.id;
    this.communityName = community.name;
    this.showCommunityDropdown = false;
    this.communitySearch = '';
    this.loadTemplates();
  }

  loadTemplates(): void {
    this.api.getProposalTemplates({ communityId: this.communityId || undefined }).subscribe({
      next: (res) => {
        this.templates = res.templates;
      },
    });
  }

  onTemplateChange(templateId: string): void {
    this.selectedTemplateId = templateId;
    const template = this.templates.find((item) => item.id === templateId);
    if (!template) {
      return;
    }

    if (!this.category) {
      this.category = template.category;
    }
  }

  private draftKey(): string {
    return `proposal-create-${this.communityId || 'global'}`;
  }

  private persistDraft(): void {
    this.offlineDrafts.saveDraft(this.draftKey(), {
      communityId: this.communityId,
      title: this.title,
      text: this.text,
      problemStatement: this.problemStatement,
      beneficiaries: this.beneficiaries,
      timeline: this.timeline,
      expectedCost: this.expectedCost,
      impactSummary: this.impactSummary,
      riskAnalysis: this.riskAnalysis,
      attachmentProofUrl: this.attachmentProofUrl,
      category: this.category,
      deadlineDays: this.deadlineDays,
      selectedTemplateId: this.selectedTemplateId,
      submitForReview: this.submitForReview,
    });
  }

  private restoreDraft(): void {
    const saved = this.offlineDrafts.getDraft(this.draftKey());
    if (!saved) {
      return;
    }

    const value = saved.data || {};
    this.title = value.title || this.title;
    this.text = value.text || this.text;
    this.problemStatement = value.problemStatement || this.problemStatement;
    this.beneficiaries = value.beneficiaries || this.beneficiaries;
    this.timeline = value.timeline || this.timeline;
    this.expectedCost = Number(value.expectedCost ?? this.expectedCost);
    this.impactSummary = value.impactSummary || this.impactSummary;
    this.riskAnalysis = value.riskAnalysis || this.riskAnalysis;
    this.attachmentProofUrl = value.attachmentProofUrl || this.attachmentProofUrl;
    this.category = value.category || this.category;
    this.deadlineDays = Number(value.deadlineDays ?? this.deadlineDays);
    this.selectedTemplateId = value.selectedTemplateId || this.selectedTemplateId;
    this.submitForReview = value.submitForReview ?? this.submitForReview;
  }

  toggleLowBandwidth(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.networkPrefs.setLowBandwidth(checked);
  }

  onSubmit(): void {
    if (!this.communityId) {
      this.error = 'Please select a community.';
      return;
    }

    if (
      this.title.length < 10 ||
      this.text.length < 50 ||
      !this.category ||
      this.problemStatement.length < 20 ||
      this.beneficiaries.length < 10 ||
      this.timeline.length < 5 ||
      this.expectedCost < 0 ||
      this.impactSummary.length < 20 ||
      this.riskAnalysis.length < 20 ||
      !this.attachmentProofUrl
    ) {
      this.error = 'Please complete all mandatory quality fields before submitting.';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.duplicates = [];

    const request$ = this.selectedTemplateId
      ? this.api.createProposalFromTemplate(this.selectedTemplateId, {
        communityId: this.communityId,
        title: this.title,
        text: this.text,
        deadlineDays: this.deadlineDays,
        submitForReview: this.submitForReview,
        values: {
          problemStatement: this.problemStatement,
          expectedCost: this.expectedCost,
          beneficiaries: this.beneficiaries,
          timeline: this.timeline,
          impactSummary: this.impactSummary,
          riskAnalysis: this.riskAnalysis,
          attachmentProofUrl: this.attachmentProofUrl,
        },
      })
      : this.api.createProposal({
        communityId: this.communityId,
        title: this.title,
        text: this.text,
        category: this.category,
        problemStatement: this.problemStatement,
        expectedCost: this.expectedCost,
        beneficiaries: this.beneficiaries,
        timeline: this.timeline,
        impactSummary: this.impactSummary,
        riskAnalysis: this.riskAnalysis,
        attachmentsProof: [this.attachmentProofUrl],
        submitForReview: this.submitForReview,
        deadlineDays: this.deadlineDays,
      });

    request$
      .subscribe({
        next: (proposal) => {
          this.toast.show(this.i18n.t('toast.proposal'));
          this.offlineDrafts.clearDraft(this.draftKey());
          setTimeout(() => {
            this.router.navigate(['/proposal', proposal.id]);
          }, 500);
        },
        error: (err) => {
          if (err.error?.duplicates) {
            this.duplicates = err.error.duplicates;
            this.error = 'Similar proposals exist. Review them before proceeding.';
          } else {
            this.error = err.error?.error || 'Failed to create proposal.';
          }
          this.submitting = false;
        },
      });
  }
}
