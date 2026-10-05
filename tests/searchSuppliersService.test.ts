import { searchSuppliers } from '@/services/catalog';
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
});
