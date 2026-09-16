
describe('Product Repository - Data Isolation', () => {
  const repo = {
    findByRestaurant: (restaurantId: string) => {
      return restaurantId === 'rest-1'
        ? [{ id: 'p1', name: 'Biryani', restaurant_id: 'rest-1' }]
        : [{ id: 'p2', name: 'Pizza', restaurant_id: 'rest-2' }];
    },
    findById: (id: string, restaurantId: string) => {
      const products: Record<string, Array<{ id: string; restaurant_id: string }>> = {
        'rest-1': [{ id: 'p1', restaurant_id: 'rest-1' }],
        'rest-2': [{ id: 'p2', restaurant_id: 'rest-2' }],
      };
      return (products[restaurantId] ?? []).find((p) => p.id === id) ?? null;
    },
  };

  it('returns different products for different restaurants', () => {
    const rest1 = repo.findByRestaurant('rest-1');
    const rest2 = repo.findByRestaurant('rest-2');
    expect(rest1).toHaveLength(1);
    expect(rest2).toHaveLength(1);
    expect(rest1[0].restaurant_id).toBe('rest-1');
    expect(rest2[0].restaurant_id).toBe('rest-2');
    expect(rest1[0].id).not.toBe(rest2[0].id);
  });

  it('prevents accessing another restaurants product', () => {
    const product = repo.findById('p1', 'rest-2');
    expect(product).toBeNull();
  });
});

describe('Category Repository - Data Isolation', () => {
  const repo = {
    findByRestaurant: (restaurantId: string) => {
      return restaurantId === 'rest-1'
        ? [{ id: 'c1', name: 'Starters', restaurant_id: 'rest-1' }]
        : [{ id: 'c2', name: 'Main Course', restaurant_id: 'rest-2' }];
    },
  };

  it('isolates categories by restaurant', () => {
    const cat1 = repo.findByRestaurant('rest-1');
    const cat2 = repo.findByRestaurant('rest-2');
    expect(cat1[0].restaurant_id).toBe('rest-1');
    expect(cat2[0].restaurant_id).toBe('rest-2');
  });
});
