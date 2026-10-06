import { useCallback, useEffect, useRef, useState } from 'react';
import { CsvExportError, FAILED_TEXT } from '@/services/creditExport';

/**
 * Runs one CSV export at a time and keeps what to tell the person: nothing while it runs or
 * after it works, plain words when it fails. A second tap while one runs does nothing.
 */
export function useCsvExport() {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const run = useCallback(async (job: () => Promise<unknown>): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setExporting(true);
    setError(null);
    try {
      await job();
      return true;
    } catch (caught) {
      if (mounted.current) setError(caught instanceof CsvExportError ? caught.message : FAILED_TEXT);
      return false;
    } finally {
      inFlight.current = false;
      if (mounted.current) setExporting(false);
    }
  }, []);

  const clear = useCallback(() => setError(null), []);
  return { run, exporting, error, clear };
}
