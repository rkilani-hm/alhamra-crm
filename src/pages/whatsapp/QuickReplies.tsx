// QuickReplies — pre-built message templates, accessed via ⚡ button or typing "/"
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Zap, Plus, Trash2, Search, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface QR { id: string; title: string; body: string; category: string; }

const CATS = ['All', 'Greeting', 'Leasing', 'Maintenance', 'Closing', 'Other'];

interface Props { onSelect: (text: string) => void; onClose: () => void; }

const QuickReplies = ({ onSelect, onClose }: Props) => {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const isManager = profile?.role === 'manager';

  const [search, setSearch]   = useState('');
  const [cat,    setCat]      = useState('All');
  const [adding, setAdding]   = useState(false);
  const [form,   setForm]     = useState({ title: '', body: '', category: 'Greeting' });

  const { data: replies = [] } = useQuery<QR[]>({
    queryKey: ['quick-replies'],
    queryFn: async () => {
      const { data } = await (supabase as any).from('quick_replies')
        .select('id,title,body,category').order('category').order('title');
      return data ?? [];
    },
  });

  const filtered = replies.filter(r =>
    (cat === 'All' || r.category === cat) &&
    (!search || r.title.toLowerCase().includes(search.toLowerCase()) || r.body.toLowerCase().includes(search.toLowerCase()))
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim() || !form.body.trim()) throw new Error('Title and body are required');
      const { error } = await (supabase as any).from('quick_replies').insert({
        title: form.title.trim(), body: form.body.trim(),
        category: form.category, created_by: profile?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quick-replies'] });
      setForm({ title: '', body: '', category: 'Greeting' });
      setAdding(false);
      toast.success('Quick reply saved');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('quick_replies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quick-replies'] }),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col" style={{ maxHeight: 380 }}>

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-amber-50/60">
        <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-xs font-semibold text-amber-800">Quick replies</span>
        <div className="ml-auto flex items-center gap-2">
          {isManager && !adding && (
            <button onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-[10px] text-amber-700 hover:text-amber-900 font-medium">
              <Plus className="h-3 w-3" /> New
            </button>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Add form */}
      {adding && (
        <div className="border-b p-3 space-y-2 bg-muted/10">
          <input value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))}
            placeholder="Short label  e.g. 'Greeting'" autoFocus
            className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 bg-background" />
          <div className="flex gap-2">
            <select value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value}))}
              className="border rounded-lg px-2 py-1.5 text-xs bg-background flex-1">
              {CATS.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <textarea value={form.body} onChange={e => setForm(p => ({...p, body: e.target.value}))}
            placeholder="Message text…" rows={3}
            className="w-full border rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-amber-400 resize-none bg-background" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAdding(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">Cancel</button>
            <button onClick={() => save.mutate()} disabled={save.isPending}
              className="flex items-center gap-1 text-xs bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-60">
              {save.isPending ? 'Saving…' : <><Check className="h-3 w-3" /> Save</>}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b">
        <Search className="h-3 w-3 text-muted-foreground shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…" autoFocus={!adding}
          className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground" />
        {search && <button onClick={() => setSearch('')}><X className="h-3 w-3 text-muted-foreground" /></button>}
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-1.5 border-b overflow-x-auto scrollbar-thin">
        {CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors',
              cat === c ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:bg-muted')}>
            {c}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y scrollbar-thin">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">
            {replies.length === 0 ? 'No quick replies yet — ask your manager to add some' : 'No matches'}
          </p>
        )}
        {filtered.map(r => (
          <button key={r.id} onClick={() => onSelect(r.body)}
            className="flex items-start gap-3 w-full px-3 py-2.5 text-left hover:bg-amber-50/60 transition-colors group">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-foreground">{r.title}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{r.body}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <span className="text-[9px] bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground">{r.category}</span>
              {isManager && (
                <button onClick={e => { e.stopPropagation(); del.mutate(r.id); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-red-50">
                  <Trash2 className="h-3 w-3 text-red-400" />
                </button>
              )}
            </div>
          </button>
        ))}
      </div>

      <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground/50 text-center">
        Click a reply to insert · Type "/" in the message box to open
      </div>
    </div>
  );
};

export default QuickReplies;
