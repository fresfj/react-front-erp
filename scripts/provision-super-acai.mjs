/**
 * Provisiona:
 * 1) Atualiza os planos (free, pro, ultra) com entitlements (online_orders em todos os planos)
 * 2) Cria/atualiza o usuário admin (sugoi.express259@gmail.com) + claims
 * 3) Cria/atualiza a empresa Super Açaí (ent-super-acai) + loja online (slug: super-acai)
 * 4) Cadastra os 28 produtos da Super Açaí com padrão de variação e categoria
 *
 * Uso:
 *   GOOGLE_APPLICATION_CREDENTIALS=/caminho/serviceAccount.json node scripts/provision-super-acai.mjs
 */
import { readFileSync } from 'node:fs';
import { initializeApp, cert, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'checkout-shop-b5bb3';
const ENTERPRISE_ID = 'ent-super-acai';
const STORE_SLUG = 'super-acai';
const ADMIN_EMAIL = 'sugoi.express259@gmail.com';
const ADMIN_PASSWORD = process.env.SUPER_ACAI_PASSWORD || 'Acai_259*';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!getApps().length) {
  if (credPath) {
    const sa = JSON.parse(readFileSync(credPath, 'utf8'));
    initializeApp({ credential: cert(sa), projectId: sa.project_id || PROJECT_ID });
  } else {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
}

const auth = getAuth();
const db = getFirestore();
const now = new Date().toISOString();

// ----------------------------------------------------------------------
// 1. Atualizar planos (free, pro, ultra) com online_orders em todos
// ----------------------------------------------------------------------

async function updatePlans() {
  const snap = await db.collection('plans').get();
  const byCode = new Map();
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data?.code) byCode.set(String(data.code), d.ref);
  });

  const planUpdates = [
    {
      code: 'free',
      defaults: {
        code: 'free',
        name: 'Free Starter',
        priceMonthly: 0,
        currency: 'BRL',
        sortOrder: 0,
        active: true,
      },
      entitlements: ['online_orders'],
    },
    {
      code: 'pro',
      defaults: {
        code: 'pro',
        name: 'Pro',
        priceMonthly: 49.9,
        currency: 'BRL',
        sortOrder: 1,
        active: true,
      },
      entitlements: ['online_orders'],
    },
    {
      code: 'ultra',
      defaults: {
        code: 'ultra',
        name: 'Ultra',
        description:
          'Operação completa com automações de atendimento, checkout integrado e acompanhamento dedicado.',
        priceMonthly: 89.9,
        currency: 'BRL',
        features: [
          'Tudo do Plano Pro incluído',
          'Checkout online integrado na vitrine pública',
          'Notificações automáticas por WhatsApp e E-mail',
          'Relatórios gerenciais e exportação de dados avançada',
          'Gerente de conta e suporte dedicado via WhatsApp',
        ],
        sortOrder: 2,
        active: true,
      },
      entitlements: ['online_orders'],
    },
  ];

  for (const plan of planUpdates) {
    const ref = byCode.get(plan.code) || db.collection('plans').doc(plan.code);
    const existing = byCode.has(plan.code) ? (await ref.get()).data() || {} : {};
    const mergedEntitlements = Array.from(
      new Set([...(Array.isArray(existing.entitlements) ? existing.entitlements : []), ...plan.entitlements])
    );

    if (plan.code === 'ultra') {
      await ref.set(
        {
          ...existing,
          ...plan.defaults,
          entitlements: mergedEntitlements,
          updatedAt: now,
          createdAt: existing.createdAt || now,
        },
        { merge: true }
      );
    } else {
      await ref.set(
        {
          ...plan.defaults,
          ...existing,
          entitlements: mergedEntitlements,
          updatedAt: now,
          createdAt: existing.createdAt || now,
        },
        { merge: true }
      );
    }
    console.log(`Plan updated: ${plan.code} (${ref.id}) -> entitlements:`, mergedEntitlements);
  }
}

// ----------------------------------------------------------------------
// 2. Criar/atualizar usuário Admin da Super Açaí + Claims
// ----------------------------------------------------------------------

