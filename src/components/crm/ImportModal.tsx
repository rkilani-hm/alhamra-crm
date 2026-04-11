// ImportModal — Excel import for Organizations and/or Contacts.
// Uses SheetJS (xlsx) loaded from CDN to parse the Excel file client-side.
// Validates, previews rows, then batch-inserts to Supabase.

import { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Download, Loader2, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type ImportMode = 'organizations' | 'contacts';

interface OrgRow { name: string; name_arabic?: string; sap_bp_number?: string; type?: string; industry?: string; phone?: string; email?: string; website?: string; address?: string; city?: string; }
interface ContactRow { name: string; phone: string; email?: string; job_title?: string; org_name?: string; sap_bp_number?: string; client_type?: string; source?: string; id_number?: string; }
type ParsedRow = (OrgRow | ContactRow) & { _error?: string; _row?: number };

const TEMPLATE_URL = '/alhamra-import-template.xlsx';

// ── Load SheetJS dynamically ──────────────────────────────────
let XLSXLib: any = null;
const loadXLSX = () => new Promise<any>((resolve, reject) => {
  if (XLSXLib) { resolve(XLSXLib); return; }
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  s.onload = () => { XLSXLib = (window as any).XLSX; resolve(XLSXLib); };
  s.onerror = () => reject(new Error('Could not load SheetJS'));
  document.head.appendChild(s);
});

// ── Column maps ───────────────────────────────────────────────
const ORG_COL_MAP: Record<string, keyof OrgRow> = {
  'name (english)': 'name', 'name': 'name',
  'name (arabic)': 'name_arabic', 'arabic': 'name_arabic', 'name_arabic': 'name_arabic',
  'sap bp number': 'sap_bp_number', 'sap': 'sap_bp_number', 'bp': 'sap_bp_number',
  'type': 'type',
  'industry': 'industry',
  'phone': 'phone',
  'email': 'email',
  'website': 'website',
  'address': 'address',
  'city': 'city',
};

const CONTACT_COL_MAP: Record<string, keyof ContactRow> = {
  'full name': 'name', 'name': 'name',
  'phone': 'phone',
  'email': 'email',
  'job title': 'job_title', 'title': 'job_title', 'position': 'job_title',
  'organization name': 'org_name', 'organization': 'org_name', 'company': 'org_name',
  'sap bp number': 'sap_bp_number', 'sap': 'sap_bp_number',
  'client type': 'client_type', 'type': 'client_type',
  'source': 'source',
  'id number': 'id_number', 'civil id': 'id_number',
};

function parseSheet(XLSX: any, wb: any, sheetName: string, colMap: Record<string, string>): ParsedRow[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const raw: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw.length < 2) return [];

  // Find header row (skip title/note rows)
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const row = raw[i] as string[];
    const lower = row.map((c: string) => String(c).toLowerCase().trim());
    if (lower.some(c => c.includes('name') || c === 'phone' || c === 'type')) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (raw[headerRowIdx] as string[]).map((h: string) =>
    String(h).toLowerCase().replace(/\s*\n\s*/g, ' ').replace(/\s*\(.*?\)/g, '').trim()
  );

  const results: ParsedRow[] = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const rawRow = raw[i] as any[];
    const isEmpty = rawRow.every((c: any) => !c || String(c).trim() === '');
    if (isEmpty) continue;

    // Skip instruction/note rows
    const firstCell = String(rawRow[0] ?? '').trim();
    if (firstCell.startsWith('⚠') || firstCell.startsWith('Required') || firstCell.startsWith('Optional')) continue;

    const obj: any = { _row: i + 1 };
    headers.forEach((h: string, colIdx: number) => {
      const fieldName = colMap[h] || colMap[h.split('\n')[0].trim()];
      if (fieldName) obj[fieldName] = String(rawRow[colIdx] ?? '').trim();
    });
    results.push(obj as ParsedRow);
  }
  return results;
}

// ── Main component ────────────────────────────────────────────
interface Props {
  open:  boolean;
  onClose: () => void;
  mode: ImportMode;
}

