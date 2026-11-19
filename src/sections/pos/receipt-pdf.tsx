import type { Sale } from 'src/api/firestore/sales';
import type { Enterprise, ReceiptModelType } from 'src/api/firestore/platform';

import { useMemo } from 'react';
import { Page, View, Text, Font, Image, Document, StyleSheet } from '@react-pdf/renderer';

import { fDateTime } from 'src/utils/format-time';
import { formatCpf, formatCnpj } from 'src/utils/br-docs';
import { fNumber, fCurrency } from 'src/utils/format-number';

// ----------------------------------------------------------------------

Font.register({
  family: 'Roboto',
  fonts: [{ src: '/fonts/Roboto-Regular.ttf' }, { src: '/fonts/Roboto-Bold.ttf' }],
});

type Props = {
  sale: Sale;
  enterprise?: Enterprise | null;
  model?: ReceiptModelType;
  bold?: boolean;
  showLogo?: boolean;
};

export function ReceiptPDF({
  sale,
  enterprise,
  model = '58mm',
  bold = true,
  showLogo = true,
}: Props) {
  const is58 = model === '58mm';
  const isA5 = model === 'a5';

  // Dynamic height calculation for thermal receipts
  const calculatedHeight = useMemo(() => {
    if (isA5) return 595.3;
    const baseHeight = 260;
    const itemHeight = is58 ? 24 : 20;
    const paymentHeight = (sale.payments?.length || 1) * 14;
    const nfceHeight = sale.nfceKey ? 70 : 30;
    const total = baseHeight + (sale.items?.length || 1) * itemHeight + paymentHeight + nfceHeight;
    return Math.max(is58 ? 440 : 400, total);
  }, [is58, isA5, sale.items, sale.payments, sale.nfceKey]);

  const pageSize = (
    isA5 ? 'A5' : is58 ? [164.4, calculatedHeight] : [226.7, calculatedHeight]
  ) as any;

  const fontWeight = bold ? 700 : 400;

  const styles = StyleSheet.create({
    page: {
      padding: isA5 ? 24 : is58 ? 8 : 12,
      fontFamily: 'Roboto',
      fontSize: isA5 ? 9 : is58 ? 7.5 : 8.5,
      lineHeight: 1.35,
      color: '#111827',
      backgroundColor: '#FFFFFF',
    },
    header: {
      alignItems: 'center',
      marginBottom: isA5 ? 12 : 6,
      textAlign: 'center',
    },
    logo: {
      width: isA5 ? 44 : is58 ? 28 : 34,
      height: isA5 ? 44 : is58 ? 28 : 34,
      marginBottom: 4,
    },
    enterpriseName: {
      fontSize: isA5 ? 12 : is58 ? 8.5 : 10,
      fontWeight: 700,
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    enterpriseSub: {
      fontSize: isA5 ? 8 : is58 ? 6.5 : 7.2,
      color: '#4B5563',
      textAlign: 'center',
      marginTop: 1,
    },
    divider: {
      borderBottomWidth: 1,
      borderBottomColor: '#9CA3AF',
      borderStyle: 'dashed',
      marginVertical: isA5 ? 8 : 5,
    },
    titleBox: {
      textAlign: 'center',
      alignItems: 'center',
      marginVertical: 2,
    },
    title: {
      fontSize: isA5 ? 11 : is58 ? 8 : 9,
      fontWeight: 700,
      textTransform: 'uppercase',
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: 1,
      fontSize: isA5 ? 8.5 : is58 ? 6.8 : 7.5,
    },
    tableHeader: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: '#D1D5DB',
      paddingBottom: 2,
      marginBottom: 3,
      fontWeight: 700,
      fontSize: isA5 ? 8.5 : is58 ? 6.5 : 7.2,
    },
    itemRow: {
      flexDirection: 'row',
      marginVertical: 1.5,
      fontSize: isA5 ? 8.5 : is58 ? 6.8 : 7.5,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: 1.5,
      fontSize: isA5 ? 9 : is58 ? 7.2 : 8,
    },
    grandTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginVertical: 3,
      paddingVertical: 2,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: '#111827',
      fontWeight: 700,
      fontSize: isA5 ? 12 : is58 ? 9 : 10.5,
    },
    footerText: {
      textAlign: 'center',
      fontSize: isA5 ? 8 : is58 ? 6.5 : 7,
      color: '#374151',
      marginTop: 4,
    },
    signatureBox: {
      marginTop: isA5 ? 30 : 18,
      alignItems: 'center',
      textAlign: 'center',
    },
    signatureLine: {
      width: isA5 ? 220 : is58 ? 130 : 170,
      borderBottomWidth: 1,
      borderBottomColor: '#374151',
      marginBottom: 3,
    },
  });

  const enterpriseAddress = [
    enterprise?.address ? `${enterprise.address}${enterprise.addressNumber ? `, ${enterprise.addressNumber}` : ''}` : '',
    enterprise?.neighborhood,
    enterprise?.city ? `${enterprise.city}${enterprise.state ? ` - ${enterprise.state}` : ''}` : '',
  ]
    .filter(Boolean)
    .join(' • ');

  const enterpriseCnpj = enterprise?.document ? formatCnpj(enterprise.document) : '';
  const customerDoc = sale.customerDocument
    ? sale.customerDocument.length === 11
      ? formatCpf(sale.customerDocument)
      : formatCnpj(sale.customerDocument)
    : '';

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        {/* Header Empresa */}
        <View style={styles.header}>
          {showLogo && <Image source="/logo/logo-single.png" style={styles.logo} />}
          <Text style={[styles.enterpriseName, { fontWeight }]}>
            {enterprise?.tradeName || enterprise?.name || 'ERP MINIMALS'}
          </Text>
          {enterprise?.name && enterprise?.tradeName && (
            <Text style={styles.enterpriseSub}>{enterprise.name}</Text>
          )}
          {enterpriseCnpj && (
            <Text style={styles.enterpriseSub}>
              CNPJ: {enterpriseCnpj}
              {enterprise?.stateRegistration ? ` • IE: ${enterprise.stateRegistration}` : ''}
            </Text>
          )}
          {enterpriseAddress ? (
            <Text style={styles.enterpriseSub}>{enterpriseAddress}</Text>
          ) : null}
          {enterprise?.phone && (
            <Text style={styles.enterpriseSub}>Tel: {enterprise.phone}</Text>
          )}
        </View>

        <View style={styles.divider} />

        {/* Título do Comprovante / NFC-e */}
        <View style={styles.titleBox}>
          <Text style={styles.title}>
            {sale.nfceStatus === 'authorized' ? 'DANFE NFC-e' : 'CUPOM NÃO FISCAL'}
          </Text>
          <Text style={styles.enterpriseSub}>
            {sale.nfceStatus === 'authorized'
              ? `NFC-e Nº ${sale.nfceNumber || sale.code} • Série ${enterprise?.nfceSeries || '1'}`
              : `Extrato de Venda Nº ${sale.code}`}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <Text>Data: {fDateTime(sale.createdAt)}</Text>
          <Text>Status: {sale.status === 'completed' ? 'CONCLUÍDO' : 'CANCELADO'}</Text>
        </View>

        {/* Dados do Cliente */}
        <View style={styles.divider} />
        <View style={styles.metaRow}>
          <Text style={{ fontWeight: 700 }}>CONSUMIDOR:</Text>
          <Text>{sale.customerName || 'Consumidor Final'}</Text>
        </View>
        {customerDoc && (
          <View style={styles.metaRow}>
            <Text>CPF/CNPJ:</Text>
            <Text>{customerDoc}</Text>
          </View>
        )}

        {/* Itens */}
        <View style={styles.divider} />
        <View style={styles.tableHeader}>
          <Text style={{ width: '10%' }}>#</Text>
          <Text style={{ width: is58 ? '46%' : '52%' }}>DESCRIÇÃO</Text>
          <Text style={{ width: is58 ? '24%' : '20%', textAlign: 'right' }}>QTD x VAL</Text>
          <Text style={{ width: is58 ? '20%' : '18%', textAlign: 'right' }}>TOTAL</Text>
        </View>

        {sale.items.map((item, idx) => (
          <View key={idx} style={styles.itemRow}>
            <Text style={{ width: '10%', color: '#6B7280' }}>{idx + 1}</Text>
            <View style={{ width: is58 ? '46%' : '52%' }}>
              <Text style={{ fontWeight }}>{item.productName}</Text>
              {item.lotCode && (
                <Text style={{ fontSize: is58 ? 5.8 : 6.8, color: '#6B7280' }}>
                  Lote: {item.lotCode}
                </Text>
              )}
            </View>
            <Text style={{ width: is58 ? '24%' : '20%', textAlign: 'right' }}>
              {fNumber(item.qty)} {item.unit} x {fCurrency(item.unitPrice)}
            </Text>
            <Text style={{ width: is58 ? '20%' : '18%', textAlign: 'right', fontWeight }}>
              {fCurrency(item.lineTotal)}
            </Text>
          </View>
        ))}

        {/* Totais */}
        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text>Qtd. Total de Itens:</Text>
          <Text>{sale.items.reduce((acc, cur) => acc + cur.qty, 0)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text>Subtotal:</Text>
          <Text>{fCurrency(sale.subtotal)}</Text>
        </View>
        {sale.discountAmount > 0 && (
          <View style={styles.totalRow}>
            <Text>Desconto:</Text>
            <Text>- {fCurrency(sale.discountAmount)}</Text>
          </View>
        )}
        {sale.deliveryFee != null && sale.deliveryFee > 0 && (
          <View style={styles.totalRow}>
            <Text>Taxa de Entrega:</Text>
            <Text>+ {fCurrency(sale.deliveryFee)}</Text>
          </View>
        )}
        {sale.feesPassedToCustomer && sale.surchargeAmount != null && sale.surchargeAmount > 0 && (
          <View style={styles.totalRow}>
            <Text>Acréscimo Taxa Cartão:</Text>
            <Text>+ {fCurrency(sale.surchargeAmount)}</Text>
          </View>
        )}
        <View style={styles.grandTotalRow}>
          <Text>TOTAL A PAGAR:</Text>
          <Text>{fCurrency(sale.total)}</Text>
        </View>

        {/* Formas de Pagamento */}
        <View style={{ marginTop: 2 }}>
          {sale.payments.map((p, idx) => {
            const methodLabel =
              p.method === 'cash'
                ? 'Dinheiro'
                : p.method === 'pix'
                  ? 'PIX'
                  : p.method === 'credit_card'
                    ? 'Cartão de Crédito'
                    : p.method === 'debit_card'
                      ? 'Cartão de Débito'
                      : p.method === 'credit_tab'
                        ? 'Crediário / Fiado'
                        : p.method;
            const installmentSuffix =
              p.installments && p.installments > 1
                ? ` (${p.installments}x de ${fCurrency(p.amount / p.installments)})`
                : '';
            return (
              <View key={idx} style={styles.totalRow}>
                <Text>
                  Forma: {methodLabel}
                  {installmentSuffix}
                </Text>
                <Text>{fCurrency(p.amount)}</Text>
              </View>
            );
          })}
          {sale.changeAmount > 0 && (
            <View style={styles.totalRow}>
              <Text>Troco:</Text>
              <Text>{fCurrency(sale.changeAmount)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text>Entrega:</Text>
            <Text>
              {sale.deliveryType === 'delivery' ? 'Entrega / Delivery' : 'Retirado no local'}
            </Text>
          </View>
          {sale.deliveryType === 'delivery' && sale.deliveryAddress && (
            <Text style={{ fontSize: is58 ? 6 : 7, color: '#4B5563', marginTop: 1 }}>
              End. Entrega: {sale.deliveryAddress}
            </Text>
          )}
        </View>

        {/* Dados NFC-e se emitida */}
        {sale.nfceKey && (
          <>
            <View style={styles.divider} />
            <View style={{ marginVertical: 2, textAlign: 'center' }}>
              <Text style={{ fontSize: is58 ? 6.2 : 7.2, fontWeight: 700 }}>
                CHAVE DE ACESSO NFC-E
              </Text>
              <Text
                style={{
                  fontSize: is58 ? 5.8 : 6.8,
                  fontFamily: 'Roboto',
                  textAlign: 'center',
                  marginVertical: 1.5,
                }}
              >
                {sale.nfceKey.replace(/(\d{4})/g, '$1 ').trim()}
              </Text>
              {sale.nfceProtocol && (
                <Text style={{ fontSize: is58 ? 6 : 7, color: '#4B5563' }}>
                  Prot. Autorização: {sale.nfceProtocol}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Rodapé / Mensagem */}
        <View style={styles.divider} />
        <Text style={[styles.footerText, { fontWeight }]}>
          {enterprise?.receiptFooterMessage || 'OBRIGADO PELA PREFERÊNCIA! VOLTE SEMPRE'}
        </Text>
        <Text style={[styles.footerText, { fontSize: is58 ? 5.5 : 6.5, color: '#6B7280' }]}>
          ERP Minimals • {fDateTime(new Date().toISOString())}
        </Text>

        {/* Linha de Assinatura (A5 ou Crediário/Fiado) */}
        {(isA5 || sale.payments.some((p) => p.method === 'credit_tab')) && (
          <View style={styles.signatureBox}>
            <View style={styles.signatureLine} />
            <Text style={{ fontSize: is58 ? 6 : 7.5, color: '#374151' }}>
              Assinatura do Cliente
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
