import { doc, writeBatch } from 'firebase/firestore';

import { FIRESTORE } from 'src/lib/firebase';

import { enterpriseCollection } from './paths';

// ----------------------------------------------------------------------

export async function seedDemoErpCatalog(enterpriseId: string): Promise<void> {
  const now = new Date().toISOString();
  const wb = writeBatch(FIRESTORE);

  const suppliersCol = enterpriseCollection(enterpriseId, 'suppliers');
  const productsCol = enterpriseCollection(enterpriseId, 'products');
  const batchesCol = enterpriseCollection(enterpriseId, 'batches');
  const customersCol = enterpriseCollection(enterpriseId, 'customers');
  const ordersCol = enterpriseCollection(enterpriseId, 'processingOrders');
  const movementsCol = enterpriseCollection(enterpriseId, 'stockMovements');

  // 1. Demo Suppliers
  const sup1Ref = doc(suppliersCol, 'sup-cooperativa-para');
  wb.set(
    sup1Ref,
    {
      name: 'Cooperativa Agroextrativista do Pará Ltda',
      tradeName: 'Açaí Norte Pará',
      document: '12.345.678/0001-90',
      contactPerson: 'Raimundo Silva',
      phone: '+5591991234567',
      email: 'contato@acainortepara.com.br',
      address: 'Rodovia BR-316, Km 18',
      city: 'Castanhal',
      state: 'PA',
      zipCode: '68740-000',
      notes: 'Fornecedor certificado de Açaí In Natura (Saca 28kg / 50kg)',
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // 2. Demo Products (Raw + Finished with EAN-13, minStock, expirationDate, supplier, variant)
  const demoProducts = [
    {
      id: 'prod-acai-bruto',
      name: 'Açaí In Natura (Saca Bruta)',
      sku: 'INS-ACAI-BRUTO',
      ean: '7891000000011',
      type: 'raw',
      category: 'Matéria-Prima (Insumo)',
      unit: 'kg',
      costPrice: 5.5,
      salePrice: 0,
      minStock: 100,
      expirationDate: '2026-12-31',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      tags: ['In Natura', 'Safra 2026'],
      active: true,
    },
    {
      id: 'prod-acai-fino-1l',
      name: 'Açaí Batista Fino (Pop) 1L',
      sku: 'ACA-FINO-1L',
      ean: '7891000000028',
      type: 'finished',
      category: 'Açaí Processado',
      unit: 'L',
      costPrice: 6.2,
      salePrice: 16.0,
      minStock: 30,
      expirationDate: '2026-12-15',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      variant: 'Fino (Pop) — 1 Litro',
      tags: ['Fino', '1L', 'Pop'],
      active: true,
    },
    {
      id: 'prod-acai-medio-1l',
      name: 'Açaí Batista Médio Especial 1L',
      sku: 'ACA-MED-1L',
      ean: '7891000000035',
      type: 'finished',
      category: 'Açaí Processado',
      unit: 'L',
      costPrice: 8.5,
      salePrice: 22.0,
      minStock: 40,
      expirationDate: '2026-12-15',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      variant: 'Médio (12% Sólidos) — 1 Litro',
      tags: ['Médio', '1L', 'Mais Vendido'],
      active: true,
    },
    {
      id: 'prod-acai-grosso-1l',
      name: 'Açaí Batista Grosso Premium 1L',
      sku: 'ACA-GRO-1L',
      ean: '7891000000042',
      type: 'finished',
      category: 'Açaí Processado',
      unit: 'L',
      costPrice: 11.5,
      salePrice: 28.0,
      minStock: 20,
      expirationDate: '2026-12-15',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      variant: 'Grosso (14% Sólidos) — 1 Litro',
      tags: ['Grosso', '1L', 'Premium'],
      active: true,
    },
    {
      id: 'prod-pote-acai-500ml',
      name: 'Copo / Pote Açaí Pronto 500ml',
      sku: 'ACA-POTE-500',
      ean: '7891000000059',
      type: 'finished',
      category: 'Potes & Copos',
      unit: 'un',
      costPrice: 5.0,
      salePrice: 15.0,
      minStock: 25,
      expirationDate: '2026-12-20',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      variant: '500ml Tradicional',
      tags: ['500ml', 'Pronto Consumo'],
      active: true,
    },
    {
      id: 'prod-farinha-tapioca',
      name: 'Farinha de Tapioca Crocante 500g',
      sku: 'COMP-TAP-500',
      ean: '7891000000066',
      type: 'finished',
      category: 'Complementos',
      unit: 'un',
      costPrice: 3.5,
      salePrice: 9.5,
      minStock: 15,
      expirationDate: '2027-03-30',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      variant: 'Pacote 500g',
      tags: ['Complemento', 'Tapioca'],
      active: true,
    },
  ];

  demoProducts.forEach((p) => {
    const { id, ...data } = p;
    wb.set(
      doc(productsCol, id),
      {
        ...data,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  // 3. Demo Traceable FIFO Batches
  const demoBatches = [
    {
      id: 'batch-raw-01',
      lotCode: 'LOTE-INSUMO-20261115-01',
      productId: 'prod-acai-bruto',
      productName: 'Açaí In Natura (Saca Bruta)',
      productSku: 'INS-ACAI-BRUTO',
      productType: 'raw',
      unit: 'kg',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      initialQty: 200,
      remainingQty: 120,
      unitCost: 5.5,
      expiresAt: '2026-12-31',
      active: true,
    },
    {
      id: 'batch-fino-01',
      lotCode: 'LOTE-FINO-20261116-A1',
      productId: 'prod-acai-fino-1l',
      productName: 'Açaí Batista Fino (Pop) 1L',
      productSku: 'ACA-FINO-1L',
      productType: 'finished',
      unit: 'L',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      initialQty: 50,
      remainingQty: 42,
      unitCost: 6.2,
      expiresAt: '2026-12-15',
      active: true,
    },
    {
      id: 'batch-medio-01',
      lotCode: 'LOTE-MEDIO-20261116-B1',
      productId: 'prod-acai-medio-1l',
      productName: 'Açaí Batista Médio Especial 1L',
      productSku: 'ACA-MED-1L',
      productType: 'finished',
      unit: 'L',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      initialQty: 60,
      remainingQty: 55,
      unitCost: 8.5,
      expiresAt: '2026-12-15',
      active: true,
    },
    {
      id: 'batch-grosso-01',
      lotCode: 'LOTE-GROSSO-20261116-C1',
      productId: 'prod-acai-grosso-1l',
      productName: 'Açaí Batista Grosso Premium 1L',
      productSku: 'ACA-GRO-1L',
      productType: 'finished',
      unit: 'L',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      initialQty: 30,
      remainingQty: 28,
      unitCost: 11.5,
      expiresAt: '2026-12-15',
      active: true,
    },
    {
      id: 'batch-pote-01',
      lotCode: 'LOTE-POTE500-20261116-D1',
      productId: 'prod-pote-acai-500ml',
      productName: 'Copo / Pote Açaí Pronto 500ml',
      productSku: 'ACA-POTE-500',
      productType: 'finished',
      unit: 'un',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      initialQty: 40,
      remainingQty: 35,
      unitCost: 5.0,
      expiresAt: '2026-12-20',
      active: true,
    },
    {
      id: 'batch-tapioca-01',
      lotCode: 'LOTE-TAPIOCA-20261116-E1',
      productId: 'prod-farinha-tapioca',
      productName: 'Farinha de Tapioca Crocante 500g',
      productSku: 'COMP-TAP-500',
      productType: 'finished',
      unit: 'un',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      initialQty: 30,
      remainingQty: 25,
      unitCost: 3.5,
      expiresAt: '2027-03-30',
      active: true,
    },
  ];

  demoBatches.forEach((b) => {
    const { id, ...data } = b;
    wb.set(
      doc(batchesCol, id),
      {
        ...data,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  // 4. Demo Customers
  wb.set(
    doc(customersCol, 'cust-maria-oliveira'),
    {
      name: 'Maria Oliveira (Lanchonete Sabor do Norte)',
      document: '34.567.890/0001-12',
      phone: '+5591988776655',
      email: 'maria@sabordoonorte.com.br',
      address: 'Av. Nazaré, 450',
      city: 'Belém',
      state: 'PA',
      zipCode: '66035-170',
      creditLimit: 1500,
      currentDebt: 120,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  // 5. Demo Processing Order (100kg Açaí In Natura -> 30L Fino, 40L Médio, 10L Grosso)
  wb.set(
    doc(ordersCol, 'order-demo-001'),
    {
      code: 'OB-20261116-001',
      rawProductId: 'prod-acai-bruto',
      rawProductName: 'Açaí In Natura (Saca Bruta)',
      rawProductSku: 'INS-ACAI-BRUTO',
      rawUnit: 'kg',
      rawBatchId: 'batch-raw-01',
      rawLotCode: 'LOTE-INSUMO-20261115-01',
      supplierId: sup1Ref.id,
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      rawQtyUsed: 100,
      rawUnitCost: 5.5,
      rawTotalCost: 550,
      extraCost: 70,
      totalCost: 620,
      totalOutputQty: 80,
      outputs: [
        {
          productId: 'prod-acai-fino-1l',
          productName: 'Açaí Batista Fino (Pop) 1L',
          productSku: 'ACA-FINO-1L',
          variant: 'Fino (Pop) — 1 Litro',
          unit: 'L',
          qty: 30,
          weightFactor: 1.0,
          allocatedTotalCost: 186,
          allocatedUnitCost: 6.2,
          batchId: 'batch-fino-01',
          lotCode: 'LOTE-FINO-20261116-A1',
        },
        {
          productId: 'prod-acai-medio-1l',
          productName: 'Açaí Batista Médio Especial 1L',
          productSku: 'ACA-MED-1L',
          variant: 'Médio (12% Sólidos) — 1 Litro',
          unit: 'L',
          qty: 40,
          weightFactor: 1.25,
          allocatedTotalCost: 320,
          allocatedUnitCost: 8.0,
          batchId: 'batch-medio-01',
          lotCode: 'LOTE-MEDIO-20261116-B1',
        },
        {
          productId: 'prod-acai-grosso-1l',
          productName: 'Açaí Batista Grosso Premium 1L',
          productSku: 'ACA-GRO-1L',
          variant: 'Grosso (14% Sólidos) — 1 Litro',
          unit: 'L',
          qty: 10,
          weightFactor: 2.0,
          allocatedTotalCost: 114,
          allocatedUnitCost: 11.4,
          batchId: 'batch-grosso-01',
          lotCode: 'LOTE-GROSSO-20261116-C1',
        },
      ],
      notes: 'Ordem de beneficiamento padrão — Safra Castanhal/PA',
      status: 'completed',
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  wb.set(
    doc(movementsCol, 'mov-demo-proc-out'),
    {
      productId: 'prod-acai-bruto',
      productName: 'Açaí In Natura (Saca Bruta)',
      productSku: 'INS-ACAI-BRUTO',
      unit: 'kg',
      batchId: 'batch-raw-01',
      lotCode: 'LOTE-INSUMO-20261115-01',
      type: 'PROCESSING_OUT',
      qty: 100,
      unitCost: 5.5,
      reason: 'Processing Order OB-20261116-001',
      refId: 'order-demo-001',
      createdAt: now,
    },
    { merge: true }
  );

  await wb.commit();

  // Popula também as despesas e contas a pagar de demonstração
  await seedDemoPayables(enterpriseId);

  // Popula os títulos e clientes de contas a receber de demonstração
  await seedDemoReceivables(enterpriseId);
}

// ----------------------------------------------------------------------

export async function seedDemoPayables(enterpriseId: string): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const d05 = `${year}-${month}-05`;
  const d10 = `${year}-${month}-10`;
  const d15 = `${year}-${month}-15`;
  const d20 = `${year}-${month}-20`;
  const d25 = `${year}-${month}-25`;

  const wb = writeBatch(FIRESTORE);
  const payablesCol = enterpriseCollection(enterpriseId, 'payables');
  const suppliersCol = enterpriseCollection(enterpriseId, 'suppliers');

  // Adiciona mais fornecedores de demonstração
  wb.set(
    doc(suppliersCol, 'sup-embalagens-norte'),
    {
      name: 'Norte Embalagens Plásticas Ltda',
      tradeName: 'Embalagens Castanhal',
      document: '98.765.432/0001-10',
      contactPerson: 'Carlos Eduardo',
      phone: '+5591981223344',
      email: 'vendas@norteembalagens.com.br',
      address: 'Av. Presidente Vargas, 1200',
      city: 'Belém',
      state: 'PA',
      zipCode: '66017-000',
      notes: 'Fornecedor de copos descartáveis 500ml e potes biodegradáveis',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  wb.set(
    doc(suppliersCol, 'sup-polar-manutencao'),
    {
      name: 'Polar Refrigeração & Climatização Comercial',
      tradeName: 'Polar Frio',
      document: '45.123.789/0001-55',
      contactPerson: 'Eng. Roberto Mendes',
      phone: '+5591987654321',
      email: 'suporte@polarfrio.com.br',
      address: 'Travessa Castelo Branco, 850',
      city: 'Castanhal',
      state: 'PA',
      zipCode: '68743-020',
      notes: 'Manutenção preventiva e corretiva de compressores e câmaras frigoríficas',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  const demoPayables = [
    {
      id: 'pay-salario-operador',
      description: 'Salário Mensal - Operador de Caixa & Atendimento (Maria Santos)',
      category: 'other',
      amount: 1650.0,
      startDate: d05,
      dueDate: d05,
      competenceDate: d05,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-salario-beneficiador',
      description: 'Salário Mensal - Operador de Despolpadeira e Batimento (José Silva)',
      category: 'other',
      amount: 1950.0,
      startDate: d05,
      dueDate: d05,
      competenceDate: d05,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-adiantamento-quinzena',
      description: 'Adiantamento Quinzenal (Vale Salarial) - Equipe de Loja e Produção',
      category: 'other',
      amount: 1200.0,
      startDate: d20,
      dueDate: d20,
      competenceDate: d20,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-acai-saca-1',
      description: 'Compra de 20 Sacas Açaí In Natura (Castanhal) - Parcela 1/2',
      category: 'supplier',
      supplierId: 'sup-cooperativa-para',
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      amount: 550.0,
      startDate: d05,
      dueDate: d10,
      competenceDate: d05,
      dreClass: 'cogs_inventory',
      recurrence: 'none',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 2,
      active: true,
    },
    {
      id: 'pay-acai-saca-2',
      description: 'Compra de 20 Sacas Açaí In Natura (Castanhal) - Parcela 2/2',
      category: 'supplier',
      supplierId: 'sup-cooperativa-para',
      supplierName: 'Cooperativa Agroextrativista do Pará Ltda',
      amount: 550.0,
      startDate: d05,
      dueDate: d25,
      competenceDate: d05,
      dreClass: 'cogs_inventory',
      recurrence: 'none',
      status: 'open',
      installmentIndex: 2,
      installmentCount: 2,
      active: true,
    },
    {
      id: 'pay-copos-tampas',
      description: 'Aquisição de 2.000 Copos 500ml Personalizados + Tampas Retas',
      category: 'supplier',
      supplierId: 'sup-embalagens-norte',
      supplierName: 'Norte Embalagens Plásticas Ltda',
      amount: 420.0,
      startDate: d10,
      dueDate: d15,
      competenceDate: d10,
      dreClass: 'operating',
      recurrence: 'none',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-energia-eletrica',
      description: 'Energia Elétrica Equatorial Pará - Câmaras Frias & Batedeiras',
      category: 'utilities_power',
      amount: 685.4,
      startDate: d10,
      dueDate: d20,
      competenceDate: d10,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-internet-fibra',
      description: 'Internet Fibra Óptica Comercial 500Mbps (PDV + Wi-Fi)',
      category: 'utilities_internet',
      amount: 149.9,
      startDate: d05,
      dueDate: d10,
      competenceDate: d05,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-aluguel-galpao',
      description: 'Aluguel do Ponto Comercial / Fábrica de Polpa Castanhal',
      category: 'rent',
      amount: 1800.0,
      startDate: d10,
      dueDate: d25,
      competenceDate: d10,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-imposto-das',
      description: 'DAS - Simples Nacional Competência Atual',
      category: 'tax',
      amount: 380.25,
      startDate: d15,
      dueDate: d20,
      competenceDate: d15,
      dreClass: 'operating',
      recurrence: 'monthly',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
    {
      id: 'pay-manutencao-polar',
      description: 'Manutenção Preventiva de Compressor e Validação Térmica',
      category: 'other',
      supplierId: 'sup-polar-manutencao',
      supplierName: 'Polar Refrigeração & Climatização Comercial',
      amount: 350.0,
      startDate: d05,
      dueDate: d10,
      competenceDate: d05,
      dreClass: 'operating',
      recurrence: 'none',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      active: true,
    },
  ];

  demoPayables.forEach((p) => {
    const { id, ...data } = p;
    wb.set(
      doc(payablesCol, id),
      {
        ...data,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  });

  await wb.commit();
}

// ----------------------------------------------------------------------

export async function seedDemoReceivables(enterpriseId: string): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();

  // Helper para gerar datas no formato YYYY-MM-DD
  const addDays = (days: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const wb = writeBatch(FIRESTORE);
  const receivablesCol = enterpriseCollection(enterpriseId, 'receivables');
  const customersCol = enterpriseCollection(enterpriseId, 'customers');

  // Clientes com histórico de crediário/fiado e débito
  wb.set(
    doc(customersCol, 'cust-maria-fatima'),
    {
      name: 'Maria de Fátima Oliveira',
      document: '123.456.789-00',
      phone: '+5591981223344',
      email: 'maria.fatima@gmail.com',
      address: 'Rua dos Açaizeiros, 150',
      city: 'Belém',
      state: 'PA',
      zipCode: '66000-000',
      creditLimit: 1500,
      currentDebt: 320.0,
      notes: 'Cliente fiel semanal - compradora de polpa e açaí batido',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  wb.set(
    doc(customersCol, 'cust-raimundo-nonato'),
    {
      name: 'Raimundo Nonato Ferreira',
      document: '456.789.123-11',
      phone: '+5591988776655',
      email: 'raimundo.nonato@hotmail.com',
      address: 'Travessa Mauriti, 840',
      city: 'Belém',
      state: 'PA',
      zipCode: '66087-000',
      creditLimit: 1000,
      currentDebt: 180.0,
      notes: 'Comerciante local - compra açaí médio e farinha d’água',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  wb.set(
    doc(customersCol, 'cust-restaurante-estrela'),
    {
      name: 'Restaurante Estrela do Norte Ltda',
      tradeName: 'Restaurante Estrela',
      document: '12.345.678/0001-99',
      phone: '+559132445566',
      email: 'financeiro@estreladonorte.com.br',
      address: 'Av. Nazaré, 450',
      city: 'Belém',
      state: 'PA',
      zipCode: '66035-170',
      creditLimit: 5000,
      currentDebt: 850.0,
      notes: 'Contrato de fornecimento corporativo quinzenal',
      active: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    { merge: true }
  );

  const demoReceivables = [
    // 1) Crediário / Fiado parcelado (Parcela 1 vencida, 2 e 3 a vencer)
    {
      id: 'rec-fatima-1',
      description: 'Venda #1008 - Crediário / Fiado (1/3)',
      category: 'other',
      customerId: 'cust-maria-fatima',
      customerName: 'Maria de Fátima Oliveira',
      amount: 100.0,
      startDate: addDays(-45),
      dueDate: addDays(-15), // Vencida há 15 dias!
      recurrence: 'none',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 3,
      refType: 'sale',
      refId: 'sale-1008',
      active: true,
    },
    {
      id: 'rec-fatima-2',
      description: 'Venda #1008 - Crediário / Fiado (2/3)',
      category: 'other',
      customerId: 'cust-maria-fatima',
      customerName: 'Maria de Fátima Oliveira',
      amount: 110.0,
      startDate: addDays(-45),
      dueDate: addDays(15), // A vencer em 15 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 2,
      installmentCount: 3,
      refType: 'sale',
      refId: 'sale-1008',
      active: true,
    },
    {
      id: 'rec-fatima-3',
      description: 'Venda #1008 - Crediário / Fiado (3/3)',
      category: 'other',
      customerId: 'cust-maria-fatima',
      customerName: 'Maria de Fátima Oliveira',
      amount: 110.0,
      startDate: addDays(-45),
      dueDate: addDays(45), // A vencer em 45 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 3,
      installmentCount: 3,
      refType: 'sale',
      refId: 'sale-1008',
      active: true,
    },

    // 2) Crediário Raimundo Nonato (Parcela 1 vencida, 2 a vencer)
    {
      id: 'rec-raimundo-1',
      description: 'Venda #1012 - Crediário / Fiado (1/2)',
      category: 'other',
      customerId: 'cust-raimundo-nonato',
      customerName: 'Raimundo Nonato Ferreira',
      amount: 90.0,
      startDate: addDays(-35),
      dueDate: addDays(-5), // Vencida há 5 dias!
      recurrence: 'none',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 2,
      refType: 'sale',
      refId: 'sale-1012',
      active: true,
    },
    {
      id: 'rec-raimundo-2',
      description: 'Venda #1012 - Crediário / Fiado (2/2)',
      category: 'other',
      customerId: 'cust-raimundo-nonato',
      customerName: 'Raimundo Nonato Ferreira',
      amount: 90.0,
      startDate: addDays(-35),
      dueDate: addDays(25), // A vencer em 25 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 2,
      installmentCount: 2,
      refType: 'sale',
      refId: 'sale-1012',
      active: true,
    },

    // 3) Faturamento Corporativo a Prazo
    {
      id: 'rec-estrela-faturamento',
      description: 'Faturamento Quinzenal #4021 - Fornecimento Polpa Açaí Especial',
      category: 'other',
      customerId: 'cust-restaurante-estrela',
      customerName: 'Restaurante Estrela do Norte Ltda',
      amount: 850.0,
      startDate: addDays(-7),
      dueDate: addDays(8), // A vencer em 8 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 1,
      refType: 'invoice',
      active: true,
    },

    // 4) Repasses futuros de Cartão de Crédito (Stone / Cielo / Maquininha)
    {
      id: 'rec-stone-repasse-1',
      description: 'Repasse Cartão de Crédito (Stone) - Lote Vendas PDV (1/3)',
      category: 'other',
      customerName: 'Adquirente Stone Pagamentos',
      amount: 1450.0,
      startDate: addDays(-18),
      dueDate: addDays(12), // A vencer em 12 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 1,
      installmentCount: 3,
      refType: 'credit_card',
      active: true,
    },
    {
      id: 'rec-stone-repasse-2',
      description: 'Repasse Cartão de Crédito (Stone) - Lote Vendas PDV (2/3)',
      category: 'other',
      customerName: 'Adquirente Stone Pagamentos',
      amount: 1450.0,
      startDate: addDays(-18),
      dueDate: addDays(42), // A vencer em 42 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 2,
      installmentCount: 3,
      refType: 'credit_card',
      active: true,
    },
    {
      id: 'rec-stone-repasse-3',
      description: 'Repasse Cartão de Crédito (Stone) - Lote Vendas PDV (3/3)',
      category: 'other',
      customerName: 'Adquirente Stone Pagamentos',
      amount: 1450.0,
      startDate: addDays(-18),
      dueDate: addDays(72), // A vencer em 72 dias
      recurrence: 'none',
      status: 'open',
      installmentIndex: 3,
      installmentCount: 3,
      refType: 'credit_card',
      active: true,
    },

    // 5) Títulos já baixados/recebidos (Histórico)
    {
      id: 'rec-pago-entrada',
      description: 'Venda #1008 - Entrada / Parcela à vista',
      category: 'other',
      customerId: 'cust-maria-fatima',
      customerName: 'Maria de Fátima Oliveira',
      amount: 180.0,
      startDate: addDays(-45),
      dueDate: addDays(-45),
      recurrence: 'none',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      refType: 'sale',
      active: true,
    },
    {
      id: 'rec-pago-debito-d1',
      description: 'Repasse Cartão Débito D+1 (Stone)',
      category: 'other',
      customerName: 'Adquirente Stone Pagamentos',
      amount: 920.0,
      startDate: addDays(-3),
      dueDate: addDays(-2),
      recurrence: 'none',
      status: 'paid',
      installmentIndex: 1,
      installmentCount: 1,
      refType: 'debit_card',
      active: true,
    },
  ];

  demoReceivables.forEach((r) => {
    const { id, ...data } = r;
    wb.set(
      doc(receivablesCol, id),
      {
        ...data,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  });

  await wb.commit();
}

/**
 * Cadastra produtos de demonstração para o Cardápio Online e PDV:
 * - Produtos Gelados (cold) e Quentes (hot) com imagens
 * - Desconto percentual (%) e valor fixo (R$)
 * - Combos com composição detalhada (comboItems) e "Serve X pessoas"
 */
export async function seedDemoOnlineCatalogOffers(enterpriseId: string): Promise<void> {
  const now = new Date().toISOString();
  const wb = writeBatch(FIRESTORE);
  const productsCol = enterpriseCollection(enterpriseId, 'products');

  const demoOffers = [
    {
      id: 'demo-acai-turbinado-500',
      name: 'Açaí Cremoso Turbinado 500ml',
      sku: 'DEMO-ACA-500',
      type: 'finished',
      category: 'Potes & Copos Prontos',
      description:
        'Açaí batido bem gelado com guaraná natural, leite em pó, morango fresco, banana e granola crocante.',
      unit: 'un',
      costPrice: 9.5,
      salePrice: 26.0,
      promoActive: true,
      discountType: 'percent',
      discountValue: 15,
      servingTemperature: 'cold',
      servesCount: 1,
      featured: true,
      isCombo: false,
      imageUrl:
        'https://pecadodagula.lojadigitalds.com.br/_core/_uploads/331/2025/04/1619130425b2c7edd5dc.png',
      showOnline: true,
      active: true,
    },
    {
      id: 'demo-milkshake-ovaltine-400',
      name: 'Milkshake Crocante de Ovomaltine 400ml',
      sku: 'DEMO-MLK-400',
      type: 'finished',
      category: 'Bebidas Geladas',
      description:
        'Sorvete artesanal de baunilha batido com calda de chocolate meio amargo e flocos crocantes de Ovomaltine.',
      unit: 'un',
      costPrice: 7.0,
      salePrice: 22.0,
      promoActive: true,
      discountType: 'fixed',
      discountValue: 4.0,
      servingTemperature: 'cold',
      servesCount: 1,
      featured: false,
      isCombo: false,
      imageUrl:
        'https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=800&q=80',
      showOnline: true,
      active: true,
    },
    {
      id: 'demo-burger-artesanal-bacon',
      name: 'Smash Burger Artesanal Duplo Bacon',
      sku: 'DEMO-BRG-01',
      type: 'finished',
      category: 'Lanches & Quentes',
      description:
        'Pão brioche selado na manteiga, 2 blends bovinos 90g, queijo cheddar cremoso, bacon crocante e maionese defumada da casa.',
      unit: 'un',
      costPrice: 13.0,
      salePrice: 34.0,
      promoActive: true,
      discountType: 'percent',
      discountValue: 10,
      servingTemperature: 'hot',
      servesCount: 1,
      featured: true,
      isCombo: false,
      imageUrl:
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
      showOnline: true,
      active: true,
    },
    {
      id: 'demo-batata-cheddar-bacon',
      name: 'Batata Rústica com Cheddar e Bacon',
      sku: 'DEMO-BAT-01',
      type: 'finished',
      category: 'Lanches & Quentes',
      description:
        'Porção generosa de batatas crocantes temperadas com páprica defumada, cobertura de cheddar quente e bacon em cubos.',
      unit: 'un',
      costPrice: 8.0,
      salePrice: 24.0,
      promoActive: false,
      servingTemperature: 'hot',
      servesCount: 2,
      featured: false,
      isCombo: false,
      imageUrl:
        'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=800&q=80',
      showOnline: true,
      active: true,
    },
    {
      id: 'demo-combo-casal-acai',
      name: 'Combo Casal Açaí + Milkshake',
      sku: 'DEMO-CMB-01',
      type: 'finished',
      category: 'Combos & Promoções',
      description:
        'Perfeito para dividir! 2 Açaís Cremosos Turbinados 500ml + 1 Milkshake Crocante com preço especial de combo.',
      unit: 'un',
      costPrice: 25.0,
      salePrice: 68.0,
      promoActive: true,
      discountType: 'percent',
      discountValue: 20,
      servingTemperature: 'cold',
      servesCount: 2,
      featured: true,
      isCombo: true,
      comboItems: [
        { productId: 'demo-acai-turbinado-500', productName: 'Açaí Cremoso Turbinado 500ml', qty: 2 },
        {
          productId: 'demo-milkshake-ovaltine-400',
          productName: 'Milkshake Crocante de Ovomaltine 400ml',
          qty: 1,
        },
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
      showOnline: true,
      active: true,
    },
    {
      id: 'demo-combo-burger-fome',
      name: 'Combo Smash Duplo + Batata + Milkshake',
      sku: 'DEMO-CMB-02',
      type: 'finished',
      category: 'Combos & Promoções',
      description:
        'Combo completo na chapa quente: 1 Smash Burger Duplo Bacon + 1 Batata com Cheddar e Bacon + 1 Milkshake 400ml.',
      unit: 'un',
      costPrice: 27.0,
      salePrice: 74.0,
      promoActive: true,
      discountType: 'fixed',
      discountValue: 12.0,
      servingTemperature: 'hot',
      servesCount: 2,
      featured: true,
      isCombo: true,
      comboItems: [
        {
          productId: 'demo-burger-artesanal-bacon',
          productName: 'Smash Burger Artesanal Duplo Bacon',
          qty: 1,
        },
        {
          productId: 'demo-batata-cheddar-bacon',
          productName: 'Batata Rústica com Cheddar e Bacon',
          qty: 1,
        },
        {
          productId: 'demo-milkshake-ovaltine-400',
          productName: 'Milkshake Crocante de Ovomaltine 400ml',
          qty: 1,
        },
      ],
      imageUrl:
        'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
      showOnline: true,
      active: true,
    },
  ];

  demoOffers.forEach((item) => {
    const { id, ...data } = item;
    wb.set(
      doc(productsCol, id),
      {
        ...data,
        minStock: 10,
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  await wb.commit();
}