const ImportModal = ({ open, onClose, mode }: Props) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]           = useState<'upload' | 'preview' | 'done'>('upload');
  const [rows, setRows]           = useState<ParsedRow[]>([]);
  const [errors, setErrors]       = useState<ParsedRow[]>([]);
  const [fileName, setFileName]   = useState('');
  const [parsing, setParsing]     = useState(false);
  const [imported, setImported]   = useState(0);

  const isOrg = mode === 'organizations';

  const handleClose = () => {
    setStep('upload'); setRows([]); setErrors([]); setFileName(''); setImported(0);
    onClose();
  };

  // ── Parse uploaded file ────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    try {
      const XLSX = await loadXLSX();
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf, { type: 'array' });

      const sheetName = isOrg
        ? wb.SheetNames.find((n: string) => n.toLowerCase().includes('org')) ?? wb.SheetNames[0]
        : wb.SheetNames.find((n: string) => n.toLowerCase().includes('cont')) ?? wb.SheetNames[0];

      const parsed = parseSheet(XLSX, wb, sheetName, isOrg ? ORG_COL_MAP : CONTACT_COL_MAP) as ParsedRow[];

      // Validate
      const valid: ParsedRow[] = [];
      const invalid: ParsedRow[] = [];
      parsed.forEach(r => {
        if (isOrg) {
          const o = r as OrgRow & { _row?: number };
          if (!o.name || o.name.trim() === '') {
            invalid.push({ ...r, _error: 'Name (English) is required' });
          } else {
            valid.push(r);
          }
        } else {
          const c = r as ContactRow & { _row?: number };
          if (!c.name || c.name.trim() === '') {
            invalid.push({ ...r, _error: 'Full Name is required' });
          } else if (!c.phone || c.phone.trim() === '') {
            invalid.push({ ...r, _error: 'Phone is required' });
          } else {
            valid.push(r);
          }
        }
      });

      setRows(valid);
      setErrors(invalid);
      setStep('preview');
    } catch (e: any) {
      toast.error('Could not parse file: ' + e.message);
    } finally {
      setParsing(false);
    }
  }, [isOrg]);

  // ── Insert to Supabase ─────────────────────────────────────
  const importMutation = useMutation({
    mutationFn: async () => {
      if (isOrg) {
        // Insert organizations
        const orgData = (rows as OrgRow[]).map(r => ({
          name:          r.name.trim(),
          name_arabic:   r.name_arabic || null,
          sap_bp_number: r.sap_bp_number || null,
          type:          (['tenant','vendor','partner','prospect','other'].includes(r.type?.toLowerCase() ?? ''))
                           ? r.type!.toLowerCase() : 'tenant',
          industry:      r.industry || null,
          phone:         r.phone || null,
          email:         r.email || null,
          website:       r.website || null,
          address:       r.address || null,
          city:          r.city || null,
        }));

        // Insert in batches of 50
        let count = 0;
        for (let i = 0; i < orgData.length; i += 50) {
          const batch = orgData.slice(i, i + 50);
          const { error } = await (supabase as any).from('organizations').insert(batch);
          if (error) throw new Error(`Batch ${Math.floor(i/50)+1}: ${error.message}`);
          count += batch.length;
        }
        return count;
      } else {
        // Build org lookup maps
        const { data: orgs } = await (supabase as any)
          .from('organizations').select('id, name, sap_bp_number');
        const orgByName: Record<string, string> = {};
        const orgBySap:  Record<string, string> = {};
        (orgs ?? []).forEach((o: any) => {
          if (o.name) orgByName[o.name.toLowerCase().trim()] = o.id;
          if (o.sap_bp_number) orgBySap[o.sap_bp_number.trim()] = o.id;
        });

        const contactData = (rows as ContactRow[]).map(r => {
          let orgId: string | null = null;
          if (r.sap_bp_number) orgId = orgBySap[r.sap_bp_number.trim()] ?? null;
          if (!orgId && r.org_name) orgId = orgByName[r.org_name.toLowerCase().trim()] ?? null;

          const validTypes = ['existing_tenant','potential','vendor','visitor'];
          const validSources = ['call','visit','web','whatsapp'];

          return {
            name:            r.name.trim(),
            phone:           r.phone.trim() || null,
            email:           r.email || null,
            job_title:       r.job_title || null,
            organization_id: orgId,
            client_type:     validTypes.includes(r.client_type?.toLowerCase() ?? '') ? r.client_type!.toLowerCase() : 'potential',
            source:          validSources.includes(r.source?.toLowerCase() ?? '') ? r.source!.toLowerCase() : 'call',
            id_number:       r.id_number || null,
          };
        });

        let count = 0;
        for (let i = 0; i < contactData.length; i += 50) {
          const batch = contactData.slice(i, i + 50);
          const { error } = await (supabase as any).from('contacts').insert(batch);
          if (error) throw new Error(`Batch ${Math.floor(i/50)+1}: ${error.message}`);
          count += batch.length;
        }
        return count;
      }
    },
    onSuccess: (count) => {
      setImported(count as number);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['organizations'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (e: any) => toast.error('Import failed: ' + e.message),
  });

  // ── Drag & drop ────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Preview columns ────────────────────────────────────────
  const orgPreviewCols  = ['name', 'name_arabic', 'sap_bp_number', 'type', 'phone'];
  const contPreviewCols = ['name', 'phone', 'email', 'job_title', 'org_name', 'client_type'];
  const previewCols = isOrg ? orgPreviewCols : contPreviewCols;
  const previewLabels = isOrg
    ? ['Name', 'Arabic Name', 'SAP BP', 'Type', 'Phone']
    : ['Name', 'Phone', 'Email', 'Job Title', 'Organization', 'Type'];

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b bg-card shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <DialogTitle className="text-base">
              Import {isOrg ? 'Organizations' : 'Contacts'} from Excel
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {step === 'upload' ? 'Upload your Excel file or download the template below'
                : step === 'preview' ? `${rows.length} valid rows ready to import${errors.length > 0 ? `, ${errors.length} with errors` : ''}`
                : `Successfully imported ${imported} ${isOrg ? 'organizations' : 'contacts'}`}
            </p>
          </div>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2 px-6 py-3 border-b shrink-0">
          {(['upload','preview','done'] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn('flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors',
                step === s ? 'bg-primary text-primary-foreground'
                  : (step === 'preview' && s === 'upload') || step === 'done' ? 'bg-green-500 text-white'
                  : 'bg-muted text-muted-foreground')}>
                {(step === 'preview' && s === 'upload') || (step === 'done' && s !== 'done') ? '✓' : i + 1}
              </div>
              <span className={cn('text-xs font-medium capitalize', step === s ? 'text-foreground' : 'text-muted-foreground')}>
                {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview' : 'Done'}
              </span>
              {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">

          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Download template */}
              <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Download the template first</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Fill in your {isOrg ? 'organizations' : 'contacts'} data following the format
                  </p>
                </div>
                <a href="/alhamra-import-template.xlsx" download>
                  <Button variant="outline" size="sm" className="gap-2 shrink-0">
                    <Download className="h-3.5 w-3.5" /> Template
                  </Button>
                </a>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                className={cn(
                  'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all py-12',
                  dragOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/20'
                )}
              >
                {parsing ? (
                  <><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Parsing file…</p></>
                ) : (
                  <>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop your Excel file here</p>
                      <p className="text-xs text-muted-foreground mt-1">or click to browse · .xlsx, .xls files</p>
                    </div>
                  </>
                )}
              </div>

              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

              {/* Column guide */}
              <div className="rounded-lg border bg-card p-4 text-xs space-y-2">
                <p className="font-semibold text-muted-foreground uppercase tracking-wide">Expected columns ({isOrg ? 'Organizations' : 'Contacts'} sheet)</p>
                <div className="grid grid-cols-2 gap-1">
                  {isOrg ? [
                    ['Name (English)', 'Required'], ['Name (Arabic)', 'Optional'],
                    ['SAP BP Number', 'Optional'], ['Type', 'Optional'],
                    ['Industry', 'Optional'], ['Phone', 'Optional'],
                    ['Email', 'Optional'], ['Address', 'Optional'],
                  ] : [
                    ['Full Name', 'Required'], ['Phone', 'Required'],
                    ['Email', 'Optional'], ['Job Title', 'Optional'],
                    ['Organization Name', 'Optional'], ['SAP BP Number', 'Optional'],
                    ['Client Type', 'Optional'], ['Source', 'Optional'],
                  ].map(([col, req]) => (
                    <div key={col} className="flex items-center justify-between px-2 py-1 rounded bg-muted/40">
                      <span className="font-medium">{col}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                        req === 'Required' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground')}>
                        {req}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{fileName}</span>
              </div>

              {/* Error rows */}
              {errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                  <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> {errors.length} rows will be skipped (errors)
                  </p>
                  {errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-700">Row {(e as any)._row}: {(e as any)._error}</p>
                  ))}
                </div>
              )}

              {/* Valid rows table */}
              {rows.length > 0 ? (
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                    {rows.length} rows to import
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">#</th>
                          {previewLabels.map(l => (
                            <th key={l} className="px-3 py-2 text-left text-muted-foreground font-medium">{l}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {rows.slice(0, 100).map((r, i) => (
                          <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/10'}>
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            {previewCols.map(col => (
                              <td key={col} className="px-3 py-2 max-w-[140px] truncate">
                                {(r as any)[col] || <span className="text-muted-foreground/40">—</span>}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {rows.length > 100 && (
                          <tr>
                            <td colSpan={previewCols.length + 1} className="px-3 py-2 text-center text-xs text-muted-foreground">
                              … and {rows.length - 100} more rows
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                  <p className="text-sm text-amber-800 font-medium">No valid rows found</p>
                  <p className="text-xs text-amber-700 mt-1">Check that your file uses the correct template and required fields are filled in</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Done */}
          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">Import complete!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {imported} {isOrg ? 'organizations' : 'contacts'} imported successfully
                </p>
                {errors.length > 0 && (
                  <p className="text-xs text-amber-700 mt-2">{errors.length} rows were skipped due to errors</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t px-6 py-4 shrink-0 bg-card">
          <div>
            {step === 'preview' && (
              <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setRows([]); setErrors([]); }}>
                ← Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {step === 'done' ? 'Close' : 'Cancel'}
            </Button>
            {step === 'preview' && rows.length > 0 && (
              <Button size="sm" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}
                className="gap-2">
                {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {importMutation.isPending ? 'Importing…' : `Import ${rows.length} rows`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ImportModal;
