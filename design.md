# Design — OpsDeck (ops-deck)

Locked design system for the OpsDeck desktop application (Electron + Vite + Vue 3).
Built with Hallmark `modern-minimal` discipline, adapted for a high-contrast desktop engineering workbench.

## System
- Genre · modern-minimal (desktop workbench adaptation; marketing hero/footer/mobile rules omitted)
- Theme · custom (vibe: "high-contrast cool ink-on-paper, ruler hairlines, dark graphite command blocks, vivid Prod/Test signals")
- Axes · crisp high-contrast light (with dark variant) / technical grotesk + mono / electric cobalt + danger crimson
- Fonts · `"Noto Sans SC"`, `"Space Grotesk"`, `"Inter"`, `"Microsoft YaHei UI"`, sans-serif (UI, bundled locally at `src/assets/fonts/NotoSansSC-Regular.woff2`) · `"JetBrains Mono"`, `"Cascadia Code"`, Consolas, `"Noto Sans SC"`, monospace (commands, code, kbd)

## Tokens (`src/styles/tokens.css` is the runtime source of truth)
```css
:root {
  /* High-Contrast Light Workbench */
  --color-paper:       oklch(99% 0.002 250);   /* Main canvas */
  --color-paper-2:     oklch(95.5% 0.004 250); /* Sidebar / secondary pane */
  --color-paper-3:     oklch(91.5% 0.007 252); /* Hover / subtle active surface */
  --color-ink:         oklch(16% 0.015 258);   /* Primary headings & key text (WCAG AAA) */
  --color-ink-2:       oklch(34% 0.015 258);   /* Body & secondary labels */
  --color-ink-muted:   oklch(50% 0.012 258);   /* Hints, timestamps, metadata */
  --color-rule:        oklch(80% 0.010 255);   /* Crisp 1px structural borders */
  --color-rule-strong: oklch(40% 0.015 258);   /* High-contrast active / focused borders */

  /* Signal & Semantic Accents */
  --color-accent:      oklch(50% 0.22 258);    /* Electric cobalt primary action */
  --color-accent-ink:  oklch(99% 0.002 250);   /* Text on accent fill */
  --color-focus:       oklch(50% 0.22 258);    /* 2px solid focus-visible ring */

  /* Environment & Safety Signals (High Contrast) */
  --color-prod:        oklch(52% 0.22 25);     /* Prod border/badge & dangerous commands */
  --color-prod-bg:     oklch(96% 0.03 25);
  --color-test:        oklch(48% 0.16 155);    /* Test / Dev safe environment */
  --color-test-bg:     oklch(95% 0.03 155);
  --color-warn:        oklch(62% 0.17 70);     /* SSL expiry / pre-prod warning */
  --color-warn-bg:     oklch(96% 0.04 75);

  /* Dark Graphite Terminal / Script Surface (always dark for code legibility) */
  --color-code-bg:     oklch(17% 0.014 260);
  --color-code-border: oklch(30% 0.016 260);
  --color-code-ink:    oklch(94% 0.006 250);

  /* Radii & Spacing (4-pt scale, tight ruler-drawn desktop radii) */
  --radius-card: 6px;
  --radius-input: 6px;
  --radius-pill: 4px;

  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --dur-fast: 120ms;
  --dur-base: 180ms;
}

[data-theme="dark"] {
  --color-paper:       oklch(14% 0.012 258);
  --color-paper-2:     oklch(18% 0.014 258);
  --color-paper-3:     oklch(23% 0.016 258);
  --color-ink:         oklch(97% 0.003 250);
  --color-ink-2:       oklch(82% 0.008 252);
  --color-ink-muted:   oklch(64% 0.010 255);
  --color-rule:        oklch(32% 0.014 258);
  --color-rule-strong: oklch(72% 0.010 255);
  --color-accent:      oklch(66% 0.19 256);
  --color-accent-ink:  oklch(14% 0.012 258);
  --color-prod:        oklch(66% 0.21 25);
  --color-prod-bg:     oklch(24% 0.06 25);
  --color-test:        oklch(68% 0.16 155);
  --color-test-bg:     oklch(23% 0.05 155);
  --color-warn:        oklch(75% 0.16 75);
  --color-warn-bg:     oklch(25% 0.05 75);
}
```

## Desktop Interaction & Component Discipline
- **No blurry shadows / glassmorphism**: Structure relies on crisp 1px `--color-rule` dividers and sharp contrast shifts.
- **8-State Component Checklist**: Every interactive button, list row, command block, and input must implement `default`, `hover`, `focus-visible`, `active`, `disabled`, `loading`, `error`, and `success` (e.g. `"✓ 已复制"`).
- **Mono Metadata**: IP addresses, ports, SSH aliases, file SHA-256 hashes, and `Ctrl+K` hints render in `--font-mono` with `tabular-nums`.
- **Safety Isolation**: `Prod` environment panels carry a visible `--color-prod` indicator bar; dangerous commands require visual highlighting and confirmation before copy/run.

