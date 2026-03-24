import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
    ApiService,
    NotificationItem,
    NotificationSettings,
} from '../../services/api.service';
import { I18nService } from '../../services/i18n.service';
import { ToastService } from '../../services/toast.service';

@Component({
    selector: 'nv-notifications',
    standalone: true,
    imports: [CommonModule, RouterLink],
    template: `
    <div class="nv-container notifications-page">
      <div class="page-header">
        <h1 class="page-title">{{ i18n.t('notifications.title') }}</h1>
        <div class="header-actions">
          <button class="nv-btn nv-btn-outline" (click)="markAllRead()">{{ i18n.t('notifications.markall') }}</button>
        </div>
      </div>

      <section class="settings-card" *ngIf="settings">
        <h2 class="section-title">{{ i18n.t('notifications.settings') }}</h2>
        <div class="toggle-grid">
          <label class="toggle-row"><input type="checkbox" [checked]="settings.enabled" (change)="setSetting('enabled', $event)"/> {{ i18n.t('notifications.all') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.emailEnabled" (change)="setSetting('emailEnabled', $event)"/> {{ i18n.t('notifications.email') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.chatEnabled" (change)="setSetting('chatEnabled', $event)"/> {{ i18n.t('notifications.chat') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.proposalCreatedEnabled" (change)="setSetting('proposalCreatedEnabled', $event)"/> {{ i18n.t('notifications.policycreated') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.voteConfirmationEnabled" (change)="setSetting('voteConfirmationEnabled', $event)"/> {{ i18n.t('notifications.votedone') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.voteReminderEnabled" (change)="setSetting('voteReminderEnabled', $event)"/> {{ i18n.t('notifications.reminder') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.voteResultEnabled" (change)="setSetting('voteResultEnabled', $event)"/> {{ i18n.t('notifications.result') }}</label>
          <label class="toggle-row"><input type="checkbox" [checked]="settings.statusUpdateEnabled" (change)="setSetting('statusUpdateEnabled', $event)"/> {{ i18n.t('notifications.status') }}</label>
        </div>

        <h3 class="community-title">{{ i18n.t('notifications.communities') }}</h3>
        <div class="community-settings">
          <label class="toggle-row" *ngFor="let c of communitySettings; trackBy: trackById">
            <input type="checkbox" [checked]="c.enabled" (change)="setCommunitySetting(c.id, $event)"/>
            <span>{{ c.name }}</span>
          </label>
        </div>
      </section>

      <section class="list-card">
        <h2 class="section-title">{{ i18n.t('notifications.recent') }}</h2>
        <div class="notification-item" *ngFor="let n of notifications; trackBy: trackById" [class.unread]="!n.read">
          <div class="item-top">
            <strong>{{ n.title }}</strong>
            <span>{{ n.created_at | date:'short' }}</span>
          </div>
          <p>{{ n.body }}</p>
          <div class="item-actions">
            <a *ngIf="n.entity_type === 'proposal' && n.entity_id" [routerLink]="['/proposal', n.entity_id]" class="nv-btn nv-btn-outline">{{ i18n.t('notifications.open') }}</a>
            <button *ngIf="!n.read" class="nv-btn nv-btn-outline" (click)="markRead(n.id)">{{ i18n.t('notifications.markread') }}</button>
          </div>
        </div>

        <p *ngIf="notifications.length === 0" class="empty">{{ i18n.t('notifications.empty') }}</p>
      </section>

      <section class="list-card">
        <h2 class="section-title">Watchlist</h2>
        <div class="notification-item" *ngFor="let p of watchedProposals; trackBy: trackById">
          <div class="item-top">
            <strong>{{ p.title }}</strong>
            <span>{{ p.status }}</span>
          </div>
          <p>{{ p.community_name }} · {{ p.deadline | date:'shortDate' }}</p>
          <div class="item-actions">
            <a [routerLink]="['/proposal', p.id]" class="nv-btn nv-btn-outline">{{ i18n.t('notifications.open') }}</a>
          </div>
        </div>
        <p *ngIf="watchedProposals.length === 0" class="empty">No watched proposals.</p>
      </section>

      <section class="list-card">
        <h2 class="section-title">Activity Feed</h2>
        <div class="notification-item" *ngFor="let item of activityFeed; trackBy: trackById">
          <div class="item-top">
            <strong>{{ item.metadata?.title || item.event_type }}</strong>
            <span>{{ item.created_at | date:'short' }}</span>
          </div>
          <p>{{ item.metadata?.body || item.metadata?.summary || 'Activity update' }}</p>
          <div class="item-actions" *ngIf="item.entity_type === 'proposal' && item.entity_id">
            <a [routerLink]="['/proposal', item.entity_id]" class="nv-btn nv-btn-outline">{{ i18n.t('notifications.open') }}</a>
          </div>
        </div>
        <p *ngIf="activityFeed.length === 0" class="empty">No recent feed activity.</p>
      </section>

      <section class="list-card">
        <h2 class="section-title">Community Digest</h2>
        <div class="notification-item" *ngFor="let d of digestCommunities; trackBy: trackByCommunityDigest">
          <div class="item-top">
            <strong>{{ d.community_name }}</strong>
            <span>{{ d.event_count }} events</span>
          </div>
        </div>
        <p *ngIf="digestCommunities.length === 0" class="empty">No digest activity in selected window.</p>
      </section>
    </div>
  `,
    styles: [`
    .notifications-page { display:flex; flex-direction:column; gap:var(--sp-3); }
    .page-header { display:flex; align-items:center; justify-content:space-between; gap:var(--sp-2); }
    .page-title { font-size:clamp(1.4rem,4vw,2rem); font-weight:800; }
    .settings-card, .list-card { border:2px solid var(--border); border-radius:var(--r-sm); padding:var(--sp-2); }
    .section-title { font-size:var(--fs-sm); font-weight:800; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:var(--sp-1); }
    .toggle-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-bottom:var(--sp-2); }
    .toggle-row { display:flex; align-items:center; gap:8px; font-size:var(--fs-sm); }
    .community-title { font-size:var(--fs-xs); font-weight:800; text-transform:uppercase; margin-bottom:8px; color:var(--muted); }
    .community-settings { display:grid; gap:6px; }
    .notification-item { border:2px solid var(--border); border-radius:var(--r-sm); padding:var(--sp-1) var(--sp-2); margin-bottom:var(--sp-1); }
    .notification-item.unread { border-left:4px solid var(--brand-primary); }
    .item-top { display:flex; justify-content:space-between; gap:8px; font-size:var(--fs-sm); }
    .item-top span { color:var(--muted); font-size:var(--fs-xs); }
    .item-actions { display:flex; gap:8px; margin-top:8px; }
    .empty { text-align:center; color:var(--muted); padding:var(--sp-3); }
  `],
})
export class NotificationsComponent implements OnInit, OnDestroy {
    notifications: NotificationItem[] = [];
    settings: NotificationSettings | null = null;
    communitySettings: Array<{ id: string; name: string; slug: string; enabled: boolean }> = [];
    watchedProposals: any[] = [];
    activityFeed: any[] = [];
    digestCommunities: any[] = [];
    private refreshTimer: any = null;

