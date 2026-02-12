import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

interface UserProfile {
    id: string;
    displayName: string;
    regionCode: string;
    role: string;
    createdAt: string;
    proposalsCreated: number;
    votesCast: number;
    communitiesJoined: number;
    proposals?: any[];
}

@Component({
    selector: 'nv-user-profile',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <div class="nv-container">
      @if (loading) {
        <div class="skeleton-profile">
          <div class="skeleton-avatar skeleton-pulse"></div>
          <div style="flex:1">
            <div class="skeleton-line skeleton-pulse" style="width:40%;height:28px"></div>
            <div class="skeleton-line skeleton-pulse" style="width:25%;margin-top:8px"></div>
          </div>
        </div>
      }

      @if (error) {
        <div class="nv-card error-card">
          <p>{{ error }}</p>
          <a routerLink="/home" class="nv-btn nv-btn-primary" style="margin-top:var(--sp-2)">{{ i18n.t('general.back') }}</a>
        </div>
      }

      @if (profile) {
        <div class="profile-header">
          <div class="profile-avatar">
            <span class="avatar-initial">{{ getInitial() }}</span>
          </div>
          <div class="profile-info">
            <h1 class="profile-name">{{ profile.displayName }}</h1>
            <div class="profile-meta">
              <span class="badge badge-region">{{ profile.regionCode }}</span>
              @if (profile.role === 'admin' || profile.role === 'superadmin') {
                <span class="badge badge-role">{{ profile.role }}</span>
              }
            </div>
            <p class="member-since">{{ i18n.t('user.profile.membersince') }} {{ profile.createdAt | date:'mediumDate' }}</p>
          </div>
          @if (isOwnProfile()) {
            <button class="nv-btn nv-btn-outline logout-btn" (click)="auth.logout()">
              {{ i18n.t('nav.signout') }}
            </button>
          }
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <p class="stat-value">{{ profile.proposalsCreated }}</p>
            <p class="stat-label">{{ i18n.t('user.profile.proposals') }}</p>
          </div>
          <div class="stat-card">
            <p class="stat-value">{{ profile.votesCast }}</p>
            <p class="stat-label">{{ i18n.t('user.profile.votes') }}</p>
          </div>
          <div class="stat-card">
            <p class="stat-value">{{ profile.communitiesJoined }}</p>
            <p class="stat-label">{{ i18n.t('user.profile.communities') }}</p>
          </div>
        </div>

        @if (profile.proposals && profile.proposals.length > 0) {
          <div class="proposals-section">
            <h2 class="section-title">{{ i18n.t('user.profile.recent') }}</h2>
            @for (proposal of profile.proposals; track proposal.id) {
              <a [routerLink]="['/proposal', proposal.id]" class="proposal-card">
                <div class="proposal-meta">
                  <span class="badge badge-cat">{{ proposal.category }}</span>
                  <span class="meta-text">{{ proposal.community_name }}</span>
                </div>
                <h3 class="proposal-title">{{ proposal.title }}</h3>
                <p class="proposal-excerpt">{{ proposal.summary || (proposal.text | slice:0:120) + '...' }}</p>
                <div class="proposal-footer">
                  <div class="vote-counts">
                    <span class="vote-yes">{{ proposal.yes_count }} Yes</span>
                    <span class="vote-no">{{ proposal.no_count }} No</span>
                  </div>
                  <span class="badge" [attr.data-status]="proposal.status">{{ proposal.status }}</span>
                </div>
              </a>
            }
          </div>
        }

        @if (profile.proposals && profile.proposals.length === 0) {
          <div class="empty-state">
            <p>{{ i18n.t('user.profile.noproposals') }}</p>
          </div>
        }
      }
    </div>
  `,
    styles: [`
    /* Skeleton */
    .skeleton-profile { display:flex; gap:var(--sp-2); align-items:center; padding:var(--sp-3) 0; }
    .skeleton-avatar { width:80px; height:80px; border-radius:var(--r-sm); background:var(--surface-alt); }
    .skeleton-line { height:16px; border-radius:var(--r-sm); background:var(--surface-alt); }
    .skeleton-pulse { animation:pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }

    /* Header */
    .profile-header { display:flex; gap:var(--sp-3); align-items:center; padding:var(--sp-3) 0; border-bottom:2px solid var(--border-strong); margin-bottom:var(--sp-3); }
    .profile-avatar { width:80px; height:80px; border-radius:var(--r-sm); border:2px solid var(--border-strong); display:flex; align-items:center; justify-content:center; background:var(--surface); flex-shrink:0; }
    .avatar-initial { font-size:var(--fs-3xl); font-weight:800; color:var(--brand-primary); }
    .profile-info { flex:1; }
    .profile-name { font-size:var(--fs-2xl); font-weight:800; letter-spacing:-0.02em; margin:0; }
    .logout-btn { margin-left:auto; }
    .profile-meta { display:flex; gap:8px; margin:6px 0; }
    .badge { display:inline-block; padding:2px 10px; border:2px solid var(--border-strong); border-radius:var(--r-sm); font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
    .badge-region { background:var(--surface-alt); }
    .badge-role { background:var(--success); color:#fff; border-color:var(--success); }
    .badge-cat { background:var(--brand-primary); color:#fff; border-color:var(--brand-primary); }
    .badge[data-status="voting"] { background:var(--warning); border-color:var(--warning); }
    .badge[data-status="passed"],.badge[data-status="implemented"] { background:var(--success); color:#fff; border-color:var(--success); }
    .badge[data-status="failed"] { background:var(--danger); color:#fff; border-color:var(--danger); }
    .member-since { font-size:var(--fs-xs); color:var(--muted); margin:0; }

    /* Stats */
    .stats-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:var(--sp-2); }
    .stat-card { text-align:center; padding:var(--sp-2); border:2px solid var(--border-strong); border-radius:var(--r-sm); background:var(--surface); }
    .stat-value { font-size:var(--fs-3xl); font-weight:800; color:var(--brand-primary); margin:0 0 4px; }
    .stat-label { font-size:var(--fs-xs); font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:0; }

    /* Proposals */
    .proposals-section { margin-top:var(--sp-4); }
    .section-title { font-size:var(--fs-lg); font-weight:800; text-transform:uppercase; letter-spacing:0.04em; padding-bottom:8px; border-bottom:2px solid var(--border-strong); margin-bottom:var(--sp-2); }
    .proposal-card { display:block; text-decoration:none; color:inherit; padding:var(--sp-2); border:2px solid var(--border-strong); border-radius:var(--r-sm); background:var(--surface); margin-bottom:var(--sp-2); transition:transform var(--motion-fast) ease, box-shadow var(--motion-fast) ease; cursor:pointer; }
    .proposal-card:hover { transform:translate(-2px,-2px); box-shadow:4px 4px 0 var(--border-strong); }
    .proposal-meta { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
    .meta-text { font-size:var(--fs-xs); color:var(--muted); }
    .proposal-title { font-size:var(--fs-base); font-weight:700; margin:0 0 4px; }
    .proposal-excerpt { font-size:var(--fs-sm); color:var(--text-secondary); overflow-wrap:anywhere; word-break:break-word; margin:0 0 8px; }
    .proposal-footer { display:flex; align-items:center; justify-content:space-between; }
    .vote-counts { display:flex; gap:var(--sp-2); font-size:var(--fs-sm); font-weight:700; }
    .vote-yes { color:var(--success); }
    .vote-no { color:var(--danger); }

    .error-card { text-align:center; padding:var(--sp-4); border:2px solid var(--danger); border-radius:var(--r-sm); }
    .empty-state { text-align:center; padding:var(--sp-4); border:2px dashed var(--border-strong); border-radius:var(--r-sm); color:var(--muted); margin-top:var(--sp-3); }

    @media (max-width:640px) {
      .profile-header { flex-direction:column; text-align:center; }
      .profile-meta { justify-content:center; }
      .stats-grid { grid-template-columns:1fr; }
    }
  `],
})
export class UserProfileComponent implements OnInit {
    profile: UserProfile | null = null;
    loading = true;
    error = '';

    constructor(
        public auth: AuthService,
        private api: ApiService,
        private route: ActivatedRoute,
        public i18n: I18nService
    ) { }

    ngOnInit(): void {
        const userId = this.route.snapshot.paramMap.get('id')!;
        this.loadProfile(userId);
    }

    loadProfile(userId: string): void {
        this.api.getUserProfile(userId).subscribe({
            next: (profile) => {
                this.profile = profile;
                this.loading = false;
            },
            error: (err) => {
                this.error = err.error?.error || 'Failed to load user profile.';
                this.loading = false;
            },
        });
    }

    getInitial(): string {
        if (!this.profile?.displayName) return '?';
        return this.profile.displayName.charAt(0).toUpperCase();
    }

    isOwnProfile(): boolean {
        return this.profile?.id === this.auth.user()?.id;
    }
}
