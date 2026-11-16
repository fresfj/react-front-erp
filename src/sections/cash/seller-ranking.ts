import type { Sale } from 'src/api/firestore/sales';

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type SellerRankingRow = {
  sellerKey: string;
  sellerUid?: string;
  sellerEmail?: string;
  salesCount: number;
  netTotal: number;
  totalCost: number;
  grossProfit: number;
};

export function aggregateSellerRanking(sales: Sale[]): SellerRankingRow[] {
  const map = new Map<string, SellerRankingRow>();

  sales
    .filter((s) => s.status === 'completed')
    .forEach((sale) => {
      const key = sale.sellerUid || sale.sellerEmail || 'unknown';
      const prev = map.get(key) || {
        sellerKey: key,
        sellerUid: sale.sellerUid,
        sellerEmail: sale.sellerEmail,
        salesCount: 0,
        netTotal: 0,
        totalCost: 0,
        grossProfit: 0,
      };
      prev.salesCount += 1;
      prev.netTotal = round2(prev.netTotal + (Number(sale.total) || 0));
      prev.totalCost = round2(prev.totalCost + (Number(sale.totalCost) || 0));
      prev.grossProfit = round2(prev.netTotal - prev.totalCost);
      if (!prev.sellerEmail && sale.sellerEmail) prev.sellerEmail = sale.sellerEmail;
      if (!prev.sellerUid && sale.sellerUid) prev.sellerUid = sale.sellerUid;
      map.set(key, prev);
    });

  return Array.from(map.values()).sort((a, b) => b.netTotal - a.netTotal);
}
