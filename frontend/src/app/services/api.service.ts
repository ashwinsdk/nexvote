import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface Community {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    owner_user_id: string;
    region_code: string;
    category: string;
    verified: boolean;
    member_count: number;
    proposal_count: number;
    created_at: string;
}

export interface Proposal {
    id: string;
    community_id: string;
    title: string;
    text: string;
    category: string;
    status: string;
    deadline: string | null;
    summary: string | null;
    proposal_hash: string | null;
    result_hash: string | null;
    tx_hash: string | null;
    created_by: string;
    region_code: string;
    yes_count: number;
    no_count: number;
    abstain_count: number;
    community_name?: string;
    community_slug?: string;
    author_name?: string;
    author_id?: string;
    created_at: string;
    finalized_at: string | null;
    comments?: Comment[];
}

export interface Comment {
    id: string;
    proposal_id: string;
    user_id: string;
    parent_id: string | null;
    body: string;
    author_name: string;
    created_at: string;
}

export interface VoteResponse {
    message: string;
    choice: string;
    counts: { yes: number; no: number; abstain: number };
}

export interface NotificationItem {
    id: string;
    type: string;
    title: string;
    body: string;
    entity_type: string | null;
    entity_id: string | null;
    read: boolean;
    read_at: string | null;
    created_at: string;
}

export interface NotificationSettings {
    enabled: boolean;
    emailEnabled: boolean;
    chatEnabled: boolean;
    proposalCreatedEnabled: boolean;
    voteConfirmationEnabled: boolean;
    voteReminderEnabled: boolean;
    voteResultEnabled: boolean;
    statusUpdateEnabled: boolean;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
    private api = environment.apiUrl;

    constructor(private http: HttpClient) { }

    // ── Communities ────────────────────────────────────────────────────────

    getCommunities(params?: {
        region?: string;
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
    }): Observable<{ communities: Community[]; pagination: any }> {
        let httpParams = new HttpParams();
        if (params?.region) httpParams = httpParams.set('region', params.region);
        if (params?.category) httpParams = httpParams.set('category', params.category);
        if (params?.search) httpParams = httpParams.set('search', params.search);
        if (params?.page) httpParams = httpParams.set('page', params.page.toString());
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());

