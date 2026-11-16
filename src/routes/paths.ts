import { paramCase } from 'src/utils/change-case';

import { _id, _postTitles } from 'src/_mock/assets';

// ----------------------------------------------------------------------

const MOCK_ID = _id[1];

const MOCK_TITLE = _postTitles[2];

const ROOTS = {
  AUTH: '/auth',
  DASHBOARD: '/dashboard',
};

// ----------------------------------------------------------------------

const PANTALLAS_GENERICAS = [
  { simple: `${ROOTS.DASHBOARD}/sistema/simple` },
  { simpleUI: `${ROOTS.DASHBOARD}/sistema/simple-ui` },
  { recursiva: `${ROOTS.DASHBOARD}/sistema/recursiva` },
  { doble: `${ROOTS.DASHBOARD}/sistema/doble` },
];

export const paths = {
  page403: '/error/403',
  page404: '/error/404',
  page500: '/error/500',
  docs: 'https://docs.minimals.cc',
  changelog: 'https://docs.minimals.cc/changelog',
  zoneStore: 'https://mui.com/store/items/zone-landing-page/',
  minimalStore: 'https://mui.com/store/items/minimal-dashboard/',
  freeUI: 'https://mui.com/store/items/minimal-dashboard-free/',
  figma: 'https://www.figma.com/design/cAPz4pYPtQEXivqe11EcDE/%5BPreview%5D-Minimal-Web.v6.0.0',
  // Storefront demos (used by shop/blog sections — not dashboard ERP)
  product: {
    root: `/product`,
    checkout: `/product/checkout`,
    details: (id: string) => `/product/${id}`,
    demo: { details: `/product/${MOCK_ID}` },
  },
  post: {
    root: `/post`,
    details: (title: string) => `/post/${paramCase(title)}`,
    demo: { details: `/post/${paramCase(MOCK_TITLE)}` },
  },
  // AUTH
  auth: {
    jwt: {
      signIn: `${ROOTS.AUTH}/jwt/sign-in`,
      signUp: `${ROOTS.AUTH}/jwt/sign-up`,
    },
    firebase: {
      signIn: `${ROOTS.AUTH}/firebase/sign-in`,
      verify: `${ROOTS.AUTH}/firebase/verify`,
      signUp: `${ROOTS.AUTH}/firebase/sign-up`,
      resetPassword: `${ROOTS.AUTH}/firebase/reset-password`,
    },
  },
  // DASHBOARD
  dashboard: {
    root: ROOTS.DASHBOARD,
    mail: `${ROOTS.DASHBOARD}/mail`,
    chat: `${ROOTS.DASHBOARD}/chat`,
    blank: `${ROOTS.DASHBOARD}/blank`,
    kanban: `${ROOTS.DASHBOARD}/kanban`,
    calendar: `${ROOTS.DASHBOARD}/calendar`,
    fileManager: `${ROOTS.DASHBOARD}/file-manager`,
    permission: `${ROOTS.DASHBOARD}/permission`,
    params: `${ROOTS.DASHBOARD}/params`,
    // ERP Firestore (English)
    suppliers: {
      root: `${ROOTS.DASHBOARD}/suppliers`,
      list: `${ROOTS.DASHBOARD}/suppliers/list`,
      create: `${ROOTS.DASHBOARD}/suppliers/create`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/suppliers/${id}/edit`,
    },
    products: {
      root: `${ROOTS.DASHBOARD}/products`,
      list: `${ROOTS.DASHBOARD}/products/list`,
      create: `${ROOTS.DASHBOARD}/products/create`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/products/${id}/edit`,
    },
    account: {
      root: `${ROOTS.DASHBOARD}/account`,
      general: `${ROOTS.DASHBOARD}/account/general`,
      changePassword: `${ROOTS.DASHBOARD}/account/change-password`,
    },
    general: {
      app: ROOTS.DASHBOARD,
      ecommerce: `${ROOTS.DASHBOARD}/ecommerce`,
      analytics: `${ROOTS.DASHBOARD}/analytics`,
      banking: `${ROOTS.DASHBOARD}/banking`,
      booking: `${ROOTS.DASHBOARD}/booking`,
      file: `${ROOTS.DASHBOARD}/file`,
      course: `${ROOTS.DASHBOARD}/course`,
    },
    // ERP legacy
    auditoria: {
      root: `${ROOTS.DASHBOARD}/auditoria`,
      ...PANTALLAS_GENERICAS,
      eventosAuditoria: `${ROOTS.DASHBOARD}/auditoria/eventos-auditoria`,
      consultaAuditoria: `${ROOTS.DASHBOARD}/auditoria/consulta-auditoria`,
    },
    sistema: {
      root: `${ROOTS.DASHBOARD}/sistema`,
      ...PANTALLAS_GENERICAS,
      empresa: `${ROOTS.DASHBOARD}/sistema/empresa`,
      sucursal: `${ROOTS.DASHBOARD}/sistema/sucursal`,
      usuarios: {
        root: `${ROOTS.DASHBOARD}/usuarios/list`,
        list: `${ROOTS.DASHBOARD}/usuarios/list`,
        create: `${ROOTS.DASHBOARD}/usuarios/create`,
        edit: (id: string) => `${ROOTS.DASHBOARD}/usuarios/${id}/edit`,
      },
    },
    inventario: {
      root: `${ROOTS.DASHBOARD}/inventario`,
      productos: {
        root: `${ROOTS.DASHBOARD}/productos/list`,
        list: `${ROOTS.DASHBOARD}/productos/list`,
        create: `${ROOTS.DASHBOARD}/productos/create`,
        edit: (id: string) => `${ROOTS.DASHBOARD}/productos/${id}/edit`,
      },
    },
    // Minimals demos (shop product ≠ ERP /products)
    user: {
      root: `${ROOTS.DASHBOARD}/user`,
      new: `${ROOTS.DASHBOARD}/user/new`,
      list: `${ROOTS.DASHBOARD}/user/list`,
      cards: `${ROOTS.DASHBOARD}/user/cards`,
      profile: `${ROOTS.DASHBOARD}/user/profile`,
      account: `${ROOTS.DASHBOARD}/user/account`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/user/${id}/edit`,
      demo: {
        edit: `${ROOTS.DASHBOARD}/user/${MOCK_ID}/edit`,
      },
    },
    product: {
      root: `${ROOTS.DASHBOARD}/product`,
      new: `${ROOTS.DASHBOARD}/product/new`,
      details: (id: string) => `${ROOTS.DASHBOARD}/product/${id}`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/product/${id}/edit`,
      demo: {
        details: `${ROOTS.DASHBOARD}/product/${MOCK_ID}`,
        edit: `${ROOTS.DASHBOARD}/product/${MOCK_ID}/edit`,
      },
    },
    invoice: {
      root: `${ROOTS.DASHBOARD}/invoice`,
      new: `${ROOTS.DASHBOARD}/invoice/new`,
      details: (id: string) => `${ROOTS.DASHBOARD}/invoice/${id}`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/invoice/${id}/edit`,
      demo: {
        details: `${ROOTS.DASHBOARD}/invoice/${MOCK_ID}`,
        edit: `${ROOTS.DASHBOARD}/invoice/${MOCK_ID}/edit`,
      },
    },
    post: {
      root: `${ROOTS.DASHBOARD}/post`,
      new: `${ROOTS.DASHBOARD}/post/new`,
      details: (title: string) => `${ROOTS.DASHBOARD}/post/${paramCase(title)}`,
      edit: (title: string) => `${ROOTS.DASHBOARD}/post/${paramCase(title)}/edit`,
      demo: {
        details: `${ROOTS.DASHBOARD}/post/${paramCase(MOCK_TITLE)}`,
        edit: `${ROOTS.DASHBOARD}/post/${paramCase(MOCK_TITLE)}/edit`,
      },
    },
    order: {
      root: `${ROOTS.DASHBOARD}/order`,
      details: (id: string) => `${ROOTS.DASHBOARD}/order/${id}`,
      demo: {
        details: `${ROOTS.DASHBOARD}/order/${MOCK_ID}`,
      },
    },
    job: {
      root: `${ROOTS.DASHBOARD}/job`,
      new: `${ROOTS.DASHBOARD}/job/new`,
      details: (id: string) => `${ROOTS.DASHBOARD}/job/${id}`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/job/${id}/edit`,
      demo: {
        details: `${ROOTS.DASHBOARD}/job/${MOCK_ID}`,
        edit: `${ROOTS.DASHBOARD}/job/${MOCK_ID}/edit`,
      },
    },
    tour: {
      root: `${ROOTS.DASHBOARD}/tour`,
      new: `${ROOTS.DASHBOARD}/tour/new`,
      details: (id: string) => `${ROOTS.DASHBOARD}/tour/${id}`,
      edit: (id: string) => `${ROOTS.DASHBOARD}/tour/${id}/edit`,
      demo: {
        details: `${ROOTS.DASHBOARD}/tour/${MOCK_ID}`,
        edit: `${ROOTS.DASHBOARD}/tour/${MOCK_ID}/edit`,
      },
    },
  },
};
