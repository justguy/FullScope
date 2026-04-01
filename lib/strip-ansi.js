// ANSI escape code removal
// Matches: CSI sequences, OSC sequences, simple escape sequences
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]/g;

export function stripAnsi(text) {
  return text.replace(ANSI_RE, '');
}
