// Official Banco Central EMVCo PIX BR Code (Static with exact amount + txid)

function normalizeAscii(input: string, maxLen: number): string {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 \-./]/g, '')
    .trim()
    .slice(0, maxLen);
}

function tlv(id: string, value: string): string {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

export function computeCrc16Ccitt(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j += 1) {
      // eslint-disable-next-line no-bitwise
      if ((crc & 0x8000) !== 0) {
        // eslint-disable-next-line no-bitwise
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        // eslint-disable-next-line no-bitwise
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export type PixBrCodeInput = {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  txid?: string;
};

export function buildPixBrCode(input: PixBrCodeInput): string {
  const key = String(input.pixKey || '').trim();
  if (!key) return '';

  const merchantName = normalizeAscii(input.merchantName || 'LOJA', 25) || 'LOJA';
  const merchantCity = normalizeAscii(input.merchantCity || 'BRASIL', 15) || 'BRASIL';
  const rawTxid = String(input.txid || '***')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 25);
  const txid = rawTxid || '***';

  const merchantAccount = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', key);
  const parts = [
    tlv('00', '01'), // Payload Format Indicator
    tlv('26', merchantAccount), // Merchant Account Information
    tlv('52', '0000'), // Merchant Category Code
    tlv('53', '986'), // Transaction Currency (BRL)
  ];

  const amount = Number(input.amount || 0);
  if (Number.isFinite(amount) && amount > 0) {
    parts.push(tlv('54', amount.toFixed(2)));
  }

  parts.push(
    tlv('58', 'BR'), // Country Code
    tlv('59', merchantName),
    tlv('60', merchantCity),
    tlv('62', tlv('05', txid))
  );

  const withoutCrc = `${parts.join('')}6304`;
  const crc = computeCrc16Ccitt(withoutCrc);
  return `${withoutCrc}${crc}`;
}
