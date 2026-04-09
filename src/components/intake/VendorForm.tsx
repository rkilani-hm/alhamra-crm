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

const VENDOR_TYPES = ['Maintenance', 'Cleaning', 'Security', 'IT', 'Construction', 'Catering', 'Logistics', 'Consulting', 'Other'];

const schema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  contact_person: z.string().min(1, 'Contact person is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().optional().or(z.literal('')),
  vendor_type: z.string().optional(),
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

const VendorForm = ({ departments, categories, userId, onCreated }: Props) => {
  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { priority: 'normal' },
  });

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
        .insert({
          name: `${values.company_name} — ${values.contact_person}`,
          phone: values.phone,
          email: values.email || null,
          source: 'visit' as const,
        })
        .select('id')
        .single();
      if (error) { toast.error('Failed to create contact'); return; }
      contactId = newContact.id;
    }

    const dept = departments.find(d => d.id === values.department_id);
    const { error } = await supabase.from('cases').insert({
      contact_id: contactId,
      channel: 'visit',
      subject: values.subject,
      priority: values.priority,
      status: 'new',
      department_id: values.department_id,
      created_by: userId,
      notes: [values.vendor_type && `Vendor type: ${values.vendor_type}`, values.notes].filter(Boolean).join('\n'),
    });
    if (error) { toast.error('Failed to create case'); return; }

    toast.success(`Case created and assigned to ${dept?.name}`);
    reset({ priority: 'normal' });
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vendor Information</p>
        <div className="space-y-1">
          <Label>Company name *</Label>
          <Input {...register('company_name')} />
          {errors.company_name && <p className="text-xs text-destructive">{errors.company_name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Contact person *</Label>
            <Input {...register('contact_person')} />
            {errors.contact_person && <p className="text-xs text-destructive">{errors.contact_person.message}</p>}
          </div>
          <div className="space-y-1">
            <Label>Phone *</Label>
            <Input {...register('phone')} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" {...register('email')} />
          </div>
          <div className="space-y-1">
            <Label>Vendor type</Label>
            <Controller name="vendor_type" control={control} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {VENDOR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>
        </div>
      </div>

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

export default VendorForm;
