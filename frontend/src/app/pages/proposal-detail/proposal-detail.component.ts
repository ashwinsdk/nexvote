import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService, Proposal } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';
import { ToastService } from '../../services/toast.service';
import { OfflineDraftService } from '../../services/offline-draft.service';
import { NetworkPreferencesService } from '../../services/network-preferences.service';

@Component({
  selector: 'nv-proposal-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="nv-container">
      @if (loading) {
        <div class="skeleton-detail">
          <div class="skeleton skeleton-h1"></div>
          <div class="skeleton skeleton-p"></div>
          <div class="skeleton skeleton-block"></div>
        </div>
      }

      @if (proposal) {
        <!-- Header -->
        <section class="proposal-header">
          <div class="meta-row">
            <a [routerLink]="['/community', proposal.community_slug]" class="meta-community">
              {{ proposal.community_name }}
            </a>
            <span class="nv-badge nv-badge-primary">{{ proposal.category }}</span>
            <span class="status-badge" [attr.data-status]="proposal.status">{{ proposal.status }}</span>
          </div>
          <h1 class="detail-title">{{ proposal.title }}</h1>
          <p class="detail-meta">
            {{ i18n.t('proposal.by') }}
            <a [routerLink]="['/user', proposal.author_id]" class="author-link">{{ proposal.author_name }}</a>
            @if (proposal.deadline) {
              <span class="meta-sep">·</span>
              {{ i18n.t('proposal.deadline') }}: {{ proposal.deadline | date:'mediumDate' }}
            }
          </p>
          <div class="header-actions">
            <button class="nv-btn nv-btn-outline" (click)="toggleWatch()" [disabled]="watchBusy">
              {{ watching ? 'Following proposal' : 'Follow proposal' }}
            </button>
            <label class="checkbox-inline">
              <input type="checkbox" [checked]="networkPrefs.isLowBandwidth()" (change)="toggleLowBandwidth($event)" />
              Low-bandwidth mode
            </label>
          </div>
        </section>

        <!-- AI Summary -->
        @if (proposal.summary) {
          <section class="summary-card">
            <span class="summary-label">{{ i18n.t('proposal.summary') }}</span>
            <p>{{ proposal.summary }}</p>
          </section>
        }

        <!-- Body -->
        <section class="body-card">
          <p class="body-text">{{ proposal.text }}</p>
        </section>

        @if (canManageDraft()) {
          <section class="extend-section">
            <h3 class="section-label">Draft Actions</h3>
            <p class="extend-help">Move this proposal live, submit it for review, or delete the draft.</p>
            <div class="extend-controls">
              @if (canSubmitForReview()) {
                <button class="nv-btn nv-btn-outline" (click)="submitDraftForReview()" [disabled]="draftActionBusy">Submit For Review</button>
              }
              <button class="nv-btn nv-btn-primary" (click)="publishDraft()" [disabled]="draftActionBusy">Move Live</button>
              <button class="nv-btn nv-btn-outline" (click)="deleteDraft()" [disabled]="draftActionBusy">Delete Draft</button>
            </div>
          </section>
        }

        @if (shouldShowAssistant()) {
          <section class="summary-card">
            <span class="summary-label">{{ explainerLabel() }}</span>
            <p>{{ assistant.simpleExplanation }}</p>
            @if (assistant.discussionSummary) {
              <p><strong>Pros:</strong> {{ assistant.discussionSummary.keyPros.join('; ') || '-' }}</p>
              <p><strong>Cons:</strong> {{ assistant.discussionSummary.keyCons.join('; ') || '-' }}</p>
            }
          </section>
        }

        <!-- Vote Section -->
        @if (proposal.status === 'voting') {
          <section class="vote-section">
            <h3 class="section-label">{{ i18n.t('proposal.vote') }}</h3>

            @if (isDeadlinePassed()) {
              <p class="vote-notice">{{ i18n.t('proposal.vote.passed') }}</p>
            } @else if (auth.isLoggedIn()) {
              <div class="vote-buttons">
                <button
                  class="vote-btn vote-btn-yes"
                  [class.active]="currentVote === 'yes'"
                  [class.pulse]="justVoted === 'yes'"
                  (click)="castVote('yes')"
                  [disabled]="voting"
                >
                  <span class="vote-icon">▲</span>
                  <span>{{ i18n.t('proposal.vote.yes') }}</span>
                </button>
                <button
                  class="vote-btn vote-btn-no"
                  [class.active]="currentVote === 'no'"
                  [class.pulse]="justVoted === 'no'"
                  (click)="castVote('no')"
                  [disabled]="voting"
                >
                  <span class="vote-icon">▼</span>
                  <span>{{ i18n.t('proposal.vote.no') }}</span>
                </button>
                <button
                  class="vote-btn vote-btn-abstain"
                  [class.active]="currentVote === 'abstain'"
                  [class.pulse]="justVoted === 'abstain'"
                  (click)="castVote('abstain')"
                  [disabled]="voting"
                >
                  <span class="vote-icon">—</span>
                  <span>{{ i18n.t('proposal.vote.abstain') }}</span>
                </button>
              </div>
              @if (currentVote) {
                <button class="nv-btn nv-btn-outline undo-btn" (click)="undoVote()" [disabled]="voting">
                  {{ i18n.t('proposal.vote.undo') }}
                </button>
              }
            } @else {
              <p class="vote-notice">
                <a routerLink="/login">{{ i18n.t('nav.signin') }}</a> {{ i18n.t('proposal.vote.signin') }}
              </p>
            }
          </section>

          @if (canExtendVoting()) {
            <section class="extend-section">
              <h3 class="section-label">{{ i18n.t('proposal.extend.title') }}</h3>
              <p class="extend-help">{{ i18n.t('proposal.extend.help') }}</p>
              <div class="extend-controls">
                <input
                  type="number"
                  class="nv-input extend-input"
                  min="1"
                  max="30"
                  [(ngModel)]="extendDays"
                />
                <button class="nv-btn nv-btn-outline" (click)="extendDeadline()" [disabled]="extending">
                  {{ extending ? i18n.t('proposal.extend.extending') : i18n.t('proposal.extend.button') }}
                </button>
              </div>
            </section>
          }
        }

        <!-- Results -->
        <section class="results-section">
          <h3 class="section-label">{{ i18n.t('proposal.results') }}</h3>
          <div class="result-bar">
            <div class="result-fill result-yes" [style.width.%]="getPercent('yes')"></div>
            <div class="result-fill result-no" [style.width.%]="getPercent('no')"></div>
          </div>
          <div class="result-stats">
            <div class="result-stat">
              <span class="result-num yes">{{ proposal.yes_count }}</span>
              <span class="result-label">{{ i18n.t('proposal.vote.yes') }} ({{ getPercent('yes') | number:'1.0-1' }}%)</span>
            </div>
            <div class="result-stat">
              <span class="result-num no">{{ proposal.no_count }}</span>
              <span class="result-label">{{ i18n.t('proposal.vote.no') }} ({{ getPercent('no') | number:'1.0-1' }}%)</span>
            </div>
            <div class="result-stat">
              <span class="result-num">{{ proposal.abstain_count }}</span>
              <span class="result-label">{{ i18n.t('proposal.vote.abstain') }}</span>
            </div>
          </div>
        </section>

        <!-- Audit -->
        @if (proposal.proposal_hash || proposal.tx_hash) {
          <section class="audit-section">
            <h3 class="section-label">{{ i18n.t('proposal.audit') }}</h3>
            @if (proposal.proposal_hash) {
              <div class="audit-row">
                <span class="audit-key">PROPOSAL HASH</span>
                <code class="audit-val">{{ proposal.proposal_hash }}</code>
              </div>
            }
            @if (proposal.result_hash) {
              <div class="audit-row">
                <span class="audit-key">RESULT HASH</span>
                <code class="audit-val">{{ proposal.result_hash }}</code>
              </div>
            }
            @if (proposal.tx_hash) {
              <div class="audit-row">
                <span class="audit-key">TX</span>
                <a class="audit-link" href="https://sepolia.etherscan.io/tx/{{ proposal.tx_hash }}" target="_blank" rel="noopener">
                  {{ proposal.tx_hash | slice:0:24 }}...
                </a>
              </div>
            }
            @if (onChainStatus) {
              <div class="audit-row">
                <span class="audit-key">ON-CHAIN</span>
                <span class="audit-val">Proposal: {{ onChainStatus.proposalVerified ? 'verified' : 'not verified' }} · Result: {{ onChainStatus.resultVerified ? 'verified' : 'not verified' }}</span>
              </div>
            }
          </section>
        }

        <!-- Comments -->
        <section class="comments-section">
          <div class="comments-head">
            <h3 class="section-label">{{ i18n.t('proposal.discussion') }}</h3>
            <button class="nv-btn nv-btn-outline" (click)="refreshChatSummary()" [disabled]="chatSummaryLoading || !proposal.id">
              {{ chatSummaryLoading ? 'Summarizing…' : 'Summarize Chats' }}
            </button>
          </div>

          @if (chatSummary) {
            <section class="summary-card chat-summary-card">
              <span class="summary-label">AI CHAT SUMMARY</span>
              <p>{{ chatSummary.summary }}</p>
              <p><strong>Key pros:</strong> {{ (chatSummary.keyPros || []).join('; ') || '-' }}</p>
              <p><strong>Key cons:</strong> {{ (chatSummary.keyCons || []).join('; ') || '-' }}</p>
              <p><strong>Comments analyzed:</strong> {{ chatSummary.commentCount || 0 }}</p>
            </section>
          }

          @if (auth.isLoggedIn()) {
            <div class="comment-form">
              <select class="nv-input" [(ngModel)]="commentStance" [ngModelOptions]="{standalone: true}">
                <option value="neutral">Neutral</option>
                <option value="for">For</option>
                <option value="against">Against</option>
              </select>
              <textarea
                class="nv-input"
                [placeholder]="i18n.t('proposal.comment.placeholder')"
                [(ngModel)]="newComment"
                rows="3"
              ></textarea>
              <button
                class="nv-btn nv-btn-primary"
                (click)="addComment()"
                [disabled]="!newComment.trim() || submittingComment"
              >
                {{ i18n.t('proposal.comment.submit') }}
              </button>
            </div>
          }

          <div class="comment-sections">
            <div class="comment-lane">
              <h4 class="lane-title">{{ stanceLabel('for') }}</h4>
              @for (comment of sectionComments('for'); track comment.id) {
                <div class="comment-card"
                  [class.is-author]="comment.user_id === proposal!.created_by"
                  [class.is-own]="comment.user_id === auth.user()?.id">
                  <div class="comment-top">
                    <div class="comment-info">
                      <a [routerLink]="['/user', comment.user_id]" class="comment-name">{{ comment.author_name }}</a>
                      @if (comment.user_id === proposal!.created_by) {
                        <span class="comment-tag tag-author">{{ i18n.t('comment.author') }}</span>
                      }
                      @if (comment.user_id === auth.user()?.id) {
                        <span class="comment-tag tag-you">{{ i18n.t('comment.you') }}</span>
                      }
                    </div>
                    <span class="comment-date">{{ comment.created_at | date:'short' }}</span>
                  </div>
                  <p class="comment-body">{{ comment.body }}</p>
                  <div class="comment-info">
                    @if (comment.is_pinned_expert) {
                      <span class="comment-tag tag-author">expert</span>
                    }
                    @if ((auth.user()?.role === 'admin' || auth.user()?.role === 'superadmin') && !comment.is_pinned_expert) {
                      <button class="nv-btn nv-btn-outline" (click)="pinExpert(comment.id)">Pin expert</button>
                    }
                  </div>

                  @for (reply of childComments(comment.id); track reply.id) {
                    <div class="comment-card reply-card">
                      <div class="comment-top">
                        <a [routerLink]="['/user', reply.user_id]" class="comment-name">{{ reply.author_name || 'User' }}</a>
                        <span class="comment-date">{{ reply.created_at | date:'short' }}</span>
                      </div>
                      <p class="comment-body">{{ reply.body }}</p>
                    </div>
                  }

                  @if (auth.isLoggedIn()) {
                    <div class="reply-row">
                      <input class="nv-input" [ngModel]="replyDrafts[comment.id]" (ngModelChange)="replyDrafts[comment.id] = $event" [placeholder]="i18n.t('proposal.comment.placeholder')" />
                      <button class="nv-btn nv-btn-outline" (click)="addReply(comment.id)">{{ i18n.t('proposal.comment.submit') }}</button>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="comment-lane">
              <h4 class="lane-title">{{ stanceLabel('against') }}</h4>
              @for (comment of sectionComments('against'); track comment.id) {
                <div class="comment-card"
                  [class.is-author]="comment.user_id === proposal!.created_by"
                  [class.is-own]="comment.user_id === auth.user()?.id">
                  <div class="comment-top">
                    <div class="comment-info">
                      <a [routerLink]="['/user', comment.user_id]" class="comment-name">{{ comment.author_name }}</a>
                      @if (comment.user_id === proposal!.created_by) {
                        <span class="comment-tag tag-author">{{ i18n.t('comment.author') }}</span>
                      }
                      @if (comment.user_id === auth.user()?.id) {
                        <span class="comment-tag tag-you">{{ i18n.t('comment.you') }}</span>
                      }
                    </div>
                    <span class="comment-date">{{ comment.created_at | date:'short' }}</span>
                  </div>
                  <p class="comment-body">{{ comment.body }}</p>

                  @for (reply of childComments(comment.id); track reply.id) {
                    <div class="comment-card reply-card">
                      <div class="comment-top">
                        <a [routerLink]="['/user', reply.user_id]" class="comment-name">{{ reply.author_name || 'User' }}</a>
                        <span class="comment-date">{{ reply.created_at | date:'short' }}</span>
                      </div>
                      <p class="comment-body">{{ reply.body }}</p>
                    </div>
                  }

                  @if (auth.isLoggedIn()) {
                    <div class="reply-row">
                      <input class="nv-input" [ngModel]="replyDrafts[comment.id]" (ngModelChange)="replyDrafts[comment.id] = $event" [placeholder]="i18n.t('proposal.comment.placeholder')" />
                      <button class="nv-btn nv-btn-outline" (click)="addReply(comment.id)">{{ i18n.t('proposal.comment.submit') }}</button>
                    </div>
                  }
                </div>
              }
            </div>

            <div class="comment-lane">
              <h4 class="lane-title">{{ stanceLabel('neutral') }}</h4>
              @for (comment of sectionComments('neutral'); track comment.id) {
                <div class="comment-card"
                  [class.is-author]="comment.user_id === proposal!.created_by"
                  [class.is-own]="comment.user_id === auth.user()?.id">
                  <div class="comment-top">
                    <div class="comment-info">
                      <a [routerLink]="['/user', comment.user_id]" class="comment-name">{{ comment.author_name }}</a>
                      @if (comment.user_id === proposal!.created_by) {
                        <span class="comment-tag tag-author">{{ i18n.t('comment.author') }}</span>
                      }
                      @if (comment.user_id === auth.user()?.id) {
                        <span class="comment-tag tag-you">{{ i18n.t('comment.you') }}</span>
                      }
                    </div>
                    <span class="comment-date">{{ comment.created_at | date:'short' }}</span>
                  </div>
                  <p class="comment-body">{{ comment.body }}</p>

                  @for (reply of childComments(comment.id); track reply.id) {
                    <div class="comment-card reply-card">
                      <div class="comment-top">
                        <a [routerLink]="['/user', reply.user_id]" class="comment-name">{{ reply.author_name || 'User' }}</a>
                        <span class="comment-date">{{ reply.created_at | date:'short' }}</span>
                      </div>
                      <p class="comment-body">{{ reply.body }}</p>
                    </div>
                  }

                  @if (auth.isLoggedIn()) {
                    <div class="reply-row">
                      <input class="nv-input" [ngModel]="replyDrafts[comment.id]" (ngModelChange)="replyDrafts[comment.id] = $event" [placeholder]="i18n.t('proposal.comment.placeholder')" />
                      <button class="nv-btn nv-btn-outline" (click)="addReply(comment.id)">{{ i18n.t('proposal.comment.submit') }}</button>
                    </div>
                  }
                </div>
              }
            </div>
          </div>

          @if (proposal.comments && proposal.comments.length === 0) {
            <p class="empty-comments">{{ i18n.t('proposal.comment.empty') }}</p>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    /* ── Header ── */
    .proposal-header {
      padding: var(--sp-4) 0 var(--sp-3);
      border-bottom: 2px solid var(--border);
      margin-bottom: var(--sp-3);
    }

    .meta-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: var(--sp-1);
    }

    .meta-community {
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--brand-primary-dark);
      text-decoration: none;
    }

    .meta-community:hover {
      text-decoration: underline;
    }

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

    .detail-title {
      font-size: clamp(1.5rem, 4vw, 2.25rem);
      font-weight: 800;
      letter-spacing: -0.03em;
      line-height: 1.1;
      color: var(--text-primary);
      margin-bottom: 8px;
    }

    .detail-meta {
      font-size: var(--fs-sm);
      color: var(--muted);
    }

    .author-link {
      color: var(--text-secondary);
      text-decoration: none;
      font-weight: 600;
    }
    .author-link:hover { color: var(--brand-primary); }

    .meta-sep { margin: 0 4px; }

    .header-actions {
      margin-top: var(--sp-1);
      display: flex;
      align-items: center;
      gap: var(--sp-1);
      flex-wrap: wrap;
    }

    .checkbox-inline {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: var(--fs-xs);
      color: var(--muted);
    }

    /* ── Summary ── */
    .summary-card {
      padding: var(--sp-3);
      border: 2px solid var(--brand-primary);
      border-left-width: 6px;
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-2);
      background: rgba(96,10,255,0.03);
    }

    .summary-label {
      display: block;
      font-size: var(--fs-xs);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--brand-primary-dark);
      margin-bottom: 8px;
    }

    .summary-card p {
      font-size: var(--fs-sm);
      line-height: 1.6;
      color: var(--text-secondary);
      overflow-wrap: anywhere;
    }

    /* ── Body ── */
    .body-card {
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-3);
    }

    .body-text {
      white-space: pre-wrap;
      line-height: 1.7;
      font-size: var(--fs-sm);
      color: var(--text-primary);
      overflow-wrap: anywhere;
    }

    /* ── Sections ── */
    .section-label {
      font-size: var(--fs-sm);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-primary);
      margin-bottom: var(--sp-2);
    }

    /* ── Vote ── */
    .vote-section {
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-3);
      text-align: center;
    }

    .vote-buttons {
      display: flex;
      gap: var(--sp-1);
      justify-content: center;
      margin-bottom: var(--sp-2);
    }

    .vote-btn {
      flex: 1;
      max-width: 140px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: var(--sp-2) var(--sp-1);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      background: none;
      font-weight: 700;
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      transition:
        transform var(--motion-fast),
        box-shadow var(--motion-fast),
        border-color var(--motion-fast),
        background var(--motion-fast);
    }

    .vote-icon {
      font-size: var(--fs-lg);
    }

    .vote-btn:active {
      transform: scale(0.96);
    }

    .vote-btn-yes:hover, .vote-btn-yes.active {
      border-color: var(--success);
      color: var(--success);
    }
    .vote-btn-yes.active {
      background: var(--success);
      color: white;
      box-shadow: 0 0 0 3px rgba(22,163,74,0.2);
    }

    .vote-btn-no:hover, .vote-btn-no.active {
      border-color: var(--danger);
      color: var(--danger);
    }
    .vote-btn-no.active {
      background: var(--danger);
      color: white;
      box-shadow: 0 0 0 3px rgba(220,38,38,0.2);
    }

    .vote-btn-abstain:hover, .vote-btn-abstain.active {
      border-color: var(--muted);
      color: var(--muted);
    }
    .vote-btn-abstain.active {
      background: var(--stone);
      color: white;
      box-shadow: 0 0 0 3px rgba(120,113,108,0.2);
    }

    .vote-btn.pulse {
      animation: votePulse 0.5s ease;
    }

    @keyframes votePulse {
      0% { transform: scale(1); }
      30% { transform: scale(1.08); }
      50% { transform: scale(0.95); }
      70% { transform: scale(1.03); }
      100% { transform: scale(1); }
    }

    .undo-btn {
      font-size: var(--fs-xs);
    }

    .vote-notice {
      font-size: var(--fs-sm);
      color: var(--muted);
    }

    .vote-notice a {
      color: var(--brand-primary);
      font-weight: 700;
    }

    .extend-section {
      padding: var(--sp-2);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-3);
      background: var(--bg-muted);
    }

    .extend-help {
      font-size: var(--fs-sm);
      color: var(--muted);
      margin-bottom: var(--sp-1);
    }

    .extend-controls {
      display: flex;
      gap: var(--sp-1);
      align-items: center;
      flex-wrap: wrap;
    }

    .extend-input {
      width: 92px;
    }

    /* ── Results ── */
    .results-section {
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-3);
    }

    .result-bar {
      height: 14px;
      border-radius: var(--r-sm);
      background: var(--bg-muted);
      border: 2px solid var(--border);
      overflow: hidden;
      display: flex;
      margin-bottom: var(--sp-2);
    }

    .result-fill {
      height: 100%;
      transition: width 0.6s cubic-bezier(0.2,0.9,0.2,1);
    }

    .result-yes { background: var(--success); }
    .result-no { background: var(--danger); }

    .result-stats {
      display: flex;
      justify-content: space-around;
      text-align: center;
    }

    .result-num {
      display: block;
      font-size: var(--fs-xl);
      font-weight: 800;
      letter-spacing: -0.02em;
    }

    .result-num.yes { color: var(--success); }
    .result-num.no { color: var(--danger); }

    .result-label {
      font-size: var(--fs-xs);
      color: var(--muted);
      font-weight: 600;
    }

    /* ── Audit ── */
    .audit-section {
      padding: var(--sp-3);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-3);
    }

    .audit-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }

    .audit-key {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--muted);
      min-width: 100px;
    }

    .audit-val {
      font-size: var(--fs-xs);
      color: var(--text-secondary);
      word-break: break-all;
      font-family: 'SF Mono', monospace;
    }

    .audit-link {
      font-size: var(--fs-xs);
      font-family: 'SF Mono', monospace;
      color: var(--brand-primary);
    }

    /* ── Comments ── */
    .comments-section {
      padding-top: var(--sp-3);
      border-top: 2px solid var(--border);
    }

    .comments-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--sp-2);
      margin-bottom: var(--sp-2);
    }

    .chat-summary-card {
      margin-bottom: var(--sp-2);
    }

    .comment-sections {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--sp-2);
    }

    .comment-lane {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
    }

    .lane-title {
      margin: 0;
      font-size: var(--fs-xs);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }

    .comment-form {
      display: flex;
      flex-direction: column;
      gap: var(--sp-1);
      align-items: flex-end;
      margin-bottom: var(--sp-3);
    }

    .comment-form textarea {
      width: 100%;
    }

    .comment-card {
      padding: var(--sp-2);
      border: 2px solid var(--border);
      border-radius: var(--r-sm);
      margin-bottom: var(--sp-2);
    }

    .reply-card {
      margin-top: var(--sp-1);
      margin-left: var(--sp-2);
      border-style: dashed;
    }

    .reply-row {
      display: flex;
      gap: var(--sp-1);
      margin-top: var(--sp-1);
    }

    .reply-row .nv-input {
      flex: 1;
    }

    .comment-card.is-author {
      border-left: 4px solid var(--brand-primary);
    }

    .comment-card.is-own {
      border-left: 4px solid var(--success);
    }

    .comment-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .comment-info {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .comment-name {
      font-size: var(--fs-sm);
      font-weight: 700;
      color: var(--text-primary);
      text-decoration: none;
    }

    .comment-name:hover {
      color: var(--brand-primary);
    }

    .comment-tag {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 6px;
      border-radius: 2px;
    }

    .tag-author { background: var(--brand-primary); color: white; }
    .tag-you { background: var(--success); color: white; }

    .comment-date {
      font-size: var(--fs-xs);
      color: var(--muted);
    }

    .comment-body {
      font-size: var(--fs-sm);
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .empty-comments {
      text-align: center;
      padding: var(--sp-4);
      color: var(--muted);
      font-size: var(--fs-sm);
    }

    /* ── Skeleton ── */
    .skeleton-detail { padding: var(--sp-4) 0; }
    .skeleton { background: var(--bg-muted); border-radius: var(--r-sm); animation: pulse 1.2s infinite; }
    .skeleton-h1 { width: 60%; height: 32px; margin-bottom: var(--sp-2); }
    .skeleton-p { width: 40%; height: 16px; margin-bottom: var(--sp-3); }
    .skeleton-block { width: 100%; height: 200px; }
    @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

    @media (max-width: 768px) {
      .vote-buttons {
        flex-direction: column;
        max-width: 200px;
        margin: 0 auto var(--sp-2);
      }
      .vote-btn { max-width: 100%; }
      .result-stats { flex-wrap: wrap; gap: var(--sp-2); }
      .comment-sections { grid-template-columns: 1fr; }
    }
  `],
})
export class ProposalDetailComponent implements OnInit {
  proposal: Proposal | null = null;
  loading = true;
  currentVote = '';
  voteMessage = '';
  voting = false;
  justVoted = '';
  newComment = '';
  submittingComment = false;
  extendDays = 3;
  extending = false;
  commentStance: 'for' | 'against' | 'neutral' = 'neutral';
  assistant: any = null;
  chatSummary: { summary: string; keyPros: string[]; keyCons: string[]; commentCount: number } | null = null;
  chatSummaryLoading = false;
  onChainStatus: any = null;
  watching = false;
  watchBusy = false;
  replyDrafts: Record<string, string> = {};
  draftActionBusy = false;

  constructor(
    public auth: AuthService,
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    public i18n: I18nService,
    private toast: ToastService,
    private offline: OfflineDraftService,
    public networkPrefs: NetworkPreferencesService
  ) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.api.getProposal(id).subscribe({
      next: (proposal) => {
        this.proposal = proposal;
        this.currentVote = proposal.currentUserVote || '';
        this.loading = false;
        this.loadAssistantAndVerification(proposal.id);
        this.loadChatSummary(proposal.id);
        this.loadWatchState();
        this.flushQueue(proposal.id);
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  isDeadlinePassed(): boolean {
    if (!this.proposal?.deadline) return false;
    return new Date(this.proposal.deadline) < new Date();
  }

  getPercent(type: 'yes' | 'no'): number {
    if (!this.proposal) return 0;
    const total = this.proposal.yes_count + this.proposal.no_count + this.proposal.abstain_count;
    if (total === 0) return 0;
    return (this.proposal[`${type}_count`] / total) * 100;
  }

  castVote(choice: 'yes' | 'no' | 'abstain'): void {
    if (!this.proposal) return;
    const proposalId = this.proposal.id;
    this.voting = true;
    this.voteMessage = '';
    this.justVoted = '';

    this.api.vote(proposalId, choice).subscribe({
      next: (res) => {
        this.currentVote = choice;
        this.justVoted = choice;
        this.voteMessage = res.message;
        this.toast.show(this.i18n.t('toast.vote'));
        if (this.proposal) {
          this.proposal.yes_count = res.counts.yes;
          this.proposal.no_count = res.counts.no;
          this.proposal.abstain_count = res.counts.abstain;
        }
        this.voting = false;
        setTimeout(() => this.justVoted = '', 600);
      },
      error: (err) => {
        const offline = !navigator.onLine;
        if (offline) {
          this.offline.enqueueAction({ type: 'vote', proposalId, payload: { choice } });
          this.toast.show('Offline: vote queued and will sync when online.');
          this.voteMessage = 'Vote queued offline.';
        } else {
          this.voteMessage = err.error?.error || 'Failed to vote.';
        }
        this.voting = false;
      },
    });
  }

  undoVote(): void {
    if (!this.proposal) return;
    this.voting = true;

    this.api.undoVote(this.proposal.id).subscribe({
      next: (res) => {
        this.currentVote = '';
        this.voteMessage = res.message;
        this.toast.show(this.i18n.t('toast.voteundo'));
        if (this.proposal) {
          this.proposal.yes_count = res.counts.yes;
          this.proposal.no_count = res.counts.no;
          this.proposal.abstain_count = res.counts.abstain;
        }
        this.voting = false;
      },
      error: (err) => {
        this.voteMessage = err.error?.error || 'Failed to undo vote.';
        this.voting = false;
      },
    });
  }

  addComment(): void {
    if (!this.proposal || !this.newComment.trim()) return;
    this.submittingComment = true;

    this.api.addComment(this.proposal.id, this.newComment, undefined, this.commentStance).subscribe({
      next: (comment) => {
        if (this.proposal?.comments) {
          this.proposal.comments.push(comment);
        }
        if (this.proposal) {
          this.loadChatSummary(this.proposal.id);
        }
        this.newComment = '';
        this.commentStance = 'neutral';
        this.submittingComment = false;
      },
      error: () => {
        if (this.proposal && !navigator.onLine) {
          this.offline.enqueueAction({
            type: 'comment',
            proposalId: this.proposal.id,
            payload: { body: this.newComment, stance: this.commentStance },
          });
          this.toast.show('Offline: comment queued and will sync when online.');
          this.newComment = '';
          this.commentStance = 'neutral';
        }
        this.submittingComment = false;
      },
    });
  }

  addReply(parentId: string): void {
    if (!this.proposal) return;
    const body = (this.replyDrafts[parentId] || '').trim();
    if (!body) return;

    this.api.addComment(this.proposal.id, body, parentId, this.commentStance).subscribe({
      next: (comment) => {
        if (this.proposal?.comments) {
          this.proposal.comments.push(comment);
        }
        if (this.proposal) {
          this.loadChatSummary(this.proposal.id);
        }
        this.replyDrafts[parentId] = '';
      },
      error: () => {
        if (!this.proposal || navigator.onLine) return;
        this.offline.enqueueAction({
          type: 'comment',
          proposalId: this.proposal.id,
          payload: { body, parentId, stance: this.commentStance },
        });
        this.toast.show('Offline: reply queued and will sync when online.');
        this.replyDrafts[parentId] = '';
      },
    });
  }

  sectionComments(stance: 'for' | 'against' | 'neutral'): any[] {
    if (!this.proposal?.comments) return [];
    return this.proposal.comments.filter((comment: any) => {
      const value = comment.stance || 'neutral';
      return value === stance && !comment.parent_id && this.hasVisibleBody(comment.body);
    });
  }

  childComments(parentId: string): any[] {
    if (!this.proposal?.comments) return [];
    return this.proposal.comments.filter((comment: any) => comment.parent_id === parentId && this.hasVisibleBody(comment.body));
  }

  pinExpert(commentId: string): void {
    if (!this.proposal) return;
    this.api.pinExpertComment(this.proposal.id, commentId).subscribe({
      next: () => {
        this.toast.show('Pinned expert response.');
        this.api.getProposal(this.proposal!.id).subscribe({
          next: (proposal) => {
            this.proposal = proposal;
          },
        });
      },
      error: () => this.toast.show('Failed to pin expert response.'),
    });
  }

  toggleLowBandwidth(event: Event): void {
    this.networkPrefs.setLowBandwidth((event.target as HTMLInputElement).checked);
  }

  toggleWatch(): void {
    if (!this.proposal) return;
    this.watchBusy = true;
    this.api.setProposalWatch(this.proposal.id, !this.watching).subscribe({
      next: () => {
        this.watching = !this.watching;
        this.watchBusy = false;
      },
      error: () => {
        this.watchBusy = false;
        this.toast.show('Failed to update follow status.');
      },
    });
  }

  private loadWatchState(): void {
    if (!this.proposal) return;
    this.api.getWatchedProposals().subscribe({
      next: (res) => {
        this.watching = res.proposals.some((item) => item.id === this.proposal!.id);
      },
    });
  }

  private loadAssistantAndVerification(proposalId: string): void {
    if (!this.networkPrefs.shouldReducePayloads()) {
      this.api.getProposalAssistant(proposalId).subscribe({ next: (res) => (this.assistant = res) });
    } else {
      this.assistant = null;
    }
    this.api.getOnChainStatus(proposalId).subscribe({ next: (res) => (this.onChainStatus = res) });
  }

  private loadChatSummary(proposalId: string): void {
    this.chatSummaryLoading = true;
    this.api.getDiscussionSummary(proposalId).subscribe({
      next: (res) => {
        this.chatSummary = {
          summary: res.summary,
          keyPros: res.keyPros || [],
          keyCons: res.keyCons || [],
          commentCount: res.commentCount || 0,
        };
        this.chatSummaryLoading = false;
      },
      error: () => {
        this.chatSummaryLoading = false;
      },
    });
  }

  refreshChatSummary(): void {
    if (!this.proposal) return;
    this.loadChatSummary(this.proposal.id);
  }

  private flushQueue(proposalId: string): void {
    if (!navigator.onLine) return;
    const queue = this.offline.getQueue().filter((item) => item.proposalId === proposalId);
    for (const item of queue) {
      if (item.type === 'vote') {
        this.api.vote(proposalId, item.payload.choice).subscribe({
          next: () => this.offline.removeFromQueue(item.id),
          error: () => undefined,
        });
      }
      if (item.type === 'comment') {
        this.api.addComment(proposalId, item.payload.body, item.payload.parentId, item.payload.stance || 'neutral').subscribe({
          next: () => this.offline.removeFromQueue(item.id),
          error: () => undefined,
        });
      }
    }
  }

  shouldShowAssistant(): boolean {
    if (!this.assistant?.simpleExplanation) {
      return false;
    }

    const summary = (this.proposal?.summary || '').trim().toLowerCase();
    const explanation = (this.assistant.simpleExplanation || '').trim().toLowerCase();
    const hasDiscussion = !!this.assistant?.discussionSummary;
    return hasDiscussion || (summary.length > 0 && explanation.length > 0 && summary !== explanation);
  }

  explainerLabel(): string {
    const locale = this.i18n.locale();
    if (locale === 'ta') return 'AI விளக்கம்';
    if (locale === 'hi') return 'AI व्याख्या';
    if (locale === 'kn') return 'AI ವಿವರಣೆ';
    if (locale === 'ml') return 'AI വിശദീകരണം';
    if (locale === 'te') return 'AI వివరణ';
    return 'AI EXPLAINER';
  }

  stanceLabel(stance: 'for' | 'against' | 'neutral'): string {
    const locale = this.i18n.locale();
    if (locale === 'ta') {
      if (stance === 'for') return 'ஆதரவாக';
      if (stance === 'against') return 'எதிராக';
      return 'நடுநிலை';
    }
    if (locale === 'hi') {
      if (stance === 'for') return 'पक्ष में';
      if (stance === 'against') return 'विरोध में';
      return 'तटस्थ';
    }
    if (locale === 'kn') {
      if (stance === 'for') return 'ಪಕ್ಷದಲ್ಲಿ';
      if (stance === 'against') return 'ವಿರೋಧದಲ್ಲಿ';
      return 'ತಟಸ್ಥ';
    }
    if (locale === 'ml') {
      if (stance === 'for') return 'പക്ഷത്ത്';
      if (stance === 'against') return 'എതിർ';
      return 'നിഷ്പക്ഷം';
    }
    if (locale === 'te') {
      if (stance === 'for') return 'మద్దతుగా';
      if (stance === 'against') return 'వ్యతిరేకంగా';
      return 'తటస్థం';
    }
    if (stance === 'for') return 'For';
    if (stance === 'against') return 'Against';
    return 'Neutral';
  }

  private hasVisibleBody(value: string | null | undefined): boolean {
    return !!value && value.trim().length > 0;
  }

  canManageDraft(): boolean {
    if (!this.proposal || this.proposal.status !== 'draft') return false;
    const user = this.auth.user();
    if (!user) return false;

    const creator = this.proposal.created_by === user.id;
    const admin = user.role === 'admin' || user.role === 'superadmin';
    return creator || admin;
  }

  canSubmitForReview(): boolean {
    const reviewStatus = this.proposal?.review_status || 'draft';
    return reviewStatus === 'draft' || reviewStatus === 'changes_requested';
  }

  submitDraftForReview(): void {
    if (!this.proposal) return;
    this.draftActionBusy = true;
    this.api.submitProposalForReview(this.proposal.id).subscribe({
      next: (res) => {
        this.toast.show(res.message);
        if (this.proposal) {
          this.proposal.review_status = 'pending_review';
        }
        this.draftActionBusy = false;
      },
      error: (err) => {
        this.toast.show(err.error?.error || 'Failed to submit draft for review.');
        this.draftActionBusy = false;
      },
    });
  }

  publishDraft(): void {
    if (!this.proposal) return;
    this.draftActionBusy = true;
    this.api.publishProposal(this.proposal.id).subscribe({
      next: (res) => {
        this.toast.show(res.message);
        if (this.proposal) {
          this.proposal.status = res.status;
          this.proposal.review_status = res.reviewStatus as any;
        }
        this.draftActionBusy = false;
      },
      error: (err) => {
        this.toast.show(err.error?.error || 'Failed to publish draft.');
        this.draftActionBusy = false;
      },
    });
  }

  deleteDraft(): void {
    if (!this.proposal) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Delete this draft permanently?')
      : true;
    if (!confirmed) return;

    this.draftActionBusy = true;
    this.api.deleteDraftProposal(this.proposal.id).subscribe({
      next: (res) => {
        this.toast.show(res.message);
        this.draftActionBusy = false;
        this.router.navigate(['/home']);
      },
      error: (err) => {
        this.toast.show(err.error?.error || 'Failed to delete draft.');
        this.draftActionBusy = false;
      },
    });
  }

  canExtendVoting(): boolean {
    if (!this.proposal || !this.auth.isLoggedIn()) return false;
    const user = this.auth.user();
    if (!user || this.proposal.status !== 'voting') return false;

    const isCreator = this.proposal.created_by === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'superadmin';
    return isCreator || isAdmin;
  }

  extendDeadline(): void {
    if (!this.proposal) return;
    const days = Number(this.extendDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      this.toast.show('Enter a value between 1 and 30 days.');
      return;
    }

    this.extending = true;
    this.api.extendProposalDeadline(this.proposal.id, days).subscribe({
      next: (res) => {
        if (this.proposal) {
          this.proposal.deadline = res.deadline;
        }
        this.toast.show(res.message);
        this.extending = false;
      },
      error: (err) => {
        this.toast.show(err.error?.error || 'Failed to extend voting deadline.');
        this.extending = false;
      },
    });
  }
}
