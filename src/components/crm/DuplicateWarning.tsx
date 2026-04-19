// DuplicateWarning — shows AI duplicate detection result below a form.
// Displays a warning banner if is_duplicate with the matched record.

import { AlertTriangle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { DuplicateResult } from '@/hooks/useDuplicateCheck';

interface Props {
  checking: boolean;
  result:   DuplicateResult | null;
  entityType: 'contact' | 'organization';
}

const DuplicateWarning = ({ checking, result, entityType }: Props) => {
  const nav = useNavigate();

  if (checking) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-muted bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        Checking for duplicates…
      </div>
    );
  }

  if (!result) return null;

  if (!result.is_duplicate || result.confidence < 60) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        No duplicate detected
      </div>
    );
  }

  // Duplicate found
  const m = result.matched;
  const detailPath = m ? (entityType === 'contact' ? `/contacts/${m.id}` : `/organizations/${m.id}`) : null;

  return (
    <div className={cn(
      'rounded-lg border px-3 py-3 space-y-2 text-xs',
      result.confidence >= 85
        ? 'border-red-200 bg-red-50'
        : 'border-amber-200 bg-amber-50'
    )}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn('h-4 w-4 shrink-0 mt-0.5',
          result.confidence >= 85 ? 'text-red-500' : 'text-amber-500')} />
        <div className="flex-1">
          <p className={cn('font-semibold', result.confidence >= 85 ? 'text-red-800' : 'text-amber-800')}>
            {result.confidence >= 85 ? 'Likely duplicate detected' : 'Possible duplicate'}
            <span className="ml-1.5 font-normal opacity-70">({result.confidence}% confidence)</span>
          </p>
          <p className={cn('mt-0.5', result.confidence >= 85 ? 'text-red-700' : 'text-amber-700')}>
            {result.reason}
          </p>
        </div>
      </div>

      {m && (
        <div className={cn('rounded-md border p-2 flex items-center gap-2',
          result.confidence >= 85 ? 'border-red-200 bg-red-100/50' : 'border-amber-200 bg-amber-100/50')}>
          <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs',
            result.confidence >= 85 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800')}>
            {m.name?.slice(0,2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{m.name}</p>
            <p className="opacity-70 truncate">{[m.phone, m.email].filter(Boolean).join(' · ')}</p>
          </div>
          {detailPath && (
            <button onClick={() => nav(detailPath)}
              className={cn('flex items-center gap-1 shrink-0 rounded px-2 py-1 font-medium transition-colors',
                result.confidence >= 85
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-amber-600 text-white hover:bg-amber-700')}>
              <ExternalLink className="h-3 w-3" /> View
            </button>
          )}
        </div>
      )}

      <p className={cn('text-[10px]', result.confidence >= 85 ? 'text-red-600' : 'text-amber-600')}>
        {result.confidence >= 85
          ? 'We recommend opening the existing record instead of creating a duplicate.'
          : 'Review the existing record before proceeding.'}
      </p>
    </div>
  );
};

export default DuplicateWarning;
