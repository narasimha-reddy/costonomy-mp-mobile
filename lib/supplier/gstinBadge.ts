export interface GstinBadge {
  kind: 'verified' | 'status' | 'add';
  label: string;
  tone: 'success' | 'pending' | 'neutral';
}

/**
 * The chip beside the GSTIN on business settings. "Verified" needs both a GSTIN on file and the server saying the
 * business is verified; a business with no GSTIN gets a neutral "Add GSTIN" prompt whatever its status says, and any
 * other status is shown as the server words it.
 */
export function gstinBadge(gstin: string | null | undefined, verificationStatus: string): GstinBadge {
  if ((gstin ?? '').trim() === '') return { kind: 'add', label: 'Add GSTIN', tone: 'neutral' };
  if (verificationStatus === 'VERIFIED') return { kind: 'verified', label: 'verified', tone: 'success' };
  return { kind: 'status', label: verificationStatus.replace(/_/g, ' ').toLowerCase(), tone: 'pending' };
}
