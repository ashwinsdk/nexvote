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
    review_status?: 'draft' | 'pending_review' | 'changes_requested' | 'approved';
    problem_statement?: string | null;
    beneficiaries?: string | null;
    timeline?: string | null;
    budget_estimate?: number | null;
    impact_summary?: string | null;
    risk_analysis?: string | null;
    attachments_proof?: string[] | null;
    participation_rate?: number | null;
    quorum_met?: boolean | null;
    community_name?: string;
    community_slug?: string;
    author_name?: string;
    author_id?: string;
    created_at: string;
    finalized_at: string | null;
    comments?: Comment[];
    currentUserVote?: 'yes' | 'no' | 'abstain' | null;
}

export interface Comment {
    id: string;
    proposal_id: string;
    user_id: string;
    parent_id: string | null;
    body: string;
    author_name: string;
    created_at: string;
    stance?: 'for' | 'against' | 'neutral' | null;
    sentiment_label?: string | null;
    sentiment_confidence?: number | null;
    cluster_label?: string | null;
    is_pinned_expert?: boolean;
    auto_hidden?: boolean;
}

export interface VoteResponse {
    message: string;
    choice: string;
    counts: { yes: number; no: number; abstain: number };
    quorum_status?: 'met' | 'not_met';
    current_participation?: number;
    min_required_participation?: number;
    min_required_voters?: number;
}

export interface GovernanceSettings {
    communityId: string;
    quorumPercent: number;
    minVoterCount: number;
    enabled: boolean;
}

export interface ImplementationRecord {
    id: string;
    proposal_id: string;
    status: 'not_started' | 'in_progress' | 'blocked' | 'completed';
    department: string | null;
    completion_percent: number;
    total_budget: number | null;
    released_budget: number;
    target_date: string | null;
    public_complete: boolean;
}

export interface ProposalTemplateField {
    id: string;
    template_id: string;
    field_key: string;
    label: string;
    field_type: string;
    required: boolean;
    placeholder: string | null;
    help_text: string | null;
    display_order: number;
}

export interface ProposalTemplate {
    id: string;
    community_id: string | null;
    name: string;
    description: string | null;
    category: string;
    is_default: boolean;
    enabled: boolean;
    fields: ProposalTemplateField[];
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

    getProposalTemplates(params?: { communityId?: string; category?: string }): Observable<{ templates: ProposalTemplate[] }> {
        let httpParams = new HttpParams();
        if (params?.communityId) httpParams = httpParams.set('communityId', params.communityId);
        if (params?.category) httpParams = httpParams.set('category', params.category);

        return this.http.get<{ templates: ProposalTemplate[] }>(`${this.api}/proposals/templates`, {
            params: httpParams,
        });
    }

    getProposalTemplate(id: string): Observable<ProposalTemplate> {
        return this.http.get<ProposalTemplate>(`${this.api}/proposals/templates/${id}`);
    }

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

    getMyProposals(params?: { status?: string; limit?: number }): Observable<{ proposals: Proposal[] }> {
        let httpParams = new HttpParams();
        if (params?.status) httpParams = httpParams.set('status', params.status);
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());

