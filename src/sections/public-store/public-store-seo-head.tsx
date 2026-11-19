import type { PublicStorefront } from 'src/api/firestore/online-orders';

import { useMemo } from 'react';
import { Helmet } from 'react-helmet-async';

// ----------------------------------------------------------------------

const SCHEMA_DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export function buildStoreSeoDescription(store: PublicStorefront): string {
  if (store.description && store.description.trim()) {
    return store.description.trim();
  }

  const modes: string[] = [];
  if (store.acceptDelivery) modes.push('Delivery');
  if (store.acceptPickup) modes.push('Retirada no balcão');

  const cityPart = [store.address?.city, store.address?.state].filter(Boolean).join(' - ');
  const categories = Array.from(
    new Set((store.products || []).map((p) => p.category).filter(Boolean))
  ).slice(0, 4);

  const catPart = categories.length ? ` Confira: ${categories.join(', ')}.` : '';

  return `Faça seu pedido online em ${store.storeName}${cityPart ? ` (${cityPart})` : ''}.${
    modes.length ? ` ${modes.join(' e ')}.` : ''
  }${catPart}`.trim();
}

export function buildStoreSharePayload(store: PublicStorefront, slug: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const storeUrl = `${origin}/p/${slug}`;
  const description = buildStoreSeoDescription(store);
  const title = `${store.storeName} — Cardápio Online`;

  const whatsappText = `*${store.storeName}*\n${description}\n\nPeça online agora:\n${storeUrl}`;

  return {
    title,
    description,
    storeUrl,
    whatsappText,
    whatsappShareUrl: `https://wa.me/?text=${encodeURIComponent(whatsappText)}`,
  };
}

type Props = {
  store: PublicStorefront;
  slug: string;
};

export function PublicStoreSeoHead({ store, slug }: Props) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const canonicalUrl = `${origin}/p/${slug}`;
  const title = `${store.storeName} — Cardápio Online e Delivery`;
  const description = useMemo(() => buildStoreSeoDescription(store), [store]);
  const ogImage = store.bannerUrl || store.logoUrl || '';

  const jsonLd = useMemo(() => {
    const openingHoursSpecification = (store.openingHours || [])
      .filter((h) => !h.closed && h.open && h.close)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: SCHEMA_DAYS[Number(h.day)] || 'Monday',
        opens: h.open,
        closes: h.close,
      }));

    const hasAddress = Boolean(store.address?.street || store.address?.city);

    return {
      '@context': 'https://schema.org',
      '@type': 'FoodEstablishment',
      name: store.storeName,
      description,
      url: canonicalUrl,
      ...(ogImage ? { image: ogImage } : {}),
      ...(store.logoUrl ? { logo: store.logoUrl } : {}),
      ...(store.whatsapp ? { telephone: store.whatsapp } : {}),
      ...(hasAddress && store.address
        ? {
            address: {
              '@type': 'PostalAddress',
              streetAddress: [store.address.street, store.address.number]
                .filter(Boolean)
                .join(', '),
              addressLocality: store.address.city || '',
              addressRegion: store.address.state || '',
              postalCode: store.address.zipCode || '',
              addressCountry: 'BR',
            },
          }
        : {}),
      ...(openingHoursSpecification.length ? { openingHoursSpecification } : {}),
      hasOfferCatalog: {
        '@type': 'OfferCatalog',
        name: `Cardápio ${store.storeName}`,
        itemListElement: (store.products || []).slice(0, 60).map((product) => ({
          '@type': 'Offer',
          priceCurrency: 'BRL',
          price: Number(product.salePrice || 0).toFixed(2),
          availability: store.isOpen
            ? 'https://schema.org/InStock'
            : 'https://schema.org/PreOrder',
          itemOffered: {
            '@type': 'Product',
            name: product.name,
            ...(product.description ? { description: product.description } : {}),
            ...(product.imageUrl ? { image: product.imageUrl } : {}),
            ...(product.category ? { category: product.category } : {}),
          },
        })),
      },
    };
  }, [canonicalUrl, description, ogImage, store]);

  return (
    <Helmet>
      <html lang="pt-BR" />
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph (WhatsApp, Facebook, LinkedIn, Telegram) */}
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="pt_BR" />
      <meta property="og:site_name" content={store.storeName} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      {ogImage && <meta property="og:image:secure_url" content={ogImage} />}
      {ogImage && <meta property="og:image:width" content="1200" />}
      {ogImage && <meta property="og:image:height" content="630" />}
      {ogImage && <meta property="og:image:alt" content={store.storeName} />}

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {/* Preload do Banner principal para otimizar LCP */}
      {store.bannerUrl && <link rel="preload" as="image" href={store.bannerUrl} />}

      {/* JSON-LD Estruturado (Google Rich Results + Indexação de Produtos) */}
      <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
    </Helmet>
  );
}
