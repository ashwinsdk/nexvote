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
