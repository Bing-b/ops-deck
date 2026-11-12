import type { ProjectBundleData } from '../shared/types';

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildProjectReadme(bundle: ProjectBundleData): string {
  const { project, cards } = bundle;
  const lines: string[] = [];
  lines.push(`# ${project.name} · 项目交接与脚本卡片`);
  lines.push('');
  if (project.description) {
    lines.push(project.description);
    lines.push('');
  }
  lines.push(`- **项目标识**: \`${project.slug}\``);
  if (project.repoUrl) {
    lines.push(
      `- **Git 仓库**: ${project.repoUrl}${project.gitBranch ? `（分支 \`${project.gitBranch}\`）` : ''}`
    );
  } else if (project.gitBranch) {
    lines.push(`- **Git 分支**: \`${project.gitBranch}\``);
  }
  if (project.devIp) lines.push(`- **Dev 环境**: \`${project.devIp}\``);
  if (project.prodIp) lines.push(`- **生产环境**: \`${project.prodIp}\``);
  lines.push(`- **导出时间**: ${new Date().toLocaleString('zh-CN', { hour12: false })}`);
  lines.push('');

  if (cards.length === 0) {
    lines.push('_暂无记录卡片_');
  } else {
    for (const card of cards) {
      lines.push(`## ${card.title}`);
      lines.push('');
      lines.push(`\`\`\`${card.language === 'plaintext' ? 'text' : card.language}`);
      lines.push(card.content);
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

export function buildOfflineHandoverHtml(bundle: ProjectBundleData): string {
  const { project, cards } = bundle;
  const payloadJson = JSON.stringify({ project, cards }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)} · 离线交接手册</title>
  <style>
    :root {
      --paper: #fafbfd; --paper-2: #f1f4f9; --ink: #111827; --ink-2: #374151;
      --rule: #cbd5e1; --accent: #1d4ed8; --code-bg: #161b26; --code-ink: #e2e8f0;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Microsoft YaHei UI", "PingFang SC", sans-serif; background: var(--paper); color: var(--ink); line-height: 1.55; }
    header { position: sticky; top: 0; background: var(--paper); border-bottom: 1px solid var(--rule); padding: 14px 28px; display: flex; justify-content: space-between; align-items: center; gap: 16px; z-index: 10; }
    h1 { margin: 0; font-size: 18px; font-weight: 700; }
    input[type="search"] { width: 320px; max-width: 100%; padding: 8px 12px; border: 1px solid var(--rule); border-radius: 6px; font-size: 14px; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px 28px 64px; }
    .waterfall { column-width: 320px; column-gap: 14px; margin-top: 20px; }
    .card { break-inside: avoid; margin-bottom: 14px; border: 1px solid var(--rule); border-radius: 6px; padding: 14px; background: #fff; }
    .card-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
    .badge { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; font-family: Consolas, monospace; border: 1px solid var(--rule); background: var(--paper-2); text-transform: uppercase; }
    pre { margin: 0; background: var(--code-bg); color: var(--code-ink); padding: 10px 12px; border-radius: 6px; overflow-x: auto; font-family: Consolas, "JetBrains Mono", monospace; font-size: 12.5px; white-space: pre-wrap; word-break: break-word; }
    .copy-btn { border: 1px solid var(--rule); background: #fff; color: var(--ink); padding: 3px 9px; border-radius: 4px; font-size: 12px; cursor: pointer; }
    .copy-btn:hover { border-color: var(--accent); color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(project.name)} · 离线交接手册</h1>
      <div style="font-size:12px;color:var(--ink-2)">导出时间：${new Date().toLocaleString('zh-CN', { hour12: false })} · 共 ${cards.length} 张卡片</div>
    </div>
    <input id="q" type="search" placeholder="搜索卡片标题、脚本内容、IP..." />
  </header>
  <main>
    <div style="border:1px solid var(--rule);border-radius:6px;padding:12px 16px;background:#fff">
      <div>${escapeHtml(project.description || '无项目说明')}</div>
      <div style="margin-top:6px;font-size:12.5px;color:var(--ink-2)">
        Git：${escapeHtml(project.repoUrl || '-')}${project.gitBranch ? ` [分支: <code>${escapeHtml(project.gitBranch)}</code>]` : ''} ·
        Dev 环境：<code>${escapeHtml(project.devIp || '-')}</code> ·
        生产环境：<code>${escapeHtml(project.prodIp || '-')}</code>
      </div>
    </div>
    <div id="grid" class="waterfall"></div>
  </main>
  <script>
    const DATA = ${payloadJson};
    const grid = document.getElementById('grid');
    const qInput = document.getElementById('q');
    function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function render(filter = '') {
      const f = filter.trim().toLowerCase();
      const list = DATA.cards.filter(c => !f || (c.title + ' ' + c.content + ' ' + c.language).toLowerCase().includes(f));
      grid.innerHTML = list.map((c, idx) => \`
        <article class="card">
          <div class="card-head">
            <strong style="font-size:14px">\${esc(c.title)}</strong>
            <div style="display:flex;gap:6px;align-items:center">
              <span class="badge">\${esc(c.language)}</span>
              <button class="copy-btn" data-idx="\${idx}">复制</button>
            </div>
          </div>
          <pre>\${esc(c.content)}</pre>
        </article>
      \`).join('') || '<p>无匹配卡片</p>';
      grid.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          const txt = list[Number(btn.dataset.idx)].content;
          navigator.clipboard.writeText(txt).then(() => {
            btn.textContent = '✓ 已复制';
            setTimeout(() => btn.textContent = '复制', 1400);
          });
        });
      });
    }
    qInput.addEventListener('input', () => render(qInput.value));
    render();
  </script>
</body>
</html>`;
}
