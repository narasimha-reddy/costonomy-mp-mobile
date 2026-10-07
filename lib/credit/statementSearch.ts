import type { CreditStatementLine } from '@/models/credit';
import { methodLabel, statementDetail } from '@/lib/credit/statement';

/** Lower-case, one space between words. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Whether a line matches a search: its invoice, order number, reference, label or method contains it. */
export function lineMatches(line: CreditStatementLine, query: string): boolean {
  const q = normalise(query);
  if (q === '') return true;
  return [
    line.invoiceNumber ?? '', line.orderNumber ?? '', line.reference ?? '', line.label,
    line.method ? methodLabel(line.method) : '', line.method ?? '', statementDetail(line),
  ].some((text) => normalise(text).includes(q));
}

/** The lines that match; an empty query keeps them all, in their order. */
export function searchLines(lines: CreditStatementLine[], query: string): CreditStatementLine[] {
  return normalise(query) === '' ? lines : lines.filter((line) => lineMatches(line, query));
}
