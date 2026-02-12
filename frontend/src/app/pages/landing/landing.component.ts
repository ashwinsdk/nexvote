import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';
import { AuthService } from '../../services/auth.service';
import { I18nService } from '../../services/i18n.service';

@Component({
    selector: 'nv-landing',
    standalone: true,
    imports: [CommonModule, RouterLink, IconComponent],
    template: `
        <div class="landing-page">
            <!-- Hero -->
            <section class="hero">
                <div class="nv-container hero-inner">
                    <div class="hero-badge">
                        <span class="hero-badge-dot"></span>
                        <span>Community-first governance</span>
                    </div>
                    <h1 class="hero-title">
                        {{ i18n.t('landing.hero.title1') }}
                        <span class="hero-highlight">{{ i18n.t('landing.hero.highlight') }}</span>,<br>
                        {{ i18n.t('landing.hero.title2') }}.
                    </h1>
                    <p class="hero-subtitle">
                        {{ i18n.t('landing.hero.subtitle') }}
                    </p>
                    <div class="hero-actions">
                        <a routerLink="/register" class="nv-btn nv-btn-primary nv-btn-lg">
                            <span>{{ i18n.t('landing.cta.getstarted') }}</span>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                        </a>
                        <a routerLink="/login" class="nv-btn nv-btn-outline nv-btn-lg">
                            {{ i18n.t('landing.cta.signin') }}
                        </a>
                    </div>
                    <div class="hero-stats">
                        <div class="hero-stat">
                            <span class="stat-num">100%</span>
                            <span class="stat-label">{{ i18n.t('landing.stats.onchain') }}</span>
                        </div>
                        <div class="hero-stat-divider"></div>
                        <div class="hero-stat">
                            <span class="stat-num">6</span>
                            <span class="stat-label">{{ i18n.t('landing.stats.languages') }}</span>
                        </div>
                        <div class="hero-stat-divider"></div>
                        <div class="hero-stat">
                            <span class="stat-num">AI</span>
                            <span class="stat-label">{{ i18n.t('landing.stats.ai') }}</span>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Features -->
            <section class="features">
                <div class="nv-container">
                    <h2 class="section-title">{{ i18n.t('landing.why') }}</h2>
                    <div class="feature-grid">
                        <div class="feature-card">
                            <div class="feature-icon"><nv-icon name="shield" [size]="32" [strokeWidth]="1.5"></nv-icon></div>
                            <h3>{{ i18n.t('feature.blockchain.title') }}</h3>
                            <p>{{ i18n.t('feature.blockchain.desc') }}</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon"><nv-icon name="globe" [size]="32" [strokeWidth]="1.5"></nv-icon></div>
                            <h3>{{ i18n.t('feature.region.title') }}</h3>
                            <p>{{ i18n.t('feature.region.desc') }}</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon"><nv-icon name="bot" [size]="32" [strokeWidth]="1.5"></nv-icon></div>
                            <h3>{{ i18n.t('feature.ai.title') }}</h3>
                            <p>{{ i18n.t('feature.ai.desc') }}</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon"><nv-icon name="lock" [size]="32" [strokeWidth]="1.5"></nv-icon></div>
                            <h3>{{ i18n.t('feature.private.title') }}</h3>
                            <p>{{ i18n.t('feature.private.desc') }}</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon"><nv-icon name="chart" [size]="32" [strokeWidth]="1.5"></nv-icon></div>
                            <h3>{{ i18n.t('feature.realtime.title') }}</h3>
                            <p>{{ i18n.t('feature.realtime.desc') }}</p>
                        </div>
                        <div class="feature-card">
                            <div class="feature-icon"><nv-icon name="zap" [size]="32" [strokeWidth]="1.5"></nv-icon></div>
                            <h3>{{ i18n.t('feature.nowallet.title') }}</h3>
                            <p>{{ i18n.t('feature.nowallet.desc') }}</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- How It Works -->
            <section class="how-it-works">
                <div class="nv-container">
                    <h2 class="section-title">{{ i18n.t('landing.how') }}</h2>
                    <div class="steps">
                        <div class="step">
                            <div class="step-number">01</div>
                            <h3>{{ i18n.t('step.1.title') }}</h3>
                            <p>{{ i18n.t('step.1.desc') }}</p>
                        </div>
                        <div class="step">
                            <div class="step-number">02</div>
                            <h3>{{ i18n.t('step.2.title') }}</h3>
                            <p>{{ i18n.t('step.2.desc') }}</p>
                        </div>
                        <div class="step">
                            <div class="step-number">03</div>
                            <h3>{{ i18n.t('step.3.title') }}</h3>
                            <p>{{ i18n.t('step.3.desc') }}</p>
                        </div>
                        <div class="step">
                            <div class="step-number">04</div>
                            <h3>{{ i18n.t('step.4.title') }}</h3>
                            <p>{{ i18n.t('step.4.desc') }}</p>
                        </div>
                    </div>
                </div>
            </section>

            <!-- CTA -->
            <section class="cta">
                <div class="nv-container">
                    <h2>{{ i18n.t('cta.title') }}</h2>
                    <p class="cta-sub">{{ i18n.t('cta.subtitle') }}</p>
                    <a routerLink="/register" class="nv-btn nv-btn-primary nv-btn-lg">
                        <span>{{ i18n.t('cta.button') }}</span>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </a>
                    <div class="cta-notice">
                        <nv-icon name="alert" [size]="16"></nv-icon>
                        <span><strong>{{ i18n.t('cta.notice') }}</strong> {{ i18n.t('cta.notice.text') }}</span>
                    </div>
                </div>
            </section>
        </div>
    `,
    styles: [`
        .landing-page { min-height: 100vh; }

        /* ── Hero ── */
        .hero {
            padding: var(--sp-8) 0 var(--sp-6);
            border-bottom: 2px solid var(--border-strong);
            position: relative;
            overflow: hidden;
        }

        .hero::before {
            content: '';
            position: absolute;
            top: -40%;
            right: -20%;
            width: 600px;
            height: 600px;
            background: var(--brand-gradient);
            opacity: 0.04;
            border-radius: 0;
            transform: rotate(45deg);
            pointer-events: none;
        }

        .hero-inner {
            position: relative;
            z-index: 1;
        }

        .hero-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border: 2px solid var(--border);
            border-radius: var(--r-sm);
            font-size: var(--fs-xs);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--muted);
            margin-bottom: var(--sp-3);
        }

        .hero-badge-dot {
            width: 8px;
            height: 8px;
            background: var(--success);
            border-radius: 50%;
        }

        .hero-title {
            font-size: clamp(2.5rem, 8vw, 4.5rem);
            font-weight: 800;
            line-height: 0.95;
            letter-spacing: -0.04em;
            color: var(--text-primary);
            margin-bottom: var(--sp-3);
        }

        .hero-highlight {
            background: var(--brand-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }

        .hero-subtitle {
            font-size: clamp(1rem, 2.5vw, 1.2rem);
            max-width: 540px;
            color: var(--text-secondary);
            line-height: 1.6;
            margin-bottom: var(--sp-4);
        }

        .hero-actions {
            display: flex;
            gap: var(--sp-2);
            flex-wrap: wrap;
            margin-bottom: var(--sp-6);
        }

        .nv-btn-lg {
            padding: 14px 28px;
            font-size: var(--fs-sm);
        }

        .hero-stats {
            display: flex;
            align-items: center;
            gap: var(--sp-3);
            padding-top: var(--sp-4);
            border-top: 2px solid var(--border);
        }

        .hero-stat {
            display: flex;
            flex-direction: column;
        }

        .stat-num {
            font-size: var(--fs-xl);
            font-weight: 800;
            color: var(--text-primary);
            letter-spacing: -0.02em;
        }

        .stat-label {
            font-size: var(--fs-xs);
            color: var(--muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .hero-stat-divider {
            width: 2px;
            height: 32px;
            background: var(--border);
        }

        /* ── Sections ── */
        .features, .how-it-works, .cta {
            padding: var(--sp-8) 0;
            border-bottom: 2px solid var(--border);
        }

        .section-title {
            font-size: clamp(1.75rem, 4vw, 2.5rem);
            font-weight: 800;
            letter-spacing: -0.03em;
            color: var(--text-primary);
            margin-bottom: var(--sp-4);
        }

        /* ── Feature Grid ── */
        .feature-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: var(--sp-2);
        }

        .feature-card {
            padding: var(--sp-3);
            border: 2px solid var(--border);
            border-radius: var(--r-sm);
            transition:
                transform var(--motion-fast) var(--ease-out),
                box-shadow var(--motion-fast) var(--ease-out),
                border-color var(--motion-fast) var(--ease-out);
        }

        .feature-card:hover {
            transform: translate(-2px, -2px);
            box-shadow: 4px 4px 0 var(--border);
            border-color: var(--brand-primary);
        }

        .feature-icon {
            width: 52px;
            height: 52px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid var(--border);
            border-radius: var(--r-sm);
            margin-bottom: var(--sp-2);
            color: var(--brand-primary-dark);
            background: var(--bg-muted);
        }

        .feature-card h3 {
            font-size: var(--fs-base);
            font-weight: 700;
            margin-bottom: 6px;
            color: var(--text-primary);
        }

        .feature-card p {
            font-size: var(--fs-sm);
            color: var(--text-secondary);
            line-height: 1.5;
        }

        /* ── Steps ── */
        .how-it-works {
            background: var(--bg-muted);
        }

        .steps {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: var(--sp-3);
        }

        .step {
            padding: var(--sp-3);
            border: 2px solid var(--border);
            border-radius: var(--r-sm);
            background: var(--surface);
            transition: border-color var(--motion-fast);
        }

        .step:hover {
            border-color: var(--brand-primary);
        }

        .step-number {
            font-size: var(--fs-2xl);
            font-weight: 800;
            background: var(--brand-gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: var(--sp-1);
            letter-spacing: -0.02em;
        }

        .step h3 {
            font-size: var(--fs-base);
            font-weight: 700;
            margin-bottom: 6px;
            color: var(--text-primary);
        }

        .step p {
            font-size: var(--fs-sm);
            color: var(--text-secondary);
            line-height: 1.5;
        }

        /* ── CTA ── */
        .cta {
            text-align: center;
            border-bottom: none;
            padding: var(--sp-8) 0;
        }

        .cta h2 {
            font-size: clamp(1.75rem, 4vw, 2.5rem);
            font-weight: 800;
            letter-spacing: -0.03em;
            margin-bottom: var(--sp-2);
        }

        .cta-sub {
            font-size: var(--fs-base);
            color: var(--text-secondary);
            margin-bottom: var(--sp-4);
            max-width: 480px;
            margin-left: auto;
            margin-right: auto;
        }

        .cta-notice {
            margin-top: var(--sp-4);
            font-size: var(--fs-xs);
            color: var(--muted);
            display: inline-flex;
            align-items: flex-start;
            gap: 8px;
            text-align: left;
            padding: var(--sp-2);
            border: 2px solid var(--warning);
            border-radius: var(--r-sm);
            max-width: 480px;
        }

        .cta-notice strong {
            color: var(--warning);
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
            .hero {
                padding: var(--sp-6) 0 var(--sp-4);
            }

            .features, .how-it-works, .cta {
                padding: var(--sp-4) 0;
            }

            .feature-grid, .steps {
                grid-template-columns: 1fr;
            }

            .hero-actions {
                flex-direction: column;
                max-width: 280px;
            }

            .hero-stats {
                flex-wrap: wrap;
                gap: var(--sp-2);
            }

            .hero-stat-divider {
                display: none;
            }
        }
    `],
})
export class LandingComponent {
    constructor(public authService: AuthService, public i18n: I18nService) { }
}
