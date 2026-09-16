export interface MenuItem {
  id: string;
  name: string;
  price: number;
  desc: string;
  fullDesc?: string;
  veg: boolean;
  popular: boolean;
  img: string;
  rating?: number;
  category?: string;
  servings?: string;
  pieces?: string;
  portionSize?: string;
  includedItems?: string[];
  ingredients?: string[];
  allergens?: string[];
  prepTime?: number;
  deliveryTime?: string;
  spiceLevel?: number;
  unit?: string;
  packagingBigQty?: number;
  packagingSmallQty?: number;
  isAvailable?: boolean;
}

export interface MenuSection {
  category: string;
  items: MenuItem[];
}

export const menuSections: MenuSection[] = [
  {
    category: 'Thali',
    items: [
      {
        id: 'thali-chicken',
        name: 'Chicken Thali',
        price: 70,
        desc: 'Complete traditional chicken meal with rice, dal, sabzi & chicken curry.',
        fullDesc: 'A complete traditional chicken meal prepared with freshly cooked fragrant rice, flavorful Assamese-style chicken curry, homestyle yellow dal, seasonal vegetable sabzi, and accompanying side salad and pickle. Perfect and wholesome for one person.',
        veg: false,
        popular: true,
        img: '/images/Chicken Curry.jpg',
        rating: 4.8,
        category: 'Thali',
        servings: '1 person',
        portionSize: '1 complete thali (approx 450g)',
        includedItems: [
          '1 serving of steamed rice',
          '1 portion chicken curry (2-3 tender pieces)',
          '1 bowl comforting yellow dal',
          '1 serving seasonal vegetable sabzi',
          'Fresh salad and homemade pickle',
        ],
        ingredients: ['Rice', 'Chicken', 'Lentils', 'Seasonal vegetables', 'Onion', 'Ginger-garlic', 'Assamese spices', 'Mustard oil'],
        allergens: ['None'],
        prepTime: 15,
        deliveryTime: '20–30 min',
        spiceLevel: 2,
        unit: 'plate',
        packagingBigQty: 1,
        packagingSmallQty: 1,
      },
      {
        id: 'thali-pork',
        name: 'Pork Thali',
        price: 70,
        desc: 'Complete hearty thali with rice, dal, sabzi & tender pork curry.',
        fullDesc: 'A hearty traditional pork meal featuring fresh steamed rice, rich and aromatic pork curry cooked with local herbs and spices, slow-simmered dal, seasonal sabzi, and fresh sides. Generous and satisfying.',
        veg: false,
        popular: true,
        img: '/images/Pork Thali.webp',
        rating: 4.9,
        category: 'Thali',
        servings: '1 person',
        portionSize: '1 complete thali (approx 450g)',
        includedItems: [
          '1 serving of steamed rice',
          '1 portion traditional pork curry',
          '1 bowl homestyle yellow dal',
          '1 serving seasonal vegetable sabzi',
          'Fresh salad and homemade pickle',
        ],
        ingredients: ['Rice', 'Fresh pork', 'Lentils', 'Seasonal greens', 'Onion', 'Garlic', 'Chili', 'Regional spices'],
        allergens: ['None'],
        prepTime: 15,
        deliveryTime: '20–30 min',
        spiceLevel: 3,
        unit: 'plate',
        packagingBigQty: 1,
        packagingSmallQty: 1,
      },
      {
        id: 'thali-veg',
        name: 'Veg Thali',
        price: 60,
        desc: 'Complete vegetarian thali with rice, dal, aloo sabzi & crispy papad.',
        fullDesc: 'A nourishing vegetarian thali made with warm steamed rice, nutritious yellow dal, flavorful aloo posto or seasonal mixed vegetable curry, crispy papad, and tangy pickle.',
        veg: true,
        popular: true,
        img: '/images/Aloo Posto.jpg',
        rating: 4.6,
        category: 'Thali',
        servings: '1 person',
        portionSize: '1 complete thali (approx 400g)',
        includedItems: [
          '1 serving of steamed rice',
          '1 bowl seasoned yellow dal',
          '1 serving seasonal mixed vegetable curry',
          '1 portion aloo sabzi / bhaji',
          'Crispy papad and pickle',
        ],
        ingredients: ['Rice', 'Lentils', 'Potatoes', 'Seasonal vegetables', 'Mustard oil', 'Cumin', 'Spices'],
        allergens: ['None'],
        prepTime: 10,
        deliveryTime: '20–30 min',
        spiceLevel: 1,
        unit: 'plate',
        packagingBigQty: 1,
        packagingSmallQty: 0,
      },
    ],
  },
  {
    category: 'Gravy',
    items: [
      {
        id: 'gravy-chicken',
        name: 'Chicken (5 pcs) Gravy',
        price: 40,
        desc: '5 pieces of succulent chicken in rich, spiced home-style gravy.',
        fullDesc: 'Five succulent chicken pieces cooked in a rich, slow-simmered onion and tomato gravy flavored with whole spices and fresh coriander. Great as an add-on or side curry.',
        veg: false,
        popular: false,
        img: '/images/Chicken (5 pcs) Gravy.webp',
        rating: 4.7,
        category: 'Gravy',
        servings: '1–2 persons',
        pieces: '5 pieces',
        portionSize: '1 bowl (approx 300ml)',
        includedItems: ['5 chicken pieces in homestyle gravy'],
        ingredients: ['Chicken', 'Onion', 'Tomato', 'Ginger', 'Garlic', 'Garam masala', 'Coriander'],
        allergens: ['None'],
        prepTime: 15,
        deliveryTime: '20–30 min',
        spiceLevel: 2,
        unit: 'bowl',
        packagingBigQty: 0,
        packagingSmallQty: 1,
      },
      {
        id: 'gravy-pork',
        name: 'Pork (5 pcs) Gravy',
        price: 40,
        desc: '5 pieces of tender pork in aromatic traditional spiced curry.',
        fullDesc: 'Five tender pieces of pork simmered in an authentic regional spiced gravy infused with garlic, chili, and regional herbs for rich depth of flavor.',
        veg: false,
        popular: false,
        img: '/images/Pork(5 pcs) Gravy.jpg',
        rating: 4.5,
        category: 'Gravy',
        servings: '1–2 persons',
        pieces: '5 pieces',
        portionSize: '1 bowl (approx 300ml)',
        includedItems: ['5 pork pieces in flavorful traditional curry'],
        ingredients: ['Pork', 'Onion', 'Garlic', 'Chili', 'Regional spices', 'Mustard oil'],
        allergens: ['None'],
        prepTime: 15,
        deliveryTime: '20–30 min',
        spiceLevel: 3,
        unit: 'bowl',
        packagingBigQty: 0,
        packagingSmallQty: 1,
      },
    ],
  },
];
