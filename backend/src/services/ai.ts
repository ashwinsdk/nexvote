import { config } from '../config';
import logger from '../logger';
import db from '../db';

/**
 * AI Service client.
 * Proxies requests to the local LLM service for summarization,
 * embedding generation, and duplicate detection.
 */
class AIService {
    private baseUrl: string;
    private apiKey: string;
    private similarityThreshold: number;

    constructor() {
        this.baseUrl = config.aiServiceUrl.replace(/\/+$/, '');
        this.apiKey = config.aiApiKey;
        this.similarityThreshold = config.similarityThreshold;
    }

    private buildUrl(path: string): string {
        const cleanPath = path.startsWith('/') ? path : `/${path}`;
        return `${this.baseUrl}${cleanPath}`;
    }

    private fallbackDiscussionSummary(proposalText: string, comments: string[]): {
        summary: string;
        keyPros: string[];
        keyCons: string[];
        commentCount: number;
    } {
        const normalizedComments = comments
            .map((comment) => String(comment || '').trim())
            .filter((comment) => comment.length > 0);

        const pickTop = (items: string[], limit = 3): string[] => {
            const seen = new Set<string>();
            const output: string[] = [];
            for (const item of items) {
                const trimmed = item.trim();
                if (!trimmed) {
                    continue;
                }
                const key = trimmed.toLowerCase();
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                output.push(trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed);
                if (output.length >= limit) {
                    break;
                }
            }
            return output;
        };

        const positiveHints = ['support', 'agree', 'benefit', 'good', 'improve', 'help', 'favour', 'effective', 'useful', 'fair'];
        const negativeHints = ['concern', 'risk', 'oppose', 'cost', 'delay', 'harm', 'against', 'unclear', 'expensive', 'problem'];
        const neutralHints = ['question', 'clarify', 'details', 'timeline', 'process', 'implementation'];

        const allSentences = normalizedComments
            .flatMap((comment) => comment.split(/(?<=[.!?])\s+|\n+/))
            .map((line) => line.trim())
            .filter((line) => line.length >= 16);

        const scoreSentence = (line: string): number => {
            const lowered = line.toLowerCase();
            let score = 0;
            for (const hint of positiveHints) {
                if (lowered.includes(hint)) score += 2;
            }
            for (const hint of negativeHints) {
                if (lowered.includes(hint)) score += 2;
            }
            for (const hint of neutralHints) {
                if (lowered.includes(hint)) score += 1;
            }
            // Prefer information-dense sentences.
            score += Math.min(4, Math.floor(line.length / 40));
            return score;
        };

        const sorted = [...allSentences]
            .map((line) => ({ line, score: scoreSentence(line) }))
            .sort((a, b) => b.score - a.score)
            .map((entry) => entry.line);

        const keyPros = pickTop(
            sorted.filter((line) => {
                const lowered = line.toLowerCase();
                return positiveHints.some((hint) => lowered.includes(hint));
            })
        );

        const keyCons = pickTop(
            sorted.filter((line) => {
                const lowered = line.toLowerCase();
                return negativeHints.some((hint) => lowered.includes(hint));
            })
        );

        const topThemes = pickTop(sorted, 2);

        const proposalSnippet = String(proposalText || '').trim().slice(0, 180);
        const summary = normalizedComments.length > 0
            ? `Discussion summary based on ${normalizedComments.length} comments. ${topThemes.length > 0 ? `Main themes: ${topThemes.join(' | ')}` : 'Main themes were extracted from recent discussion.'}`
            : (proposalSnippet
                ? `Fallback summary: no comments yet. Proposal focus: ${proposalSnippet}${proposalSnippet.length >= 180 ? '...' : ''}`
                : 'Fallback summary unavailable because no discussion content was provided.');

        return {
            summary,
            keyPros,
            keyCons,
            commentCount: normalizedComments.length,
        };
    }

    /**
     * Health check for AI service.
     */
    async healthCheck(): Promise<boolean> {
        try {
            const res = await fetch(this.buildUrl('/health'));
            return res.ok;
        } catch {
            return false;
        }
    }

