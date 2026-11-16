import type { IProductItem } from 'src/types/product';

import { _mock } from './_mock';

// ----------------------------------------------------------------------

export const PRODUCT_GENDER_OPTIONS = [
  { label: 'Men', value: 'Men' },
  { label: 'Women', value: 'Women' },
  { label: 'Kids', value: 'Kids' },
];

export const PRODUCT_CATEGORY_OPTIONS = ['Shose', 'Apparel', 'Accessories'];

export const PRODUCT_RATING_OPTIONS = ['up4Star', 'up3Star', 'up2Star', 'up1Star'];

export const PRODUCT_COLOR_OPTIONS = [
  '#FF4842',
  '#1890FF',
  '#FFC0CB',
  '#00AB55',
  '#FFC107',
  '#7F00FF',
  '#000000',
  '#FFFFFF',
];

export const PRODUCT_COLOR_NAME_OPTIONS = [
  { value: '#FF4842', label: 'Red' },
  { value: '#1890FF', label: 'Blue' },
  { value: '#FFC0CB', label: 'Pink' },
  { value: '#00AB55', label: 'Green' },
  { value: '#FFC107', label: 'Yellow' },
  { value: '#7F00FF', label: 'Violet' },
  { value: '#000000', label: 'Black' },
  { value: '#FFFFFF', label: 'White' },
];

export const PRODUCT_SIZE_OPTIONS = [
  { value: '7', label: '7' },
  { value: '8', label: '8' },
  { value: '8.5', label: '8.5' },
  { value: '9', label: '9' },
  { value: '9.5', label: '9.5' },
  { value: '10', label: '10' },
  { value: '10.5', label: '10.5' },
  { value: '11', label: '11' },
  { value: '11.5', label: '11.5' },
  { value: '12', label: '12' },
  { value: '13', label: '13' },
];

export const PRODUCT_STOCK_OPTIONS = [
  { value: 'in stock', label: 'In stock' },
  { value: 'low stock', label: 'Low stock' },
  { value: 'out of stock', label: 'Out of stock' },
];

export const PRODUCT_PUBLISH_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Draft' },
];

export const PRODUCT_SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'newest', label: 'Newest' },
  { value: 'priceDesc', label: 'Price: High - Low' },
  { value: 'priceAsc', label: 'Price: Low - High' },
];

export const PRODUCT_CATEGORY_GROUP_OPTIONS = [
  { group: 'Clothing', classify: ['Shirts', 'T-shirts', 'Jeans', 'Leather', 'Accessories'] },
  { group: 'Tailored', classify: ['Suits', 'Blazers', 'Trousers', 'Waistcoats', 'Apparel'] },
  { group: 'Accessories', classify: ['Shoes', 'Backpacks and bags', 'Bracelets', 'Face masks'] },
];

export const PRODUCT_CHECKOUT_STEPS = ['Cart', 'Billing & address', 'Payment'];

// ----------------------------------------------------------------------

const INVENTORY_TYPES = ['in stock', 'low stock', 'out of stock'] as const;
const PUBLISH_TYPES = ['published', 'draft'] as const;
const CATEGORIES = ['Accessories', 'Apparel', 'Shose'] as const;

export const _products: IProductItem[] = [...Array(24)].map((_, index) => {
  const available = [72, 10, 0, 56, 18, 4][index % 6];
  const inventoryType =
    available === 0 ? INVENTORY_TYPES[2] : available <= 10 ? INVENTORY_TYPES[1] : INVENTORY_TYPES[0];

  return {
    id: _mock.id(index),
    sku: `16H9UR${index}`,
    name: _mock.productName(index),
    code: `CODE-${1000 + index}`,
    price: _mock.number.price(index),
    taxes: 10,
    tags: ['Kids', 'Toys', 'Shop'],
    sizes: ['7', '8', '9'],
    publish: PUBLISH_TYPES[index % 2],
    gender: ['Men', 'Women', 'Kids'].slice(0, (index % 3) + 1),
    coverUrl: _mock.image.product(index),
    images: [_mock.image.product(index), _mock.image.product(index + 1)],
    colors: ['#FF4842', '#1890FF', '#00AB55'].slice(0, (index % 3) + 1),
    quantity: available + 20,
    category: CATEGORIES[index % 3],
    available,
    totalSold: _mock.number.nativeM(index),
    description: _mock.description(index),
    totalRatings: _mock.number.rating(index),
    totalReviews: _mock.number.nativeS(index),
    createdAt: _mock.time(index),
    inventoryType,
    subDescription: _mock.sentence(index),
    priceSale: index % 3 ? _mock.number.price(index + 2) : null,
    reviews: [],
    ratings: [
      { name: '1 Star', starCount: 1, reviewCount: 1 },
      { name: '2 Star', starCount: 2, reviewCount: 2 },
      { name: '3 Star', starCount: 3, reviewCount: 3 },
      { name: '4 Star', starCount: 4, reviewCount: 4 },
      { name: '5 Star', starCount: 5, reviewCount: 5 },
    ],
    saleLabel: { enabled: Boolean(index % 3), content: 'SALE' },
    newLabel: { enabled: Boolean(index % 4), content: 'NEW' },
  };
});
