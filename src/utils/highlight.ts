import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import nginx from 'highlight.js/lib/languages/nginx';
import plaintext from 'highlight.js/lib/languages/plaintext';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import type { CardLanguage } from '../../shared/types';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('json', json);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('nginx', nginx);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('plaintext', plaintext);

export const CARD_LANGUAGE_OPTIONS: Array<{ value: CardLanguage; label: string }> = [
  { value: 'bash', label: 'Shell / Bash' },
  { value: 'yaml', label: 'YAML' },
  { value: 'json', label: 'JSON' },
  { value: 'sql', label: 'SQL' },
  { value: 'nginx', label: 'Nginx' },
  { value: 'javascript', label: 'JS / TS' },
  { value: 'python', label: 'Python' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'plaintext', label: '纯文本' }
];

export function languageLabel(lang: CardLanguage): string {
  return CARD_LANGUAGE_OPTIONS.find((o) => o.value === lang)?.label ?? lang;
}

export function highlightCodeHtml(code: string, lang: CardLanguage): string {
  const safeLang = hljs.getLanguage(lang) ? lang : 'plaintext';
  try {
    return hljs.highlight(code || '', { language: safeLang }).value;
  } catch {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

