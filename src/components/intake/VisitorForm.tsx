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

const VISIT_PURPOSES = [
  'Meeting with Tenant', 'Office Visit', 'Delivery', 'Interview',
  'Government Official', 'Inspection', 'Event', 'Other',
];

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  id_passport: z.string().optional(),
  host_name: z.string().optional(),
  company: z.string().optional(),
  purpose: z.string().min(1, 'Purpose is required'),
  subject: z.string().min(1, 'Subject is required'),
  department_id: z.string().min(1, 'Department is required'),
  notes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  departments: Department[];
  categories: CaseCategory[];
  userId?: string;
  onCreated: () => void;
}

const VisitorForm = ({ departments, categories, userId, onCreated }: Props) => {
  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormData) => {
    let contactId: string | undefined;
    if (values.phone) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', values.phone)
        .maybeSingle();
      contactId = existing?.id;
    }

    if (!contactId) {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: values.name, phone: values.phone || null, source: 'visit' as const })
        .select('id')
        .single();
      if (error) { toast.error('Failed to create contact'); return; }
      contactId = newContact.id;
    }

    const dept = departments.find(d => d.id === values.department_id);
    const noteLines = [
      values.purpose && `Purpose: ${values.purpose}`,
      values.host_name && `Host: ${values.host_name}`,
      values.id_passport && `ID/Passport: ${values.id_passport}`,
      values.company && `Company: ${values.company}`,
      values.notes,
    ].filter(Boolean).join('\n');

    const { error } = await supabase.from('cases').insert({
      contact_id: contactId,
      channel: 'visit',
      subject: values.subject,
      priority: 'low',
      status: 'new',
      department_id: values.department_id,
      created_by: userId,
      notes: noteLines || null,
    });
    if (error) { toast.error('Failed to create case'); return; }

    toast.success(`Case created and assigned to ${dept?.name}`);
    reset();
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border bg-card p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visitor Information</p>
        <div className="space-y-1">
          <Label>Full name *</Label>
          <Input {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input {...register('phone')} />
          </div>
          <div className="space-y-1">
            <Label>ID / Passport number</Label>
            <Input {...register('id_passport')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Host name</Label>
            <Input {...register('host_name')} />
          </div>
          <div className="space-y-1">
            <Label>Company</Label>
            <Input {...register('company')} />
          </div>
        </div>
        <div className="space-y-1">
          <Label>Purpose of visit *</Label>
          <Controller name="purpose" control={control} render={({ field }) => (
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
              <SelectContent>
                {VISIT_PURPOSES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )} />
          {errors.purpose && <p className="text-xs text-destructive">{errors.purpose.message}</p>}
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

export default VisitorForm;
