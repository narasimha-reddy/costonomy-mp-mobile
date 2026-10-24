import { apiRequest } from '@/lib/api/client';

// ── Types ─────────────────────────────────────────────────────────────

export interface TaxInvoiceItem {
  id: number;
  supplierOrderItemId: number;
  productName: string;
  hsnCode: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  taxableValue: string;
  gstRate: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  totalAmount: string;
}

export interface TaxInvoice {
  id: number;
  invoiceNumber: string;
  supplierOrderId: number;
  orderNumber: string;
  supplierStoreId: number;
  supplierName: string;
  supplierGstin: string;
  supplierAddress: string;
  supplierStateCode: string;
  outletId: number;
  restaurantId: number;
  buyerName: string;
  buyerGstin: string;
  buyerAddress: string;
  buyerStateCode: string;
  placeOfSupply: string;
  isInterState: boolean;
  taxableAmount: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  deliveryFee: string;
  totalAmount: string;
  status: string;
  issuedAt: string;
  items: TaxInvoiceItem[];
}

export interface CreditNoteItem {
  id: number;
  supplierOrderItemId: number;
  productName: string;
  hsnCode: string;
  rejectedQuantity: string;
  unit: string;
  unitPrice: string;
  taxableRefund: string;
  gstRate: string;
  cgstRefund: string;
  sgstRefund: string;
  igstRefund: string;
  totalRefund: string;
  rejectionReason: string;
}

export interface CreditNote {
  id: number;
  creditNoteNumber: string;
  taxInvoiceId: number;
  taxInvoiceNumber: string;
  supplierOrderId: number;
  orderNumber: string;
  supplierStoreId: number;
  supplierName: string;
  supplierGstin: string;
  outletId: number;
  restaurantId: number;
  buyerName: string;
  buyerGstin: string;
  reasonCode: string;
  isInterState: boolean;
  taxableRefundAmount: string;
  cgstRefundAmount: string;
  sgstRefundAmount: string;
  igstRefundAmount: string;
  totalRefundAmount: string;
  status: string;
  issuedAt: string;
  items: CreditNoteItem[];
}

// ── API ───────────────────────────────────────────────────────────────

export function fetchTaxInvoice(token: string, orderId: number): Promise<TaxInvoice> {
  return apiRequest<TaxInvoice>(`/api/v1/supplier-orders/${orderId}/tax-invoice`, { token });
}

export function generateTaxInvoice(token: string, orderId: number): Promise<TaxInvoice> {
  return apiRequest<TaxInvoice>(`/api/v1/supplier-orders/${orderId}/tax-invoice/generate`, {
    token,
    method: 'POST',
  });
}

export function fetchCreditNotes(token: string, orderId: number): Promise<CreditNote[]> {
  return apiRequest<CreditNote[]>(`/api/v1/supplier-orders/${orderId}/credit-notes`, { token });
}
