// GlobalSearch — Cmd+K command palette searching cases, contacts, organizations
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Search, FileText, Users, Building2, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface Result {
  id: string;
  type: 'case' | 'contact' | 'organization';
  title: string;
  sub?: string;
  href: string;
}

const ICONS = {
  case:         { icon: FileText,   color: 'text-amber-600',  bg: 'bg-amber-50' },
  contact:      { icon: Users,      color: 'text-blue-600',   bg: 'bg-blue-50' },
  organization: { icon: Building2,  color: 'text-purple-600', bg: 'bg-purple-50' },
};

const GlobalSearch = () => {
  const nav = useNavigate();
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel]         = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQ = useDebounce(query, 220);

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); setSel(0); }
  }, [open]);

  // Search all three entities in parallel
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const like = `%${q}%`;
      const [casesRes, contactsRes, orgsRes] = await Promise.all([
        (supabase as any).from('cases').select('id,subject,status,contacts(name)')
          .ilike('subject', like).limit(5),
        (supabase as any).from('contacts').select('id,name,phone,email')
          .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`).limit(5),
        (supabase as any).from('organizations').select('id,name,sap_bp_number')
          .or(`name.ilike.${like},sap_bp_number.ilike.${like}`).limit(5),
      ]);

      const r: Result[] = [
        ...(casesRes.data ?? []).map((c: any) => ({
          id: c.id, type: 'case' as const,
          title: c.subject ?? 'Untitled case',
          sub: `${c.status} · ${c.contacts?.name ?? ''}`,
          href: '/follow-up',
        })),
        ...(contactsRes.data ?? []).map((c: any) => ({
          id: c.id, type: 'contact' as const,
          title: c.name,
          sub: c.phone ?? c.email ?? '',
          href: `/contacts/${c.id}`,
        })),
        ...(orgsRes.data ?? []).map((o: any) => ({
          id: o.id, type: 'organization' as const,
          title: o.name,
          sub: o.sap_bp_number ? `SAP: ${o.sap_bp_number}` : '',
          href: `/organizations/${o.id}`,
        })),
      ];
      setResults(r);
      setSel(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search(debouncedQ); }, [debouncedQ, search]);

  const go = (href: string) => { nav(href); setOpen(false); };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[sel]) go(results[sel].href);
  };

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-muted/40 text-muted-foreground text-sm hover:bg-muted transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono">
        <span>⌘</span>K
      </kbd>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Palette */}
      <div className="relative w-full max-w-xl mx-4 rounded-2xl border bg-card shadow-2xl overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search cases, contacts, organizations…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
          />
          {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
          {!loading && query && (
            <button onClick={() => setQuery('')}><X className="h-4 w-4 text-muted-foreground" /></button>
          )}
          <kbd className="text-[10px] text-muted-foreground border rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-1">
            {results.map((r, i) => {
              const { icon: Icon, color, bg } = ICONS[r.type];
              return (
                <button key={r.id} onClick={() => go(r.href)}
                  onMouseEnter={() => setSel(i)}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-2.5 text-left transition-colors',
                    i === sel ? 'bg-primary/8' : 'hover:bg-muted/50'
                  )}>
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', bg)}>
                    <Icon className={cn('h-4 w-4', color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    {r.sub && <p className="text-xs text-muted-foreground truncate capitalize">{r.sub}</p>}
                  </div>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize shrink-0',
                    r.type === 'case' ? 'bg-amber-100 text-amber-700' :
                    r.type === 'contact' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700')}>
                    {r.type}
                  </span>
                  {i === sel && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {query.length >= 2 && !loading && results.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No results for "{query}"
          </div>
        )}

        {query.length < 2 && (
          <div className="px-4 py-3 text-xs text-muted-foreground border-t">
            Type at least 2 characters · ↑↓ navigate · Enter to open · Esc to close
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
