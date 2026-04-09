import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { supabase } from '@/lib/supabase';
import { Department, CaseCategory } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, Building2 } from 'lucide-react';

const schema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email().optional().or(z.literal('')),
  unit: z.string().optional(),
  floor: z.string().optional(),
  contract_number: z.string().optional(),
  subject: z.string().min(1, 'Subject is required'),
  department_id: z.string().min(1, 'Department is required'),
  priority: z.enum(['low', 'normal', 'urgent']),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  departments: Department[];
  categories: CaseCategory[];
  userId?: string;
  onCreated: () => void;
}

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
] as const;

const LeasingForm = ({ departments, categories, userId, onCreated }: Props) => {
  const [sapLoading, setSapLoading] = useState(false);
  const [sapResult, setSapResult] = useState<any>(null);
  const [clientType, setClientType] = useState<'existing' | 'potential' | null>(null);

  const { register, handleSubmit, control, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'normal' },
  });

  const searchSap = async (phone: string) => {
    if (!phone) return;
    setSapLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('sap-client-search', {
        body: { phone },
      });
      if (error || !data?.found) {
        setSapResult(null);
        setClientType('potential');
      } else {
        setSapResult(data.client);
        setClientType('existing');
        setValue('name', data.client.name);
        setValue('unit', data.client.unit);
        setValue('floor', data.client.floor);
        setValue('contract_number', data.client.contract_number);
      }
    } catch {
      setSapResult(null);
      setClientType('potential');
    }
    setSapLoading(false);
  };

  const onSubmit = async (values: FormData) => {
    let contactId: string | undefined;
    const { data: existing } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone', values.phone)
      .maybeSingle();
    contactId = existing?.id;

    if (!contactId) {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: values.name, phone: values.phone, email: values.email || null, source: 'call' as const })
        .select('id')
        .single();
      if (error) { toast.error('Failed to create contact'); return; }
      contactId = newContact.id;
    }

    const dept = departments.find(d => d.id === values.department_id);
    const { error } = await supabase.from('cases').insert({
      contact_id: contactId,
      channel: 'call',
      subject: values.subject,
      priority: values.priority,
      status: 'new',
      department_id: values.department_id,
      created_by: userId,
      notes: values.notes || null,
    });
    if (error) { toast.error('Failed to create case'); return; }

    toast.success(`Case created and assigned to ${dept?.name}`);
    reset({ priority: 'normal' });
    setSapResult(null);
    setClientType(null);
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* SAP Search */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Client Lookup</p>
          {clientType && (
            <Badge variant={clientType === 'existing' ? 'default' : 'secondary'}>
              {clientType === 'existing' ? 'Existing tenant' : 'Potential client'}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <Input placeholder="+971 50 000 0000" {...register('phone')} />
            {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
          </div>
          <Button type="button" variant="outline" className="gap-1.5" disabled={sapLoading} onClick={() => {
            const phone = (document.querySelector('input[name="phone"]') as HTMLInputElement)?.value;
            searchSap(phone);
          }}>
            <Search className="h-4 w-4" /> {sapLoading ? 'Searching…' : 'Search SAP'}
          </Button>
        </div>

        {sapResult && (
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-brand-bronze" /> {sapResult.name}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <span>Unit: {sapResult.unit}</span>
              <span>Floor: {sapResult.floor}</span>
              <span>Contract: {sapResult.contract_number}</span>
              <span>Status: {sapResult.status}</span>
            </div>
          </div>
        )}

        {clientType === 'potential' && (
          <div className="rounded-lg border-2 border-dashed border-muted p-3 text-center">
            <p className="text-xs text-muted-foreground">No SAP record — registering as potential client</p>
          </div>
        )}
      </div>

      {/* Contact details */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Details</p>
        <div className="space-y-1">
          <Label>Full name *</Label>
          <Input {...register('name')} readOnly={clientType === 'existing'} className={cn(clientType === 'existing' && 'bg-muted')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
          </div>
          <div className="space-y-1">
            <Label>Unit</Label>
            <Input {...register('unit')} readOnly={clientType === 'existing'} className={cn(clientType === 'existing' && 'bg-muted')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Floor</Label>
            <Input {...register('floor')} readOnly={clientType === 'existing'} className={cn(clientType === 'existing' && 'bg-muted')} />
          </div>
          <div className="space-y-1">
            <Label>Contract number</Label>
            <Input {...register('contract_number')} readOnly={clientType === 'existing'} className={cn(clientType === 'existing' && 'bg-muted')} />
          </div>
        </div>
      </div>

      {/* Case details */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case Details</p>
        <div className="space-y-1">
          <Label>Subject *</Label>
          <Controller name="subject" control={control} render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
          {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Department *</Label>
          <Controller name="department_id" control={control} render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
          {errors.department_id && <p className="text-xs text-destructive">{errors.department_id.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Priority</Label>
          <Controller name="priority" control={control} render={({ field }) => (
            <div className="flex gap-2">
              {PRIORITIES.map(({ value, label }) => (
                <button key={value} type="button" onClick={() => field.onChange(value)} className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  field.value === value
                    ? value === 'urgent' ? 'border-destructive bg-destructive text-destructive-foreground' : 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent'
                )}>{label}</button>
              ))}
            </div>
          )} />
        </div>
        <div className="space-y-1">
          <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
          <Textarea rows={3} {...register('notes')} />
        </div>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
        {isSubmitting ? 'Creating…' : 'Create Case & Assign →'}
      </Button>
    </form>
  );
};

export default LeasingForm;
