import { searchSuppliers, fetchPopularSuppliers, fetchRecommendations } from '@/services/catalog';
import { apiRequest } from '@/lib/api/client';

jest.mock('@/lib/api/client', () => ({
  ...jest.requireActual('@/lib/api/client'),
  apiRequest: jest.fn().mockResolvedValue({ suppliers: [], beyondRadius: 0 }),
}));

const urlOfLastCall = () => (apiRequest as jest.Mock).mock.calls.at(-1)?.[0] as string;

describe('searchSuppliers', () => {
  it('asks for a page by offset, and for every supplier with reach=all', async () => {
    await searchSuppliers('t', 'abc', 9, undefined, undefined, { reach: 'all', offset: 50 });
    expect(urlOfLastCall()).toContain('reach=all');
    expect(urlOfLastCall()).toContain('offset=50');
  });

  it('sends neither by default, so ordinary searches stay filtered and start at the first page', async () => {
    await searchSuppliers('t', 'abc', 9);
    expect(urlOfLastCall()).not.toContain('reach');
    expect(urlOfLastCall()).not.toContain('offset');
  });

  it('passes openNow, minRating, and sort to the query string', async () => {
    await searchSuppliers('t', 'abc', 9, 10, undefined, {
      openNow: true,
      minRating: 4,
      sort: 'rating',
    });
    const url = urlOfLastCall();
    expect(url).toContain('radiusKm=10');
    expect(url).toContain('openNow=true');
    expect(url).toContain('minRating=4');
    expect(url).toContain('sort=rating');
  });
});

describe('fetchPopularSuppliers', () => {
  it('passes radiusKm, openNow, minRating, and sort options', async () => {
    await fetchPopularSuppliers('t', 9, 20, 5, {
      radiusKm: 15,
      openNow: true,
      minRating: 3,
      sort: 'rating',
    });
    const url = urlOfLastCall();
    expect(url).toContain('/api/v1/outlets/9/suppliers/popular');
    expect(url).toContain('limit=20');
    expect(url).toContain('categoryId=5');
    expect(url).toContain('radiusKm=15');
    expect(url).toContain('openNow=true');
    expect(url).toContain('minRating=3');
    expect(url).toContain('sort=rating');
  });
});

describe('fetchRecommendations', () => {
  it('sends the quantity, sort and filters, and nothing for what was not chosen', async () => {
    await fetchRecommendations('t', 7, 9, '20', { sort: 'price', coversQuantity: true, radiusKm: 10 });
    const url = urlOfLastCall();
    expect(url).toContain('outletId=9');
    expect(url).toContain('quantity=20');
    expect(url).toContain('sort=price');
    expect(url).toContain('coversQuantity=true');
    expect(url).toContain('radiusKm=10');
    expect(url).not.toContain('openNow');

    await fetchRecommendations('t', 7, 9, '1');
    expect(urlOfLastCall()).not.toContain('sort=');
  });
});

