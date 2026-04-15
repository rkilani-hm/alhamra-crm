// ContactSearchBar — global search across contacts + organizations for case creation.
// Searches by name, phone, email, SAP BP number, or Arabic name.
// Returns a selected record to pre-fill the form.

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useDebounce } from '@/hooks/useDebounce';
import { Search, User, Building2, Truck, X, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectedContact {
  id:              string;
  type:            'contact' | 'organization';
  name:            string;
  phone:           string | null;
  email:           string | null;
  org_type?:       string | null;   // tenant | vendor | partner | prospect
  org_name?:       string | null;   // for contacts: their organization name
  sap_bp_number?:  string | null;
  contract_number? :string | null;
  client_type?:    string | null;
}

interface Result {
  id:       string;
  type:     'contact' | 'organization';
  label:    string;
  sub:      string;
  tag:      string;
  tagColor: string;
  data:     SelectedContact;
}

const TYPE_ICON = {
  contact:      User,
  organization: Building2,
};

const ORG_TAG: Record<string, { label: string; color: string }> = {
  tenant:  { label: 'Tenant',  color: 'bg-blue-100 text-blue-700'   },
  vendor:  { label: 'Vendor',  color: 'bg-amber-100 text-amber-700' },
  partner: { label: 'Partner', color: 'bg-purple-100 text-purple-700' },
  prospect:{ label: 'Prospect',color: 'bg-green-100 text-green-700' },
};

interface Props {
  onSelect:   (c: SelectedContact) => void;
  onClear?:   () => void;
  selected?:  SelectedContact | null;
  placeholder?: string;
}

const ContactSearchBar = ({ onSelect, onClear, selected, placeholder = 'Search by name, phone, email, SAP BP…' }: Props) => {
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<Result[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQ = useDebounce(query, 200);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const like = `%${q}%`;
      const [contactsRes, orgsRes] = await Promise.all([
        (supabase as any)
          .from('contacts')
          .select('id,name,phone,email,client_type,organizations(id,name,type)')
          .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .limit(6),
        (supabase as any)
          .from('organizations')
          .select('id,name,name_arabic,phone,email,type,sap_bp_number,lease_contract_number')
          .or(`name.ilike.${like},name_arabic.ilike.${like},sap_bp_number.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .limit(6),
      ]);

      const contacts: Result[] = (contactsRes.data ?? []).map((c: any) => {
        const orgName  = c.organizations?.name ?? null;
        const ctType   = c.client_type ?? 'contact';
        const ctMeta   = ORG_TAG[ctType] ?? { label: 'Contact', color: 'bg-slate-100 text-slate-600' };
        return {
          id: c.id, type: 'contact' as const,
          label:    c.name,
          sub:      [c.phone, c.email, orgName].filter(Boolean).join(' · '),
          tag:      ctMeta.label,
          tagColor: ctMeta.color,
          data: {
            id: c.id, type: 'contact',
            name: c.name, phone: c.phone, email: c.email,
            org_name: orgName, client_type: c.client_type,
          },
        };
      });

      const orgs: Result[] = (orgsRes.data ?? []).map((o: any) => {
        const meta = ORG_TAG[o.type] ?? { label: o.type ?? 'Org', color: 'bg-slate-100 text-slate-600' };
        return {
          id: o.id, type: 'organization' as const,
          label:    o.name,
          sub:      [o.name_arabic, o.sap_bp_number ? `BP: ${o.sap_bp_number}` : null, o.phone].filter(Boolean).join(' · '),
          tag:      meta.label,
          tagColor: meta.color,
          data: {
            id: o.id, type: 'organization',
            name: o.name, phone: o.phone, email: o.email,
            org_type: o.type, sap_bp_number: o.sap_bp_number,
            contract_number: o.lease_contract_number,
          },
        };
      });

      setResults([...contacts, ...orgs]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { search(debouncedQ); }, [debouncedQ, search]);

  const pick = (r: Result) => {
    onSelect(r.data);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onClear?.();
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Selected state ───────────────────────────────────────
  if (selected) {
    const isOrg  = selected.type === 'organization';
    const Icon   = isOrg ? Building2 : User;
    const meta   = ORG_TAG[selected.org_type ?? selected.client_type ?? ''] ?? { label: 'Contact', color: 'bg-slate-100 text-slate-600' };
    return (
      <div className="flex items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/4 px-4 py-3">
        <CheckCircle2 className="h-4.5 w-4.5 text-primary shrink-0" />
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{selected.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {[selected.phone, selected.email, selected.org_name, selected.sap_bp_number ? `BP ${selected.sap_bp_number}` : null]
              .filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0', meta.color)}>
          {meta.label}
        </span>
        <button onClick={clear} className="ml-1 text-muted-foreground hover:text-foreground shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Search input + dropdown ──────────────────────────────
  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-xl border-2 border-border bg-background px-3 py-2.5 focus-within:border-primary transition-colors">
        {loading
          ? <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
          : <Search className="h-4 w-4 text-muted-foreground shrink-0" />}
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/60"
          autoComplete="off"
        />
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); }}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (results.length > 0 || (query.length >= 2 && !loading)) && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-xl border bg-card shadow-2xl overflow-hidden">
            {results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                No contacts or organizations found for "{query}"
              </div>
            )}

            {/* Group: Contacts */}
            {results.filter(r => r.type === 'contact').length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/30 border-b">
                  Contacts
                </div>
                {results.filter(r => r.type === 'contact').map(r => {
                  const Icon = TYPE_ICON[r.type];
                  return (
                    <button key={r.id} onClick={() => pick(r)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
                        <Icon className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.sub}</p>
                      </div>
                      <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0', r.tagColor)}>
                        {r.tag}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            {/* Group: Organizations */}
            {results.filter(r => r.type === 'organization').length > 0 && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/30 border-b border-t">
                  Organizations
                </div>
                {results.filter(r => r.type === 'organization').map(r => {
                  const Icon = r.data.org_type === 'vendor' ? Truck : Building2;
                  return (
                    <button key={r.id} onClick={() => pick(r)}
                      className="flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <Icon className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{r.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.sub}</p>
                      </div>
                      <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 shrink-0', r.tagColor)}>
                        {r.tag}
                      </span>
                    </button>
                  );
                })}
              </>
            )}

            <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground/60 text-center">
              Searching contacts, organizations · type at least 2 characters
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ContactSearchBar;
