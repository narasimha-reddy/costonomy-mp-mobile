import {
  buildStatementQuery,
  fallbackFileName,
  fileNameFromDisposition,
  financialYears,
  isValidDay,
  validateStatement,
} from '@/lib/wallet/statement';
import type { StatementRequest } from '@/models/wallet';

const NOW = new Date(2026, 8, 29, 12, 0, 0); // 29 Sep 2026, local

const custom = (from: string, to: string): StatementRequest =>
  ({ kind: 'custom', from, to, format: 'PDF' });

describe('validateStatement: custom range', () => {
  it('accepts one day', () => {
    expect(validateStatement(custom('2026-09-10', '2026-09-10'), NOW)).toBeNull();
  });
  it('accepts up to today', () => {
    expect(validateStatement(custom('2026-09-01', '2026-09-29'), NOW)).toBeNull();
  });
  it('accepts 366 days and refuses 367 (both end days counted)', () => {
    // 2025-09-29 to 2026-09-29 is 366 days inclusive.
    expect(validateStatement(custom('2025-09-29', '2026-09-29'), NOW)).toBeNull();
    expect(validateStatement(custom('2025-09-28', '2026-09-29'), NOW)).toMatch(/at most 366 days/);
  });
  it('counts a leap year the same way', () => {
    const now = new Date(2024, 11, 31, 12);
    expect(validateStatement(custom('2024-01-01', '2024-12-31'), now)).toBeNull(); // 366
    expect(validateStatement(custom('2023-12-31', '2024-12-31'), now)).toMatch(/366/); // 367
  });
  it('refuses a future date', () => {
    expect(validateStatement(custom('2026-09-01', '2026-09-30'), NOW)).toMatch(/future/);
    expect(validateStatement(custom('2026-10-01', '2026-10-02'), NOW)).toMatch(/future/);
  });
  it('refuses from after to', () => {
    expect(validateStatement(custom('2026-09-10', '2026-09-09'), NOW)).toMatch(/on or before/);
  });
  it('refuses blanks and things that are not dates', () => {
    expect(validateStatement(custom('', '2026-09-09'), NOW)).toMatch(/both dates/);
    expect(validateStatement(custom('2026-09-01', ''), NOW)).toMatch(/both dates/);
    expect(validateStatement(custom('09/01/2026', '2026-09-09'), NOW)).toMatch(/2026-09-16/);
    expect(validateStatement(custom('2026-02-30', '2026-09-09'), NOW)).toMatch(/2026-09-16/);
  });
  it('tolerates spaces around a date', () => {
    expect(validateStatement(custom(' 2026-09-01 ', '2026-09-02 '), NOW)).toBeNull();
  });
});

describe('validateStatement: other kinds', () => {
  it('a preset range is always fine', () => {
    expect(validateStatement({ kind: 'range', range: 'LAST_30', format: 'CSV' }, NOW)).toBeNull();
  });
  it('a financial year must be well formed and started', () => {
    const fy = (financialYear: string): StatementRequest => ({ kind: 'financialYear', financialYear, format: 'PDF' });
    expect(validateStatement(fy('2025-26'), NOW)).toBeNull();
    expect(validateStatement(fy('2026-27'), NOW)).toBeNull();
    expect(validateStatement(fy('2027-28'), NOW)).toMatch(/not started/);
    expect(validateStatement(fy('2025-27'), NOW)).toMatch(/Choose/);
    expect(validateStatement(fy(''), NOW)).toMatch(/Choose/);
    expect(validateStatement(fy('1999-00'), NOW)).toBeNull();
  });
});

describe('isValidDay', () => {
  it('knows real days', () => {
    expect(isValidDay('2024-02-29')).toBe(true);
    expect(isValidDay('2026-02-29')).toBe(false);
    expect(isValidDay('2026-13-01')).toBe(false);
  });
});

