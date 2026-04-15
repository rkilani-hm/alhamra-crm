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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import ContactSearchBar, { SelectedContact } from './ContactSearchBar';

const schema = z.object({
  phone:           z.string().optional(),
  name:            z.string().min(1, 'Name is required'),
  email:           z.string().email().optional().or(z.literal('')),
  unit:            z.string().optional(),
  floor:           z.string().optional(),
  contract_number: z.string().optional(),
  subject:         z.string().min(1, 'Subject is required'),
  department_id:   z.string().min(1, 'Department is required'),
  priority:        z.enum(['low', 'normal', 'urgent']),
  notes:           z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  departments: Department[];
  categories:  CaseCategory[];
  userId?:     string;
  onCreated:   () => void;
}

const PRIORITIES = [
  { value: 'low',    label: 'Low'    },
  { value: 'normal', label: 'Normal' },
  { value: 'urgent', label: 'Urgent' },
] as const;

const LeasingForm = ({ departments, categories, userId, onCreated }: Props) => {
  const [selected, setSelected] = useState<SelectedContact | null>(null);

  const { register, handleSubmit, control, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'normal' },
  });

  const handleSelect = (c: SelectedContact) => {
    setSelected(c);
    setValue('name',  c.name);
    setValue('phone', c.phone ?? '');
    setValue('email', c.email ?? '');
    // Org-level lease data
    if (c.type === 'organization') {
      setValue('contract_number', c.contract_number ?? '');
    }
  };

  const handleClear = () => {
    setSelected(null);
    setValue('name',            '');
    setValue('phone',           '');
    setValue('email',           '');
    setValue('unit',            '');
    setValue('floor',           '');
    setValue('contract_number', '');
  };

  const onSubmit = async (values: FormData) => {
    let contactId: string | undefined;

    // Use selected contact directly if it's a contact record
    if (selected?.type === 'contact') {
      contactId = selected.id;
    } else {
      // Look up or create contact
      if (values.phone) {
        const { data: existing } = await supabase
          .from('contacts').select('id').eq('phone', values.phone).maybeSingle();
        contactId = existing?.id;
      }
      if (!contactId) {
        const { data: nc, error } = await supabase
          .from('contacts')
          .insert({
            name:   values.name,
            phone:  values.phone || null,
            email:  values.email  || null,
            source: 'call' as const,
            // Link to org if selected
            ...(selected?.type === 'organization' ? { organization_id: selected.id } : {}),
          })
          .select('id').single();
        if (error) { toast.error('Failed to create contact'); return; }
        contactId = nc.id;
      }
    }

    const dept = departments.find(d => d.id === values.department_id);
    const { error } = await supabase.from('cases').insert({
      contact_id:    contactId,
      channel:       'call',
      subject:       values.subject,
      priority:      values.priority,
      status:        'new',
      department_id: values.department_id,
      created_by:    userId,
      inquiry_type:  'leasing',
      notes:         values.notes || null,
    });
    if (error) { toast.error('Failed to create case'); return; }

    toast.success(`Case created and assigned to ${dept?.name}`);
    reset({ priority: 'normal' });
    setSelected(null);
    onCreated();
  };

  const isLocked = selected !== null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

      {/* Global client search */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Client Lookup
        </p>
        <ContactSearchBar
          onSelect={handleSelect}
          onClear={handleClear}
          selected={selected}
          placeholder="Search client by name, phone, email, SAP BP, Arabic name…"
        />
        {!selected && (
          <p className="text-[11px] text-muted-foreground">
            Search from CRM master data — contacts, tenants, vendors. Or fill in below to create new.
          </p>
        )}
      </div>

      {/* Contact details */}
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact Details</p>
        <div className="space-y-1">
          <Label>Full name *</Label>
          <Input {...register('name')} readOnly={isLocked} className={cn(isLocked && 'bg-muted')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input {...register('phone')} readOnly={isLocked} className={cn(isLocked && 'bg-muted')} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" {...register('email')} readOnly={isLocked} className={cn(isLocked && 'bg-muted')} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Unit</Label>
            <Input {...register('unit')} />
          </div>
          <div className="space-y-1">
            <Label>Floor</Label>
            <Input {...register('floor')} />
          </div>
          <div className="space-y-1">
            <Label>Contract #</Label>
            <Input {...register('contract_number')} readOnly={isLocked} className={cn(isLocked && 'bg-muted')} />
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