        return this.http.get<{ proposals: Proposal[] }>(`${this.api}/proposals/mine`, {
            params: httpParams,
        });
    }

    getProposal(id: string): Observable<Proposal> {
        return this.http.get<Proposal>(`${this.api}/proposals/${id}`);
    }

    getProposalAssistant(id: string): Observable<{
        proposalId: string;
        simpleExplanation: string;
        discussionSummary: {
            summary: string;
            keyPros: string[];
            keyCons: string[];
            commentCount: number;
        } | null;
        quickAnswer: string;
    }> {
        return this.http.get<{
            proposalId: string;
            simpleExplanation: string;
            discussionSummary: {
                summary: string;
                keyPros: string[];
                keyCons: string[];
                commentCount: number;
            } | null;
            quickAnswer: string;
        }>(`${this.api}/proposals/${id}/assistant`);
    }

    getSimilarProposals(id: string, limit = 5): Observable<{ proposals: any[] }> {
        return this.http.get<{ proposals: any[] }>(`${this.api}/proposals/${id}/similar`, {
            params: new HttpParams().set('limit', String(limit)),
        });
    }

    getDiscussionSummary(id: string): Observable<{
        summary: string;
        keyPros: string[];
        keyCons: string[];
        commentCount: number;
    }> {
        return this.http.get<{
            summary: string;
            keyPros: string[];
            keyCons: string[];
            commentCount: number;
        }>(`${this.api}/proposals/${id}/discussion-summary`);
    }

    getOnChainStatus(id: string): Observable<{
        proposalId: string;
        proposalHash: string | null;
        resultHash: string | null;
        txHash: string | null;
        proposalVerified: boolean;
        resultVerified: boolean;
        hasAnyOnChainRecord: boolean;
    }> {
        return this.http.get<{
            proposalId: string;
            proposalHash: string | null;
            resultHash: string | null;
            txHash: string | null;
            proposalVerified: boolean;
            resultVerified: boolean;
            hasAnyOnChainRecord: boolean;
        }>(`${this.api}/proposals/${id}/on-chain-status`);
    }

    createProposal(data: {
        communityId: string;
        title: string;
        text: string;
        category: string;
        problemStatement: string;
        expectedCost: number;
        beneficiaries: string;
        timeline: string;
        impactSummary: string;
        riskAnalysis: string;
        attachmentsProof: string[];
        submitForReview?: boolean;
        deadlineDays?: number;
    }): Observable<Proposal> {
        return this.http.post<Proposal>(`${this.api}/proposals`, data);
    }

    createProposalFromTemplate(
        templateId: string,
        payload: {
            communityId: string;
            title: string;
            text: string;
            deadlineDays?: number;
            values?: Record<string, any>;
            submitForReview?: boolean;
        }
    ): Observable<Proposal> {
        return this.http.post<Proposal>(`${this.api}/proposals/from-template/${templateId}`, payload);
    }

    submitProposalForReview(proposalId: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.api}/proposals/${proposalId}/submit-review`, {});
    }

    publishProposal(proposalId: string): Observable<{ message: string; proposalId: string; status: string; reviewStatus: string }> {
        return this.http.post<{ message: string; proposalId: string; status: string; reviewStatus: string }>(
            `${this.api}/proposals/${proposalId}/publish`,
            {}
        );
    }

    deleteDraftProposal(proposalId: string): Observable<{ message: string; proposalId: string }> {
        return this.http.delete<{ message: string; proposalId: string }>(`${this.api}/proposals/${proposalId}/draft`);
    }

    reviewProposal(
        proposalId: string,
        action: 'approve' | 'request_changes',
        notes?: string
    ): Observable<{ message: string; proposalId: string; reviewStatus: string; status: string }> {
        return this.http.post<{ message: string; proposalId: string; reviewStatus: string; status: string }>(
            `${this.api}/proposals/${proposalId}/review`,
            { action, notes }
        );
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

    addComment(
        proposalId: string,
        body: string,
        parentId?: string,
        stance: 'for' | 'against' | 'neutral' = 'neutral'
    ): Observable<Comment> {
        return this.http.post<Comment>(`${this.api}/proposals/${proposalId}/comment`, {
            body,
            parentId,
            stance,
        });
    }

    pinExpertComment(proposalId: string, commentId: string): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(
            `${this.api}/proposals/${proposalId}/comments/${commentId}/pin-expert`,
            {}
        );
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

    getTransparencyMetrics(): Observable<any> {
        return this.http.get<any>(`${this.api}/admin/transparency`);
    }

    getPublicTransparencyMetrics(): Observable<any> {
        return this.http.get<any>(`${this.api}/proposals/transparency`);
    }

    getImplementationOverview(): Observable<{ implementations: any[] }> {
        return this.http.get<{ implementations: any[] }>(`${this.api}/admin/implementations/overview`);
    }

    getFraudAlerts(params?: {
        status?: 'open' | 'in_review' | 'resolved' | 'dismissed' | 'all';
        limit?: number;
    }): Observable<{ alerts: any[] }> {
        let httpParams = new HttpParams();
        if (params?.status) httpParams = httpParams.set('status', params.status);
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());

        return this.http.get<{ alerts: any[] }>(`${this.api}/admin/fraud-alerts`, {
            params: httpParams,
        });
    }

    resolveFraudAlert(
        alertId: string,
        payload: { status: 'resolved' | 'dismissed'; notes?: string }
    ): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.api}/admin/fraud-alerts/${alertId}/resolve`, payload);
    }

    getImplementation(proposalId: string): Observable<{
        implementation: ImplementationRecord | null;
        milestones: any[];
        updates: any[];
        budgetReleases: any[];
        proofFiles: any[];
    }> {
        return this.http.get<{
            implementation: ImplementationRecord | null;
            milestones: any[];
            updates: any[];
            budgetReleases: any[];
            proofFiles: any[];
        }>(`${this.api}/admin/proposals/${proposalId}/implementation`);
    }

    updateImplementation(proposalId: string, payload: {
        status: 'not_started' | 'in_progress' | 'blocked' | 'completed';
        department?: string;
        completionPercent: number;
        totalBudget?: number;
        targetDate?: string;
        publicComplete?: boolean;
    }): Observable<{ message: string; proposalId: string }> {
        return this.http.put<{ message: string; proposalId: string }>(
            `${this.api}/admin/proposals/${proposalId}/implementation`,
            payload
        );
    }

    addImplementationMilestone(proposalId: string, payload: {
        title: string;
        description?: string;
        status?: 'pending' | 'in_progress' | 'completed' | 'blocked';
        dueDate?: string;
    }): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/proposals/${proposalId}/implementation/milestones`, payload);
    }

    addImplementationUpdate(proposalId: string, payload: {
        message: string;
        completionPercent?: number;
    }): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/proposals/${proposalId}/implementation/updates`, payload);
    }

    addImplementationBudgetRelease(proposalId: string, payload: {
        stage: number;
        amount: number;
        notes?: string;
    }): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/proposals/${proposalId}/implementation/budget-releases`, payload);
    }

    addImplementationProof(proposalId: string, payload: {
        label: string;
        url: string;
        mimeType?: string;
    }): Observable<any> {
        return this.http.post<any>(`${this.api}/admin/proposals/${proposalId}/implementation/proof`, payload);
    }

    getGovernanceSettings(slug: string): Observable<GovernanceSettings> {
        return this.http.get<GovernanceSettings>(`${this.api}/communities/${slug}/governance-settings`);
    }

    updateGovernanceSettings(slug: string, payload: {
        quorumPercent: number;
        minVoterCount: number;
    }): Observable<{ message: string; communityId: string; quorumPercent: number; minVoterCount: number }> {
        return this.http.put<{ message: string; communityId: string; quorumPercent: number; minVoterCount: number }>(
            `${this.api}/communities/${slug}/governance-settings`,
            payload
        );
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

    setProposalWatch(proposalId: string, watch: boolean): Observable<{ message: string }> {
        return this.http.post<{ message: string }>(`${this.api}/notifications/watch/proposals/${proposalId}`, { watch });
    }

    getWatchedProposals(): Observable<{ proposals: any[] }> {
        return this.http.get<{ proposals: any[] }>(`${this.api}/notifications/watch/proposals`);
    }

    getActivityFeed(params?: { page?: number; limit?: number }): Observable<{ items: any[]; page: number; limit: number; watchlistCount: number }> {
        let httpParams = new HttpParams();
        if (params?.page) httpParams = httpParams.set('page', params.page.toString());
        if (params?.limit) httpParams = httpParams.set('limit', params.limit.toString());

        return this.http.get<{ items: any[]; page: number; limit: number; watchlistCount: number }>(
            `${this.api}/notifications/feed/activity`,
            { params: httpParams }
        );
    }

    getCommunityDigest(since?: string): Observable<{ since: string; communities: any[] }> {
        let httpParams = new HttpParams();
        if (since) httpParams = httpParams.set('since', since);

        return this.http.get<{ since: string; communities: any[] }>(
            `${this.api}/notifications/digests/community`,
            { params: httpParams }
        );
    }
}
