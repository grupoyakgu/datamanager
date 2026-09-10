'use client';

import { useT } from '@/lib/i18n/context';

const URL_REGEX = /https?:\/\/[^\s<>()]+/g;

interface TextNode {
  type: 'text';
  value: string;
}
interface LinkNode {
  type: 'link';
  href: string;
}
type Node = TextNode | LinkNode;

/** Split text into plain segments and URLs, trimming trailing punctuation off each URL. */
function linkify(text: string): Node[] {
  const nodes: Node[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text))) {
    if (match.index > lastIndex) nodes.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    let url = match[0];
    const trailing = url.match(/[.,;:!?'")\]]+$/);
    if (trailing) url = url.slice(0, -trailing[0].length);
    nodes.push({ type: 'link', href: url });
    lastIndex = match.index + url.length;
  }
  if (lastIndex < text.length) nodes.push({ type: 'text', value: text.slice(lastIndex) });
  return nodes;
}

/**
 * Renders text with any URL replaced by a short clickable label instead of
 * the raw address, so a long tracking link doesn't dominate the layout.
 * Preserve the parent's `whitespace-pre-wrap` for line breaks.
 */
export function LinkifiedText({ text }: { text: string }) {
  const t = useT();
  const nodes = linkify(text);
  return (
    <>
      {nodes.map((node, i) =>
        node.type === 'text' ? (
          <span key={i}>{node.value}</span>
        ) : (
          <a
            key={i}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            title={node.href}
            className="text-primary underline font-medium"
          >
            {t('summaries.link')}
          </a>
        )
      )}
    </>
  );
}