        return this.http.get<{ communities: Community[]; pagination: any }>(
            `${this.api}/communities`,
            { params: httpParams }
        );
    }

    getCommunity(slug: string): Observable<Community> {
        return this.http.get<Community>(`${this.api}/communities/${slug}`);
    }

    createCommunity(data: {
        slug: string;
        name: string;
        description?: string;
        regionCode: string;
        category: string;
    }): Observable<Community> {
        return this.http.post<Community>(`${this.api}/communities`, data);
    }

    joinCommunity(slug: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.api}/communities/${slug}/join`, {});
    }

    leaveCommunity(slug: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.api}/communities/${slug}/leave`, {});
    }

    getCommunityMembership(slug: string): Observable<{ isMember: boolean; canJoin: boolean; reason: string }> {
        return this.http.get<{ isMember: boolean; canJoin: boolean; reason: string }>(
            `${this.api}/communities/${slug}/membership`
        );
    }

    // ── Proposals ─────────────────────────────────────────────────────────

    getProposals(params?: {
        communityId?: string;
        region?: string;
        status?: string;
        category?: string;
        sort?: string;
        page?: number;
        limit?: number;
    }): Observable<{ proposals: Proposal[] }> {
        let httpParams = new HttpParams();
        if (params?.communityId) httpParams = httpParams.set('communityId', params.communityId);
        if (params?.region) httpParams = httpParams.set('region', params.region);
        if (params?.status) httpParams = httpParams.set('status', params.status);
        if (params?.category) httpParams = httpParams.set('category', params.category);
        if (params?.sort) httpParams = httpParams.set('sort', params.sort);
        if (params?.page) httpParams = httpParams.set('page', params.page.toString());
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());

        return this.http.get<{ proposals: Proposal[] }>(`${this.api}/proposals`, {
            params: httpParams,
        });
    }

    getEligibleProposals(params?: {
        sort?: string;
        page?: number;
        limit?: number;
    }): Observable<{ proposals: Proposal[] }> {
        let httpParams = new HttpParams();
        if (params?.sort) httpParams = httpParams.set('sort', params.sort);
        if (params?.page) httpParams = httpParams.set('page', params.page.toString());
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());

        return this.http.get<{ proposals: Proposal[] }>(`${this.api}/proposals/eligible`, {
            params: httpParams,
        });
    }

    getProposal(id: string): Observable<Proposal> {
        return this.http.get<Proposal>(`${this.api}/proposals/${id}`);
    }

    createProposal(data: {
        communityId: string;
        title: string;
        text: string;
        category: string;
        deadlineDays?: number;
    }): Observable<Proposal> {
        return this.http.post<Proposal>(`${this.api}/proposals`, data);
    }

    vote(proposalId: string, choice: 'yes' | 'no' | 'abstain'): Observable<VoteResponse> {
        return this.http.post<VoteResponse>(`${this.api}/proposals/${proposalId}/vote`, {
            choice,
        });
    }

    undoVote(proposalId: string): Observable<{ message: string; counts: any }> {
        return this.http.delete<{ message: string; counts: any }>(
            `${this.api}/proposals/${proposalId}/vote`
        );
    }

    addComment(proposalId: string, body: string, parentId?: string): Observable<Comment> {
        return this.http.post<Comment>(`${this.api}/proposals/${proposalId}/comment`, {
            body,
            parentId,
        });
    }

    extendProposalDeadline(proposalId: string, days: number, reason?: string): Observable<{
        message: string;
        proposalId: string;
        deadline: string;
    }> {
        return this.http.post<{
            message: string;
            proposalId: string;
            deadline: string;
        }>(`${this.api}/proposals/${proposalId}/extend-deadline`, {
            days,
            reason,
        });
    }

    // ── Admin ─────────────────────────────────────────────────────────────

    getUserProfile(userId: string): Observable<any> {
        return this.http.get<any>(`${this.api}/users/${userId}/profile`);
    }

    searchUsers(query: string): Observable<{ users: any[] }> {
        let httpParams = new HttpParams();
        if (query) httpParams = httpParams.set('q', query);

        return this.http.get<{ users: any[] }>(`${this.api}/users/search`, {
            params: httpParams,
        });
    }

    getAdminDashboard(): Observable<any> {
        return this.http.get<any>(`${this.api}/admin/dashboard`);
    }

    finalizeProposal(proposalId: string): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/finalize`, { proposalId });
    }

    updateProposalStatus(
        proposalId: string,
        status: string,
        description?: string
    ): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/update-status`, {
            proposalId,
            status,
            description,
        });
    }

    unarchiveProposal(proposalId: string): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/unarchive`, { proposalId });
    }

    getAuditLog(page?: number): Observable<{ logs: any[] }> {
        let httpParams = new HttpParams();
        if (page) httpParams = httpParams.set('page', page.toString());
        return this.http.get<{ logs: any[] }>(`${this.api}/admin/audit-log`, {
            params: httpParams,
        });
    }

    getNotifications(params?: {
        page?: number;
        limit?: number;
        unreadOnly?: boolean;
    }): Observable<{ notifications: NotificationItem[]; unreadCount: number; total: number; page: number; limit: number }> {
        let httpParams = new HttpParams();
        if (params?.page) httpParams = httpParams.set('page', params.page.toString());
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());
        if (params?.unreadOnly !== undefined) httpParams = httpParams.set('unreadOnly', String(params.unreadOnly));

        return this.http.get<{ notifications: NotificationItem[]; unreadCount: number; total: number; page: number; limit: number }>(
            `${this.api}/notifications`,
            { params: httpParams }
        );
    }

    markNotificationRead(id: string): Observable<{ message: string }> {
        return this.http.patch<{ message: string }>(`${this.api}/notifications/${id}/read`, {});
    }

    markAllNotificationsRead(): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.api}/notifications/read-all`, {});
    }

    getNotificationSettings(): Observable<NotificationSettings> {
        return this.http.get<NotificationSettings>(`${this.api}/notifications/settings`);
    }

    updateNotificationSettings(payload: Partial<NotificationSettings>): Observable<{ message: string }> {
        return this.http.put<{ message: string }>(`${this.api}/notifications/settings`, payload);
    }

    getCommunityNotificationSettings(): Observable<{ communities: Array<{ id: string; name: string; slug: string; enabled: boolean }> }> {
        return this.http.get<{ communities: Array<{ id: string; name: string; slug: string; enabled: boolean }> }>(
            `${this.api}/notifications/settings/communities`
        );
    }

    updateCommunityNotificationSetting(communityId: string, enabled: boolean): Observable<{ message: string }> {
        return this.http.put<{ message: string }>(`${this.api}/notifications/settings/communities/${communityId}`, { enabled });
    }
}
