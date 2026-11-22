import type {
  ParsedStatementRow,
  BankStatementEntry,
  BankStatementStatus,
} from 'src/sections/cash/bank-reconciliation';

import { doc, query, getDocs, orderBy, updateDoc, writeBatch } from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';
import { omitUndefined } from './omit-undefined';

// ----------------------------------------------------------------------

const COLLECTION = 'bankReconciliations';

function nowIso(): string {
  return new Date().toISOString();
}

function entryRef(enterpriseId: string, id: string) {
  return doc(enterpriseCollection(enterpriseId, COLLECTION), id);
}

function mapEntry(id: string, data: Record<string, unknown>): BankStatementEntry {
  const statusRaw = String(data.status ?? 'pending');
  const status: BankStatementStatus =
    statusRaw === 'reconciled' || statusRaw === 'ignored' ? statusRaw : 'pending';
  return {
    id,
    fitid: String(data.fitid ?? id),
    date: String(data.date ?? ''),
    amount: Number(data.amount ?? 0),
    memo: String(data.memo ?? ''),
    bankName: data.bankName ? String(data.bankName) : undefined,
    status,
    matchedLedgerId: data.matchedLedgerId ? String(data.matchedLedgerId) : undefined,
    matchedLedgerReason: data.matchedLedgerReason ? String(data.matchedLedgerReason) : undefined,
    reconciledAt: data.reconciledAt ? String(data.reconciledAt) : undefined,
    reconciledBy: data.reconciledBy ? String(data.reconciledBy) : undefined,
    createdAt: String(data.createdAt ?? ''),
  };
}

export async function listBankStatementEntries(
  enterpriseId: string
): Promise<BankStatementEntry[]> {
  const q = query(enterpriseCollection(enterpriseId, COLLECTION), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapEntry(d.id, d.data() as Record<string, unknown>));
}

export async function importBankStatementEntries(
  enterpriseId: string,
  rows: ParsedStatementRow[],
  opts?: { bankName?: string }
): Promise<{ imported: number; skippedDuplicates: number }> {
  const existing = await listBankStatementEntries(enterpriseId);
  const existingFitIds = new Set(existing.map((e) => e.fitid));

  const toInsert = rows.filter((r) => !existingFitIds.has(r.fitid));
  const skippedDuplicates = rows.length - toInsert.length;

  if (toInsert.length === 0) {
    return { imported: 0, skippedDuplicates };
  }

  const col = enterpriseCollection(enterpriseId, COLLECTION);
  const timestamp = nowIso();

  // Grava em lotes de até 400 docs
  for (let i = 0; i < toInsert.length; i += 400) {
    const chunk = toInsert.slice(i, i + 400);
    const wb = writeBatch(FIRESTORE);
    chunk.forEach((row) => {
      const ref = doc(col);
      wb.set(
        ref,
        omitUndefined({
          fitid: row.fitid,
          date: row.date,
          amount: row.amount,
          memo: row.memo,
          bankName: opts?.bankName,
          status: 'pending',
          createdAt: timestamp,
        })
      );
    });
    // eslint-disable-next-line no-await-in-loop
    await wb.commit();
  }

  return { imported: toInsert.length, skippedDuplicates };
}

export async function updateBankStatementStatus(
  enterpriseId: string,
  entryId: string,
  patch: {
    status: BankStatementStatus;
    matchedLedgerId?: string | null;
    matchedLedgerReason?: string | null;
    reconciledBy?: string;
  }
): Promise<void> {
  const timestamp = nowIso();
  await updateDoc(
    entryRef(enterpriseId, entryId),
    omitUndefined({
      status: patch.status,
      matchedLedgerId: patch.matchedLedgerId ?? undefined,
      matchedLedgerReason: patch.matchedLedgerReason ?? undefined,
      reconciledAt: patch.status === 'reconciled' ? timestamp : undefined,
      reconciledBy: patch.reconciledBy,
    })
  );
}
