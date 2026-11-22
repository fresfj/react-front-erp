#!/usr/bin/env node
/**
 * Deterministic economic cost + target revenue for tax-reform-pricing skill.
 * SCRIPT_VERSION: 1.0.0
 *
 * Usage:
 *   node economic-cost.mjs --demo alfa-beta
 *   echo '<json>' | node economic-cost.mjs
 *
 * Input JSON:
 * {
 *   "suppliers": [
 *     { "id": "alfa", "acquisitionPrice": 1000, "cbsCredit": 110, "ibsCredit": 60 }
 *   ],
 *   "margin": 0.30,           // optional; on net revenue
 *   "marginBase": "net_revenue",
 *   "rounding": "half_up_cent"
 * }
 */

const SCRIPT_VERSION = '1.0.0';

function parseArgs(argv) {
  const out = { demo: null };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--demo' && argv[i + 1]) {
      out.demo = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

/** Money as integer cents to avoid float drift. */
function toCents(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return Math.round(value * 100);
}

function fromCents(cents) {
  return cents / 100;
}

function roundHalfUpCents(cents) {
  return Math.round(cents);
}

function economicCostCents(acquisitionCents, cbsCents, ibsCents) {
  return acquisitionCents - cbsCents - ibsCents;
}

/**
 * targetRevenue = economicCost / (1 - margin) with margin on net revenue.
 * Computed in cents via integer division with half-up on the final cent.
 */
function targetRevenueCents(economicCents, margin) {
  if (typeof margin !== 'number' || !(margin > 0) || !(margin < 1)) {
    throw new Error(`Invalid margin (need 0 < margin < 1): ${margin}`);
  }
  const factor = 1 - margin;
  // economic / factor → use high precision then half-up to cent
  const raw = economicCents / factor;
  return roundHalfUpCents(raw);
}

function demoAlfaBeta() {
  return {
    operationDate: '2026-11-22',
    margin: 0.3,
    marginBase: 'net_revenue',
    rounding: 'half_up_cent',
    disclaimer:
      'Didactic fixture only (RDD Alfa vs Beta). Not universal legal credit parameters.',
    suppliers: [
      {
        id: 'alfa',
        label: 'Alfa (regime regular — hipotético)',
        acquisitionPrice: 1000,
        cbsCredit: 110,
        ibsCredit: 60,
      },
      {
        id: 'beta',
        label: 'Beta (Simples — crédito hipotético)',
        acquisitionPrice: 900,
        cbsCredit: 25,
        ibsCredit: 15,
      },
    ],
  };
}

function compute(payload) {
  const marginBase = payload.marginBase || 'net_revenue';
  if (payload.margin != null && marginBase !== 'net_revenue') {
    throw new Error(`Unsupported marginBase: ${marginBase}. Only net_revenue in SCRIPT_VERSION ${SCRIPT_VERSION}`);
  }

  const rows = (payload.suppliers || []).map((s) => {
    const acquisitionCents = toCents(s.acquisitionPrice);
    const cbsCents = toCents(s.cbsCredit ?? 0);
    const ibsCents = toCents(s.ibsCredit ?? 0);
    const costCents = economicCostCents(acquisitionCents, cbsCents, ibsCents);
    const row = {
      id: s.id,
      label: s.label || s.id,
      acquisitionPrice: fromCents(acquisitionCents),
      cbsCredit: fromCents(cbsCents),
      ibsCredit: fromCents(ibsCents),
      economicCost: fromCents(costCents),
    };
    if (payload.margin != null) {
      row.targetRevenue = fromCents(targetRevenueCents(costCents, payload.margin));
    }
    return row;
  });

  const ranked = [...rows].sort((a, b) => a.economicCost - b.economicCost);

  return {
    scriptVersion: SCRIPT_VERSION,
    margin: payload.margin ?? null,
    marginBase: payload.margin != null ? marginBase : null,
    rounding: payload.rounding || 'half_up_cent',
    disclaimer: payload.disclaimer || null,
    suppliers: rows,
    lowestEconomicCostId: ranked[0]?.id ?? null,
  };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) {
    throw new Error('No JSON on stdin. Use --demo alfa-beta or pipe JSON.');
  }
  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(process.argv);
  let payload;
  if (args.demo === 'alfa-beta') {
    payload = demoAlfaBeta();
  } else {
    payload = await readStdin();
  }
  const result = compute(payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message || err}\n`);
  process.exit(1);
});