    /**
     * Generate a summary for proposal text.
     */
    async summarize(text: string): Promise<string> {
        const res = await fetch(this.buildUrl('/summarize'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ text }),
        });

        if (!res.ok) {
            throw new Error(`AI summarize failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json() as { summary: string };
        return data.summary;
    }

    async explainSimple(title: string, text: string): Promise<string> {
        const res = await fetch(this.buildUrl('/explain-simple'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ title, text }),
        });

        if (!res.ok) {
            throw new Error(`AI explain-simple failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json() as { explanation: string };
        return data.explanation;
    }

    /**
     * Translate text between supported locales.
     */
    async translate(text: string, sourceLang: string, targetLang: string): Promise<string> {
        const res = await fetch(this.buildUrl('/translate'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ text, source_lang: sourceLang, target_lang: targetLang }),
        });

        if (!res.ok) {
            throw new Error(`AI translate failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json() as { translation: string };
        return data.translation;
    }

    /**
     * Generate an embedding vector for the given text.
     */
    async getEmbedding(text: string): Promise<number[] | null> {
        try {
            const res = await fetch(this.buildUrl('/embed'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey,
                },
                body: JSON.stringify({ text }),
            });

            if (!res.ok) {
                throw new Error(`AI embed failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json() as { embedding: number[] };
            return data.embedding;
        } catch (err) {
            logger.warn({ err }, 'Failed to generate embedding');
            return null;
        }
    }

    async compareSimilar(baseText: string, candidateTexts: string[]): Promise<Array<{ index: number; similarity: number }>> {
        const res = await fetch(this.buildUrl('/compare-similar'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ base_text: baseText, candidate_texts: candidateTexts }),
        });

        if (!res.ok) {
            throw new Error(`AI compare-similar failed: ${res.status} ${res.statusText}`);
        }

        const data = await res.json() as { items: Array<{ index: number; similarity: number }> };
        return data.items;
    }

    async summarizeDiscussion(proposalText: string, comments: string[]): Promise<{
        summary: string;
        keyPros: string[];
        keyCons: string[];
        commentCount: number;
    }> {
        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ proposal_text: proposalText, comments }),
        };

        let res = await fetch(this.buildUrl('/summarize-discussion'), payload);

        // Some deployed providers expose a legacy discussion endpoint.
        if (res.status === 404) {
            res = await fetch(this.buildUrl('/discussion-summarize'), payload);
        }

        // Some deployments expose a chat-oriented alias.
        if (res.status === 404) {
            res = await fetch(this.buildUrl('/chat-summary'), payload);
        }

        if (!res.ok) {
            // Try generic summarize endpoint if discussion-specific route is missing.
            try {
                const joinedComments = comments
                    .map((comment, index) => `${index + 1}. ${String(comment || '').trim()}`)
                    .filter((line) => line.length > 3)
                    .join('\n');

                const synthInput = [
                    'Summarize this governance discussion with key pros and key cons in plain language.',
                    `Proposal: ${proposalText || ''}`,
                    `Comments:\n${joinedComments || 'No comments yet.'}`,
                ].join('\n\n');

                const genericSummary = await this.summarize(synthInput);
                const fallback = this.fallbackDiscussionSummary(proposalText, comments);

                return {
                    summary: genericSummary,
                    keyPros: fallback.keyPros,
                    keyCons: fallback.keyCons,
                    commentCount: fallback.commentCount,
                };
            } catch (err) {
                logger.debug(
                    { err, status: res.status, statusText: res.statusText },
                    'AI summarize-discussion unavailable, using local fallback summary'
                );
            }
            return this.fallbackDiscussionSummary(proposalText, comments);
        }

        const data = await res.json() as {
            summary: string;
            key_pros: string[];
            key_cons: string[];
            comment_count: number;
        };
        return {
            summary: data.summary,
            keyPros: Array.isArray(data.key_pros) ? data.key_pros : [],
            keyCons: Array.isArray(data.key_cons) ? data.key_cons : [],
            commentCount: Number(data.comment_count || comments.length || 0),
        };
    }

    async analyzeRisk(text: string): Promise<{
        riskScore: number;
        flags: string[];
        recommendation: string;
    }> {
        const payload = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.apiKey,
            },
            body: JSON.stringify({ text }),
        };

        let res = await fetch(this.buildUrl('/analyze-risk'), payload);

        // Some deployed AI backends still expose the legacy route.
        if (res.status === 404) {
            res = await fetch(this.buildUrl('/risk-analyze'), payload);
        }

        if (!res.ok) {
            const lowered = text.toLowerCase();
            const flags: string[] = [];
            let score = 0;

            if (['hate', 'fraud', 'bot', 'brigade', 'manipulate', 'scam'].some((term) => lowered.includes(term))) {
                flags.push('risky_terms');
                score += 0.35;
            }
            if ((lowered.match(/https?:\/\//g) || []).length > 3) {
                flags.push('link_spam');
                score += 0.3;
            }
            if (lowered.includes('!!!') || lowered.includes('???')) {
                flags.push('aggressive_pattern');
                score += 0.2;
            }

            const riskScore = Math.min(1, score);
            const recommendation = riskScore >= 0.7 ? 'hide_and_review' : riskScore >= 0.35 ? 'flag_for_review' : 'none';

            logger.debug(
                { status: res.status, statusText: res.statusText, recommendation },
                'AI analyze-risk unavailable, using local fallback heuristic'
            );

            return {
                riskScore,
                flags,
                recommendation,
            };
        }

        const data = await res.json() as { risk_score: number; flags: string[]; recommendation: string };
        return {
            riskScore: data.risk_score,
            flags: data.flags,
            recommendation: data.recommendation,
        };
    }

    /**
     * Find near-duplicate proposals using cosine similarity.
     * Falls back gracefully if pgvector extension is not available.
     */
    async findDuplicates(
        embedding: number[],
        regionCode: string,
        category: string,
        excludeProposalId?: string
    ): Promise<any[]> {
        try {
            // Check if pgvector is available by checking column type
            const hasVector = await db.raw(`
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = 'proposal_metadata' 
                AND column_name = 'embedding'
            `);

            const isVectorType = hasVector.rows[0]?.data_type === 'USER-DEFINED';

            if (!isVectorType) {
                logger.debug('pgvector not available, skipping duplicate detection');
                return [];
            }

            let query = db.raw(
                `
        SELECT
          p.id, p.title, p.summary,
          1 - (pm.embedding <=> ?::vector) AS similarity
        FROM proposal_metadata pm
        JOIN proposals p ON pm.proposal_id = p.id
        WHERE p.region_code = ?
          AND p.category = ?
          AND pm.embedding IS NOT NULL
          ${excludeProposalId ? 'AND p.id != ?' : ''}
        ORDER BY pm.embedding <=> ?::vector
        LIMIT 5
        `,
                excludeProposalId
                    ? [JSON.stringify(embedding), regionCode, category, excludeProposalId, JSON.stringify(embedding)]
                    : [JSON.stringify(embedding), regionCode, category, JSON.stringify(embedding)]
            );

            const result = await query;
            return result.rows.filter((r: any) => r.similarity >= this.similarityThreshold);
        } catch (err) {
            logger.warn({ err }, 'Duplicate search failed');
            return [];
        }
    }

    /**
     * Full proposal processing: summarize, embed, and check duplicates.
     */
    async processProposal(
        title: string,
        text: string,
        regionCode: string,
        category: string
    ): Promise<{ summary: string; duplicates: any[] }> {
        const fullText = `${title}\n\n${text}`;

        // Generate summary and embedding in parallel
        const [summary, embedding] = await Promise.all([
            this.summarize(fullText).catch(() => text.slice(0, 200) + '...'),
            this.getEmbedding(fullText),
        ]);

        let duplicates: any[] = [];
        if (embedding) {
            duplicates = await this.findDuplicates(embedding, regionCode, category);
        }

        return { summary, duplicates };
    }
}

export const aiService = new AIService();