    constructor(private api: ApiService, public i18n: I18nService, private toast: ToastService) { }

    ngOnInit(): void {
        this.load();
        this.refreshTimer = setInterval(() => this.loadNotifications(), 30000);
    }

    ngOnDestroy(): void {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
    }

    trackById(_i: number, item: any): string {
        return item.id;
    }

    trackByCommunityDigest(_i: number, item: any): string {
        return item.community_id;
    }

    load(): void {
        this.loadNotifications();
        this.api.getNotificationSettings().subscribe((s) => (this.settings = s));
        this.api.getCommunityNotificationSettings().subscribe((res) => (this.communitySettings = res.communities));
        this.api.getWatchedProposals().subscribe((res) => (this.watchedProposals = res.proposals));
        this.api.getActivityFeed({ limit: 50 }).subscribe((res) => (this.activityFeed = res.items));
        this.api.getCommunityDigest().subscribe((res) => (this.digestCommunities = res.communities));
    }

    loadNotifications(): void {
        this.api.getNotifications({ limit: 50 }).subscribe((res) => {
            this.notifications = res.notifications;
        });
    }

    markRead(id: string): void {
        this.api.markNotificationRead(id).subscribe(() => {
            const n = this.notifications.find((item) => item.id === id);
            if (n) n.read = true;
            this.toast.show(this.i18n.t('notifications.marked'));
        });
    }

    markAllRead(): void {
        this.api.markAllNotificationsRead().subscribe(() => {
            this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
            this.toast.show(this.i18n.t('notifications.markedall'));
        });
    }

    setSetting(key: keyof NotificationSettings, event: Event): void {
        if (!this.settings) return;
        const checked = (event.target as HTMLInputElement).checked;
        const payload: Partial<NotificationSettings> = { [key]: checked };
        this.api.updateNotificationSettings(payload).subscribe(() => {
            if (!this.settings) return;
            this.settings = { ...this.settings, [key]: checked };
        });
    }

    setCommunitySetting(communityId: string, event: Event): void {
        const enabled = (event.target as HTMLInputElement).checked;
        this.api.updateCommunityNotificationSetting(communityId, enabled).subscribe(() => {
            this.communitySettings = this.communitySettings.map((c) =>
                c.id === communityId ? { ...c, enabled } : c
            );
        });
    }
}
