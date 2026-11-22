import type { CashLedgerLine } from './cash-ledger';

// ----------------------------------------------------------------------

export type BankStatementStatus = 'pending' | 'reconciled' | 'ignored';

export type BankStatementEntry = {
  id: string;
  fitid: string;
  date: string; // YYYY-MM-DD
  amount: number; // positivo = crédito/entrada, negativo = débito/saída
  memo: string;
  bankName?: string;
  status: BankStatementStatus;
  matchedLedgerId?: string;
  matchedLedgerReason?: string;
  reconciledAt?: string;
  reconciledBy?: string;
  createdAt: string;
};

export type ParsedStatementRow = {
  fitid: string;
  date: string;
  amount: number;
  memo: string;
};

export type ReconciliationMatchSuggestion = {
  statementId: string;
  ledgerLine: CashLedgerLine;
  daysDiff: number;
};

// ----------------------------------------------------------------------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildStableFitId(date: string, amount: number, memo: string, index: number): string {
  const cleanMemo = memo
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);
  return `csv-${date}-${Math.round(amount * 100)}-${cleanMemo}-${index}`;
}

function parseBrNumber(raw: string): number {
  const cleaned = raw
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .trim();
  if (!cleaned) return NaN;
  // Formato brasileiro 1.234,56 ou -150,00
  if (cleaned.includes(',') && (!cleaned.includes('.') || cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.'))) {
    return Number(cleaned.replace(/\./g, '').replace(',', '.'));
  }
  return Number(cleaned);
}

function normalizeDateToIso(raw: string): string {
  const trimmed = raw.trim();
  // OFX YYYYMMDD...
  const ofxMatch = trimmed.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
  }
  // DD/MM/YYYY
  const brMatch = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2].padStart(2, '0')}-${brMatch[1].padStart(2, '0')}`;
  }
  // YYYY-MM-DD
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  return '';
}

function extractOfxTag(block: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i');
  const match = block.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Parser de extrato bancário OFX (compatível com Itaú, Bradesco, BB, Santander, Nubank, Inter, Sicredi, Cora, etc.).
 */
export function parseOfxStatement(ofxContent: string): ParsedStatementRow[] {
  const rows: ParsedStatementRow[] = [];
  const blocks = ofxContent.split(/<STMTTRN>/i).slice(1);

  blocks.forEach((rawBlock, idx) => {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0] || rawBlock;
    const rawDate = extractOfxTag(block, 'DTPOSTED');
    const rawAmt = extractOfxTag(block, 'TRNAMT');
    const fitid = extractOfxTag(block, 'FITID');
    const memo = extractOfxTag(block, 'MEMO') || extractOfxTag(block, 'NAME') || 'Lançamento bancário';

    const date = normalizeDateToIso(rawDate);
    const amount = round2(parseBrNumber(rawAmt));
    if (!date || !Number.isFinite(amount) || amount === 0) return;

    rows.push({
      fitid: fitid || buildStableFitId(date, amount, memo, idx),
      date,
      amount,
      memo,
    });
  });

  return rows;
}

/**
 * Parser de extrato bancário CSV (detecta ';' ou ',', aceita cabeçalhos PT-BR e valores 1.234,56).
 */
export function parseCsvStatement(csvContent: string): ParsedStatementRow[] {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const splitLine = (line: string) =>
    line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, '').trim());

  const headers = splitLine(lines[0]).map((h) =>
    h
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  );

  const dateIdx = headers.findIndex((h) => h.includes('data') || h.includes('date'));
  const memoIdx = headers.findIndex(
    (h) =>
      h.includes('descr') ||
      h.includes('histor') ||
      h.includes('memo') ||
      h.includes('lancamento') ||
      h.includes('titulo')
  );
  const amountIdx = headers.findIndex(
    (h) => h.includes('valor') || h.includes('amount') || h.includes('quantia')
  );

  const resolvedDateIdx = dateIdx >= 0 ? dateIdx : 0;
  const resolvedMemoIdx = memoIdx >= 0 ? memoIdx : 1;
  const resolvedAmountIdx = amountIdx >= 0 ? amountIdx : headers.length - 1;

  const rows: ParsedStatementRow[] = [];

  lines.slice(1).forEach((line, idx) => {
    const cols = splitLine(line);
    const date = normalizeDateToIso(cols[resolvedDateIdx] || '');
    const memo = cols[resolvedMemoIdx] || 'Lançamento CSV';
    const amount = round2(parseBrNumber(cols[resolvedAmountIdx] || ''));
    if (!date || !Number.isFinite(amount) || amount === 0) return;

    rows.push({
      fitid: buildStableFitId(date, amount, memo, idx),
      date,
      amount,
      memo,
    });
  });

  return rows;
}

export function parseBankStatementFile(fileName: string, content: string): ParsedStatementRow[] {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ofx') || content.includes('<STMTTRN>')) {
    return parseOfxStatement(content);
  }
  return parseCsvStatement(content);
}

/**
 * Motor de matching automático: encontra lançamentos do Livro Caixa com mesmo valor (sinal + centavos)
 * dentro da janela de tolerância (padrão ±2 dias).
 */
export function findAutoReconciliationMatches(
  statementEntries: BankStatementEntry[],
  ledgerLines: CashLedgerLine[],
  toleranceDays = 2
): Map<string, ReconciliationMatchSuggestion> {
  const usedLedgerIds = new Set<string>(
    statementEntries.map((e) => e.matchedLedgerId).filter((id): id is string => Boolean(id))
  );

  const suggestions = new Map<string, ReconciliationMatchSuggestion>();

  statementEntries
    .filter((e) => e.status === 'pending')
    .forEach((entry) => {
      const entryMs = Date.parse(`${entry.date}T12:00:00Z`);
      if (!Number.isFinite(entryMs)) return;

      let bestMatch: { line: CashLedgerLine; daysDiff: number } | null = null;

      ledgerLines.forEach((line) => {
        if (usedLedgerIds.has(line.id)) return;
        if (line.type === 'OPENING') return;
        if (Math.abs(line.signedAmount - entry.amount) >= 0.01) return;

        const lineDateStr = line.createdAt.slice(0, 10);
        const lineMs = Date.parse(`${lineDateStr}T12:00:00Z`);
        if (!Number.isFinite(lineMs)) return;

        const daysDiff = Math.abs(Math.round((entryMs - lineMs) / (1000 * 60 * 60 * 24)));
        if (daysDiff <= toleranceDays) {
          if (!bestMatch || daysDiff < bestMatch.daysDiff) {
            bestMatch = { line, daysDiff };
          }
        }
      });

      if (bestMatch) {
        const chosen = bestMatch as { line: CashLedgerLine; daysDiff: number };
        usedLedgerIds.add(chosen.line.id);
        suggestions.set(entry.id, {
          statementId: entry.id,
          ledgerLine: chosen.line,
          daysDiff: chosen.daysDiff,
        });
      }
    });

  return suggestions;
}
