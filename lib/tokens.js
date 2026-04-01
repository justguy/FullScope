// Token estimation, savings headers, and session tracking

// Rough token estimate: ~0.75 tokens per whitespace-delimited word (closer to tiktoken than raw word count)
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 0.75);
}

export function savingsHeader(rawTokens, filteredTokens) {
  if (rawTokens === 0) return '';
  const saved = rawTokens - filteredTokens;
  const pct = ((saved / rawTokens) * 100).toFixed(0);
  return `[fullscope: ${rawTokens.toLocaleString()} → ${filteredTokens.toLocaleString()} tokens (${pct}% saved)]`;
}

export const EDIT_SAFETY_FOOTER = '\n⚠ COMPRESSED VIEW — do not use these line numbers for editing. Read the raw file before applying changes.';

// In-memory session tracker
const session = {
  filesRead: 0,
  tokensSaved: 0,
  tokensTotal: 0,
  fileReads: new Map(), // path → [{ format, tokens, timestamp }]
  costPer1MTokens: 15, // default $15/1M input tokens (Claude Sonnet)
};

export function trackRead(filePath, format, rawTokens, filteredTokens) {
  session.filesRead++;
  session.tokensSaved += (rawTokens - filteredTokens);
  session.tokensTotal += rawTokens;

  if (!session.fileReads.has(filePath)) {
    session.fileReads.set(filePath, []);
  }
  session.fileReads.get(filePath).push({
    format,
    tokens: filteredTokens,
    timestamp: Date.now(),
  });
}

export function getSessionStats() {
  const costSaved = (session.tokensSaved / 1_000_000) * session.costPer1MTokens;
  const savingsPct = session.tokensTotal > 0
    ? ((session.tokensSaved / session.tokensTotal) * 100).toFixed(1)
    : '0.0';

  const lines = [
    `Session: ${session.filesRead} files compressed, ${session.tokensSaved.toLocaleString()} tokens saved (${savingsPct}%)`,
    `Estimated cost savings: ~$${costSaved.toFixed(2)} (at $${session.costPer1MTokens}/1M tokens)`,
  ];

  // Context-rot detection: files read 3+ times
  const rotWarnings = [];
  for (const [path, reads] of session.fileReads) {
    if (reads.length >= 3) {
      const formats = reads.map(r => r.format).join(', ');
      rotWarnings.push(`  ${path.split('/').pop()} read ${reads.length}x (${formats}) — consider dropping older reads`);
    }
  }
  if (rotWarnings.length > 0) {
    lines.push('', 'Context-rot warnings:');
    lines.push(...rotWarnings);
  }

  return lines.join('\n');
}

export function resetSession() {
  session.filesRead = 0;
  session.tokensSaved = 0;
  session.tokensTotal = 0;
  session.fileReads.clear();
}