async function upsertAdminUser() {
  let user;
  try {
    user = await auth.getUserByEmail(ADMIN_EMAIL);
    user = await auth.updateUser(user.uid, {
      password: ADMIN_PASSWORD,
      displayName: 'Super Açaí',
      emailVerified: true,
      disabled: false,
    });
    console.log('Admin user updated:', user.uid, user.email);
  } catch (err) {
    if (err?.code === 'auth/user-not-found') {
      user = await auth.createUser({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        displayName: 'Super Açaí',
        emailVerified: true,
      });
      console.log('Admin user created:', user.uid, user.email);
    } else {
      throw err;
    }
  }

  await auth.setCustomUserClaims(user.uid, {
    enterpriseId: ENTERPRISE_ID,
    role: 'admin',
  });
  console.log('Claims set for', user.uid, { enterpriseId: ENTERPRISE_ID, role: 'admin' });
  return user;
}

// ----------------------------------------------------------------------
// 3. Criar/atualizar empresa Super Açaí + Loja Online
// ----------------------------------------------------------------------

async function upsertEnterprise(user) {
  const openingHours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    open: '07:00',
    close: '15:00',
    closed: false,
  }));

  const enterpriseData = {
    name: 'Super Açaí',
    tradeName: 'Super Açaí',
    active: true,
    adminUid: user.uid,
    adminEmail: user.email,
    phone: '(91) 98505-6600',
    address: 'Alameda Capanema',
    addressNumber: '250',
    neighborhood: 'Estrela',
    city: 'Castanhal',
    state: 'PA',
    zipCode: '68743-160',
    subscription: {
      planCode: 'ultra',
      status: 'active',
      updatedAt: now,
    },
    onlineStore: {
      enabled: true,
      slug: STORE_SLUG,
      openingHours,
      estimatedMinutes: 35,
      acceptDelivery: true,
      acceptPickup: true,
      defaultDeliveryFee: 0,
      minOrderAmount: 0,
      paymentMethodsOnDelivery: ['pix', 'cash', 'debit_card', 'credit_card'],
      whatsapp: '5591985056600',
      googleReviewUrl: 'https://g.page/r/CYzudoAS4QfDEBM/review',
    },
    updatedAt: now,
  };

  const entRef = db.doc(`enterprises/${ENTERPRISE_ID}`);
  const entSnap = await entRef.get();
  await entRef.set(
    {
      ...enterpriseData,
      createdAt: entSnap.exists ? entSnap.data()?.createdAt || now : now,
    },
    { merge: true }
  );

  await db.doc(`publicStoreIndex/${STORE_SLUG}`).set(
    {
      enterpriseId: ENTERPRISE_ID,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.doc(`enterprises/${ENTERPRISE_ID}/members/${user.uid}`).set(
    {
      uid: user.uid,
      email: user.email,
      displayName: 'Super Açaí',
      role: 'admin',
      active: true,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );

  console.log(`Enterprise upserted: enterprises/${ENTERPRISE_ID} (slug: ${STORE_SLUG})`);
}

// ----------------------------------------------------------------------
// 4. Cadastrar os 28 produtos da Super Açaí
// ----------------------------------------------------------------------

const RAW_PRODUCTS = [
  { sku: '001', name: 'Açaí 1L Garrafa', salePrice: 26.0, unit: 'un', variant: '1L', category: 'Açaí' },
  { sku: '002', name: 'Açaí 1/2L Garrafa', salePrice: 13.0, unit: 'un', variant: '1/2L', category: 'Açaí' },
  { sku: '003', name: 'Açaí Grosso 1L', salePrice: 30.0, unit: 'un', variant: '1L', category: 'Açaí' },
  { sku: '004', name: 'Açaí Grosso 1/2L', salePrice: 15.0, unit: 'un', variant: '1/2L', category: 'Açaí' },
  { sku: '005', name: 'Açaí Médio Saco 1L', salePrice: 20.0, unit: 'un', variant: '1L', category: 'Açaí' },
  { sku: '006', name: 'Açaí Médio Saco 1/2L', salePrice: 15.0, unit: 'un', variant: '1/2L', category: 'Açaí' },
  { sku: '007', name: 'Açaí Pop 1L', salePrice: 15.0, unit: 'un', variant: '1L', category: 'Açaí' },
  { sku: '008', name: 'Açaí Pop 1/2L', salePrice: 7.5, unit: 'un', variant: '1/2L', category: 'Açaí' },
  { sku: '009', name: 'Farinha Bragança Lavada 900ml', salePrice: 12.5, unit: 'un', variant: '900ml', category: 'Farinhas' },
  { sku: '010', name: 'Farinha Tapioca 1L', salePrice: 3.0, unit: 'un', variant: '1L', category: 'Farinhas' },
  { sku: '011', name: 'Farinha Tapioca 1/2L', salePrice: 2.0, unit: 'un', variant: '1/2L', category: 'Farinhas' },
  { sku: '012', name: 'Farinha Caramelizada 900ml', salePrice: 9.0, unit: 'un', variant: '900ml', category: 'Farinhas' },
  { sku: '013', name: 'Peixe Frito', salePrice: undefined, unit: 'un', variant: undefined, category: 'Proteínas' },
  { sku: '014', name: 'Filé de Frango', salePrice: undefined, unit: 'un', variant: undefined, category: 'Proteínas' },
  { sku: '015', name: 'Charge (Dose) 120g', salePrice: 20.0, unit: 'un', variant: '120g', category: 'Proteínas' },
  { sku: '016', name: 'Charge (Dose) 200g', salePrice: 30.0, unit: 'un', variant: '200g', category: 'Proteínas' },
  { sku: '017', name: 'Piraíba (Dose) 120g', salePrice: 24.0, unit: 'un', variant: '120g', category: 'Proteínas' },
  { sku: '018', name: 'Piraíba (Dose) 200g', salePrice: 35.0, unit: 'un', variant: '200g', category: 'Proteínas' },
  { sku: '019', name: 'Feijão Pote 250g', salePrice: 6.0, unit: 'un', variant: 'Pote 250g', category: 'Grãos' },
  { sku: '020', name: 'Feijão Pote 500g', salePrice: 12.0, unit: 'un', variant: 'Pote 500g', category: 'Grãos' },
  { sku: '021', name: 'Arroz Branco Pote 250g', salePrice: 4.0, unit: 'un', variant: 'Pote 250g', category: 'Grãos' },
  { sku: '022', name: 'Arroz Branco Pote 500g', salePrice: 8.0, unit: 'un', variant: 'Pote 500g', category: 'Grãos' },
  { sku: '023', name: 'Feijão Pote 250g (Opção 2)', salePrice: 4.0, unit: 'un', variant: 'Pote 250g', category: 'Grãos' },
  { sku: '024', name: 'Feijão Pote 500g (Opção 2)', salePrice: undefined, unit: 'un', variant: 'Pote 500g', category: 'Grãos' },
  { sku: '025', name: 'Tropero Mineiro Pote 250g', salePrice: 7.0, unit: 'un', variant: 'Pote 250g', category: 'Grãos' },
  { sku: '026', name: 'Tropero Mineiro Pote 500g', salePrice: undefined, unit: 'un', variant: 'Pote 500g', category: 'Grãos' },
  { sku: '027', name: 'Farofa 100g', salePrice: 3.0, unit: 'un', variant: '100g', category: 'Farinhas' },
  { sku: '028', name: 'Farinha Lavada Bragança 100g', salePrice: 2.0, unit: 'un', variant: '100g', category: 'Farinhas' },
];

async function seedProducts() {
  const batch = db.batch();
  for (const item of RAW_PRODUCTS) {
    const ref = db.doc(`enterprises/${ENTERPRISE_ID}/products/prod-${item.sku}`);
    const payload = {
      name: item.name,
      sku: item.sku,
      type: 'finished',
      category: item.category,
      unit: item.unit,
      ...(item.variant ? { variant: item.variant } : {}),
      ...(item.salePrice != null ? { salePrice: item.salePrice } : {}),
      showOnline: item.salePrice != null && item.salePrice > 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, payload, { merge: true });
  }
  await batch.commit();
  console.log(`Seeded ${RAW_PRODUCTS.length} products into enterprises/${ENTERPRISE_ID}/products`);
}

await updatePlans();
const user = await upsertAdminUser();
await upsertEnterprise(user);
await seedProducts();
console.log('ALL DONE!');
