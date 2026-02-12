import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { ToastService } from '../../services/toast.service';

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
            @if (submitting && loadingStatus) {
              <span>{{ loadingStatus }}</span>
            } @else if (submitting) {
              <span>{{ i18n.t('create.submitting') }}</span>
            } @else {
              <span>{{ i18n.t('create.submit') }}</span>
            }
          </button>
          @if (loadingStatus) {
            <div class="loading-status-detail">
              <div class="loading-spinner"></div>
              <span>{{ loadingStatus }}</span>
            </div>
          }
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

    /* ── Loading Status ── */
    .loading-status-detail {
      display: flex;
      align-items: center;
      gap: var(--sp-1);
      margin-top: var(--sp-2);
      padding: var(--sp-2);
      background: var(--bg-muted);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      font-size: var(--fs-sm);
      color: var(--text-secondary);
      animation: pulse 2s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.7; }
    }

    .loading-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--border-strong);
      border-top-color: var(--brand);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
})
export class ProposalCreateComponent implements OnInit {
  title = '';
  text = '';
  category = '';
  deadlineDays = 7;
  communityId = '';
  communityName = '';
  error = '';
  submitting = false;
  loadingStatus = '';
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
    private toast: ToastService
  ) { }

  ngOnInit(): void {
    this.communityId = this.route.snapshot.queryParamMap.get('communityId') || '';
    const communitySlug = this.route.snapshot.queryParamMap.get('slug') || '';

    if (communitySlug) {
      this.api.getCommunity(communitySlug).subscribe({
        next: (community) => {
          this.communityName = community.name;
          this.communityId = community.id;
        },
        error: () => {
          this.error = 'Failed to load community details.';
        },
      });
    } else {
      // Load joined communities for dropdown
      this.loadJoinedCommunities();
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
  }

  onSubmit(): void {
    if (!this.communityId) {
      this.error = 'Please select a community.';
      return;
    }

    if (this.title.length < 10 || this.text.length < 50 || !this.category) {
      this.error = 'Please fill all fields. Title must be 10+ chars, description 50+ chars.';
      return;
    }

    this.submitting = true;
    this.error = '';
    this.duplicates = [];
    this.loadingStatus = 'Preparing proposal...';

    // Simulate different stages for better UX
    setTimeout(() => {
      this.loadingStatus = 'AI is generating summary...';
    }, 500);

    setTimeout(() => {
      this.loadingStatus = 'Checking for duplicates...';
    }, 1500);

    setTimeout(() => {
      this.loadingStatus = 'Creating proposal...';
    }, 2500);

    this.api
      .createProposal({
        communityId: this.communityId,
        title: this.title,
        text: this.text,
        category: this.category,
        deadlineDays: this.deadlineDays,
      })
      .subscribe({
        next: (proposal) => {
          this.loadingStatus = 'Success! Redirecting...';
          this.toast.show(this.i18n.t('toast.proposal'));
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
          this.loadingStatus = '';
        },
      });
  }
}
