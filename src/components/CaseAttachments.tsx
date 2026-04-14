// CaseAttachments — file upload + list for a case
import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { CaseAttachment } from '@/types';
import { toast } from 'sonner';
import { Paperclip, Upload, Trash2, FileText, Image, File, Loader2, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

const MIME_ICON = (mime: string | null) => {
  if (!mime) return File;
  if (mime.startsWith('image/')) return Image;
  if (mime.includes('pdf') || mime.includes('word') || mime.includes('text')) return FileText;
  return File;
};

const fmtSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

interface Props { caseId: string; }

const CaseAttachments = ({ caseId }: Props) => {
  const { user, profile } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [] } = useQuery<CaseAttachment[]>({
    queryKey: ['attachments', caseId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('case_attachments').select('*, profiles(full_name)')
        .eq('case_id', caseId).order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const handleUpload = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) { toast.error('File must be under 20 MB'); return; }
    setUploading(true);
    try {
      const ext  = file.name.split('.').pop() ?? 'bin';
      const path = `cases/${caseId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

      const { error: upErr } = await supabase.storage
        .from('case-attachments').upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from('case-attachments').getPublicUrl(path);

      const { error: dbErr } = await (supabase as any).from('case_attachments').insert({
        case_id:     caseId,
        file_name:   file.name,
        file_url:    publicUrl,
        file_size:   file.size,
        mime_type:   file.type || null,
        uploaded_by: user?.id,
      });
      if (dbErr) throw dbErr;

      qc.invalidateQueries({ queryKey: ['attachments', caseId] });
      toast.success('File attached');
    } catch (e: any) {
      toast.error('Upload failed: ' + (e.message ?? 'Unknown error'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = useMutation({
    mutationFn: async (a: CaseAttachment) => {
      // Extract storage path from URL
      const urlPath = new URL(a.file_url).pathname.split('/object/public/case-attachments/')[1];
      if (urlPath) await supabase.storage.from('case-attachments').remove([urlPath]);
      const { error } = await (supabase as any).from('case_attachments').delete().eq('id', a.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attachments', caseId] });
      toast.success('Attachment removed');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const canDelete = (a: CaseAttachment) =>
    profile?.role === 'manager' || a.uploaded_by === user?.id;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Paperclip className="h-3 w-3" /> Attachments {attachments.length > 0 && `(${attachments.length})`}
        </p>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          {uploading ? 'Uploading…' : 'Attach file'}
        </button>
        <input ref={fileRef} type="file" className="hidden" accept="*/*"
          onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
      </div>

      {/* Drop zone when empty */}
      {attachments.length === 0 && (
        <div
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/20 py-6 cursor-pointer hover:border-primary/40 hover:bg-muted/20 transition-all"
        >
          <Paperclip className="h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">Drop files here or click to attach</p>
          <p className="text-[10px] text-muted-foreground/60">Max 20 MB per file</p>
        </div>
      )}

      {/* File list */}
      {attachments.map(a => {
        const Icon = MIME_ICON(a.mime_type);
        const isImage = a.mime_type?.startsWith('image/');
        return (
          <div key={a.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 hover:bg-muted/20 group transition-colors">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted overflow-hidden">
              {isImage
                ? <img src={a.file_url} alt={a.file_name} className="h-full w-full object-cover" />
                : <Icon className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{a.file_name}</p>
              <p className="text-[10px] text-muted-foreground">
                {fmtSize(a.file_size)}
                {a.profiles?.full_name && ` · ${a.profiles.full_name}`}
                {' · ' + formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
              </p>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <a href={a.file_url} target="_blank" rel="noreferrer" download={a.file_name}
                className="p-1.5 rounded hover:bg-muted transition-colors">
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
              </a>
              {canDelete(a) && (
                <button onClick={() => remove.mutate(a)} disabled={remove.isPending}
                  className="p-1.5 rounded hover:bg-red-50 transition-colors">
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CaseAttachments;
