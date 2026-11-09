import { createElement, type ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for the read-only Note view. It
 * covers headings, lists, GFM checkboxes, blockquotes, fenced code, emphasis,
 * inline code and links. It has no Obsidian plugins: wikilinks and embeds are
 * shown as plain text.
 */
const INLINE_PATTERN =
  /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    if (start > last) {
      nodes.push(text.slice(last, start));
    }

    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    index += 1;

    if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      nodes.push(
        <a
          href={link?.[2] ?? "#"}
          key={key}
          rel="noreferrer"
          target="_blank"
        >
          {link?.[1] ?? token}
        </a>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    last = start + token.length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

const FENCE = /^```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^(\*\s*){3,}$|^(-\s*){3,}$|^(_\s*){3,}$/;
const QUOTE = /^>\s?/;
const BULLET = /^\s*[-*+]\s+/;
const ORDERED = /^\s*\d+[.)]\s+/;
const CHECKBOX = /^\[([ xX])\]\s*(.*)$/;

function isBlockStart(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line.trim()) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

function renderBlocks(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  const nextKey = () => `${keyPrefix}-${key++}`;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (line.trim() === "") {
      index += 1;
      continue;
    }

    if (FENCE.test(line)) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      // Skip the closing fence (the Vault's Notes always close it).
      index += 1;
      blocks.push(
        <pre className="md__code" key={nextKey()}>
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      const level = heading[1]?.length ?? 1;
      blocks.push(
        createElement(
          `h${level}`,
          { className: "md__heading", key: nextKey() },
          renderInline(heading[2] ?? "", nextKey()),
        ),
      );
      index += 1;
      continue;
    }

    if (RULE.test(line.trim())) {
      blocks.push(<hr className="md__rule" key={nextKey()} />);
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && QUOTE.test(lines[index] ?? "")) {
        quoted.push((lines[index] ?? "").replace(QUOTE, ""));
        index += 1;
      }
      blocks.push(
        <blockquote className="md__quote" key={nextKey()}>
          {renderBlocks(quoted.join("\n"), nextKey())}
        </blockquote>,
      );
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const pattern = ordered ? ORDERED : BULLET;
      const items: ReactNode[] = [];
      while (index < lines.length && pattern.test(lines[index] ?? "")) {
        const itemText = (lines[index] ?? "").replace(pattern, "");
        const checkbox = CHECKBOX.exec(itemText);
        items.push(
          <li className="md__item" key={nextKey()}>
            {checkbox !== null && (
              <input
                checked={(checkbox[1] ?? "").toLowerCase() === "x"}
                className="md__checkbox"
                disabled
                readOnly
                type="checkbox"
              />
            )}
            {renderInline(checkbox?.[2] ?? itemText, nextKey())}
          </li>,
        );
        index += 1;
      }
      blocks.push(
        ordered ? (
          <ol className="md__list" key={nextKey()}>
            {items}
          </ol>
        ) : (
          <ul className="md__list" key={nextKey()}>
            {items}
          </ul>
        ),
      );
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() !== "" &&
      (paragraph.length === 0 || !isBlockStart(lines[index] ?? ""))
    ) {
      paragraph.push(lines[index] ?? "");
      index += 1;
    }
    blocks.push(
      <p className="md__paragraph" key={nextKey()}>
        {renderInline(paragraph.join(" "), nextKey())}
      </p>,
    );
  }

  return blocks;
}

export function Markdown({ text }: { text: string }) {
  return <div className="md">{renderBlocks(text, "md")}</div>;
}
