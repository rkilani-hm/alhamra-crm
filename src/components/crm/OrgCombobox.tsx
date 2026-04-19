// OrgCombobox — searchable organization picker replacing the plain <Select>
// Filters client-side from a pre-loaded list (fast, no extra queries).

import { useState, useRef, useEffect } from 'react';
import { Search, Building2, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Org { id: string; name: string; }

interface Props {
  orgs:        Org[];
  value:       string;           // org id or ''
  onChange:    (id: string) => void;
  placeholder?: string;
  className?:  string;
}

const OrgCombobox = ({ orgs, value, onChange, placeholder = 'Select organization…', className }: Props) => {
  const [open,   setOpen]   = useState(false);
  const [query,  setQuery]  = useState('');
  const inputRef  = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = orgs.find(o => o.id === value) ?? null;

  const filtered = query.trim().length < 1
    ? orgs.slice(0, 60)   // show first 60 when no query
    : orgs.filter(o => o.name.toLowerCase().includes(query.toLowerCase())).slice(0, 80);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (org: Org | null) => {
    onChange(org?.id ?? '');
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={cn(
          'flex w-full items-center justify-between rounded-md border bg-background px-3 h-9 text-xs',
          'hover:bg-muted/30 transition-colors text-left',
          open ? 'border-primary ring-1 ring-primary/30' : 'border-input',
        )}
      >
        <span className={cn('truncate flex items-center gap-1.5', !selected && 'text-muted-foreground')}>
          {selected ? (
            <><Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />{selected.name}</>
          ) : placeholder}
        </span>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {selected && (
            <span onClick={e => { e.stopPropagation(); pick(null); }}
              className="rounded-full hover:bg-muted p-0.5 cursor-pointer">
              <X className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border bg-card shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Type to search organizations…"
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground/60"
            />
            {query && (
              <button onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* None option */}
          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            <button type="button" onClick={() => pick(null)}
              className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-muted/40 transition-colors',
                !value && 'bg-muted/30 font-medium')}>
              <span className="text-muted-foreground italic">No organization</span>
            </button>

            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-center text-muted-foreground">
                No organizations found for "{query}"
              </p>
            )}

            {filtered.map(org => (
              <button type="button" key={org.id} onClick={() => pick(org)}
                className={cn('flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-muted/40 transition-colors',
                  value === org.id && 'bg-primary/8 text-primary font-medium')}>
                <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{org.name}</span>
              </button>
            ))}

            {!query && orgs.length > 60 && (
              <p className="px-3 py-2 text-[10px] text-center text-muted-foreground border-t">
                Showing first 60 of {orgs.length} — type to search
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrgCombobox;
