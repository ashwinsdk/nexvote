import { Injectable } from '@angular/core';

export interface ProposalDraft {
    key: string;
    data: any;
    updatedAt: string;
}

export interface QueuedAction {
    id: string;
    type: 'vote' | 'comment';
    proposalId: string;
    payload: any;
    createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class OfflineDraftService {
    private draftPrefix = 'nv_draft_';
    private queueKey = 'nv_offline_queue';

    saveDraft(key: string, data: any): void {
        const payload: ProposalDraft = {
            key,
            data,
            updatedAt: new Date().toISOString(),
        };
        try {
            localStorage.setItem(`${this.draftPrefix}${key}`, JSON.stringify(payload));
        } catch {
            // Ignore storage failures; draft persistence is best-effort.
        }
    }

    getDraft(key: string): ProposalDraft | null {
        let raw: string | null = null;
        try {
            raw = localStorage.getItem(`${this.draftPrefix}${key}`);
        } catch {
            return null;
        }
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw) as ProposalDraft;
        } catch {
            return null;
        }
    }

    clearDraft(key: string): void {
        try {
            localStorage.removeItem(`${this.draftPrefix}${key}`);
        } catch {
            // Ignore storage failures.
        }
    }

    enqueueAction(action: Omit<QueuedAction, 'id' | 'createdAt'>): QueuedAction {
        const next: QueuedAction = {
            id: `q_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            createdAt: new Date().toISOString(),
            ...action,
        };

        const queue = this.getQueue();
        queue.push(next);
        try {
            localStorage.setItem(this.queueKey, JSON.stringify(queue));
        } catch {
            // Ignore storage failures; action will remain transient.
        }
        return next;
    }

    getQueue(): QueuedAction[] {
        let raw: string | null = null;
        try {
            raw = localStorage.getItem(this.queueKey);
        } catch {
            return [];
        }
        if (!raw) {
            return [];
        }

        try {
            return JSON.parse(raw) as QueuedAction[];
        } catch {
            return [];
        }
    }

    removeFromQueue(id: string): void {
        const queue = this.getQueue().filter((item) => item.id !== id);
        try {
            localStorage.setItem(this.queueKey, JSON.stringify(queue));
        } catch {
            // Ignore storage failures.
        }
    }
}