describe('financialYears', () => {
  it('starts each year on 1 April', () => {
    expect(financialYears(new Date(2026, 3, 1), 2).map((y) => y.key)).toEqual(['2026-27', '2025-26']);
    expect(financialYears(new Date(2026, 2, 31), 2).map((y) => y.key)).toEqual(['2025-26', '2024-25']);
  });
  it('mid-year and January are still the year that began the April before', () => {
    expect(financialYears(new Date(2026, 8, 29))[0]).toEqual({ key: '2026-27', label: 'FY 2026-27' });
    expect(financialYears(new Date(2027, 0, 15))[0]!.key).toBe('2026-27');
  });
  it('rolls over the century', () => {
    expect(financialYears(new Date(2099, 5, 1), 2).map((y) => y.key)).toEqual(['2099-00', '2098-99']);
  });
  it('lists five by default, newest first', () => {
    const years = financialYears(new Date(2026, 8, 29));
    expect(years.map((y) => y.key)).toEqual(['2026-27', '2025-26', '2024-25', '2023-24', '2022-23']);
  });
});

describe('buildStatementQuery', () => {
  it('a preset range', () => {
    expect(buildStatementQuery({ kind: 'range', range: 'LAST_90', format: 'CSV' }))
      .toBe('?range=LAST_90&format=CSV');
  });
  it('a custom range carries its dates', () => {
    expect(buildStatementQuery(custom(' 2026-09-01', '2026-09-10 ')))
      .toBe('?range=CUSTOM&from=2026-09-01&to=2026-09-10&format=PDF');
  });
  it('a financial year replaces the range', () => {
    expect(buildStatementQuery({ kind: 'financialYear', financialYear: '2025-26', format: 'PDF' }))
      .toBe('?financialYear=2025-26&format=PDF');
  });
});

describe('fileNameFromDisposition', () => {
  const fallback = 'wallet-statement.pdf';
  it('reads a quoted filename', () => {
    expect(fileNameFromDisposition('attachment; filename="stmt-2026.pdf"', fallback)).toBe('stmt-2026.pdf');
  });
  it('reads an unquoted one', () => {
    expect(fileNameFromDisposition('attachment; filename=stmt.csv', fallback)).toBe('stmt.csv');
    expect(fileNameFromDisposition('attachment; filename=stmt.csv; size=3', fallback)).toBe('stmt.csv');
  });
  it('prefers filename* and decodes it', () => {
    expect(fileNameFromDisposition(
      `attachment; filename="fallback.pdf"; filename*=UTF-8''My%20Statement%20%E2%82%B9.pdf`, fallback))
      .toBe('My Statement ₹.pdf');
  });
  it('keeps a name with a semicolon inside quotes', () => {
    expect(fileNameFromDisposition('attachment; filename="a;b.pdf"', fallback)).toBe('a;b.pdf');
  });
  it('strips any directory part', () => {
    expect(fileNameFromDisposition('attachment; filename="../../etc/passwd"', fallback)).toBe('passwd');
    expect(fileNameFromDisposition('attachment; filename="C:\\x\\y.pdf"', fallback)).toBe('y.pdf');
  });
  it('falls back for a missing, empty or unusable header', () => {
    expect(fileNameFromDisposition(null, fallback)).toBe(fallback);
    expect(fileNameFromDisposition('', fallback)).toBe(fallback);
    expect(fileNameFromDisposition('attachment', fallback)).toBe(fallback);
    expect(fileNameFromDisposition('attachment; filename=""', fallback)).toBe(fallback);
    expect(fileNameFromDisposition('attachment; filename=".."', fallback)).toBe(fallback);
    expect(fileNameFromDisposition("attachment; filename*=UTF-8''%E0%A4%A", fallback)).toBe(fallback);
  });
  it('the fallback name follows the format and date', () => {
    expect(fallbackFileName('CSV', NOW)).toBe('wallet-statement-2026-09-29.csv');
  });
});
