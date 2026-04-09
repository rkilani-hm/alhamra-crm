import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Phone, User2, Globe, PhoneIncoming } from 'lucide-react';
import { Department } from '@/types';

const SUBJECTS = [
  'General Inquiry', 'Sales Request', 'Technical Issue',
  'Complaint', 'Quotation Request', 'Other',
];

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  channel: z.enum(['call', 'visit', 'web']),
  subject: z.string().min(1, 'Subject is required'),
  department_id: z.string().min(1, 'Department is required'),
  priority: z.enum(['low', 'normal', 'urgent']),
  notes: z.string().optional(),
}).refine(d => d.phone || d.email, {
  message: 'Phone or email is required',
  path: ['phone'],
});

type FormData = z.infer<typeof schema>;

const CHANNELS = [
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'visit', label: 'Visit', icon: User2 },
  { value: 'web', label: 'Web Form', icon: Globe },
] as const;

const PRIORITIES = [
  { value: 'low', label: 'Low', className: 'border-border text-muted-foreground' },
  { value: 'normal', label: 'Normal', className: 'border-border text-foreground' },
  { value: 'urgent', label: 'Urgent', className: 'border-destructive text-destructive' },
] as const;

const CaseNew = () => {
  const { user } = useAuth();

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  const { register, handleSubmit, control, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { channel: 'call', priority: 'normal' },
  });

  const onSubmit = async (values: FormData) => {
    // Find or create contact
    let contactId: string;
    if (values.phone) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', values.phone)
        .maybeSingle();
      contactId = existing?.id ?? '';
    }

    if (!contactId!) {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({ name: values.name, phone: values.phone || null, email: values.email || null, source: values.channel })
        .select('id')
        .single();
      if (error) { toast.error('Failed to create contact'); return; }
      contactId = newContact.id;
    }

    // Create case
    const dept = departments.find(d => d.id === values.department_id);
    const { error: caseError } = await supabase.from('cases').insert({
      contact_id: contactId,
      channel: values.channel,
      subject: values.subject,
      priority: values.priority,
      status: 'new',
      department_id: values.department_id,
      created_by: user?.id,
      notes: values.notes || null,
    });

    if (caseError) { toast.error('Failed to create case'); return; }

    toast.success(`Case created and assigned to ${dept?.name}`);
    reset({ channel: 'call', priority: 'normal' });
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <PhoneIncoming className="h-5 w-5" /> New Case
        </h2>
        <p className="text-sm text-muted-foreground">Log a call, visit, or web inquiry</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        {/* Contact */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</p>
          <div className="space-y-1">
            <Label>Full name *</Label>
            <Input autoFocus placeholder="John Smith" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input placeholder="+971 50 000 0000" {...register('phone')} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" placeholder="john@example.com" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* Case details */}
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case details</p>

          {/* Channel */}
          <div className="space-y-1">
            <Label>Channel *</Label>
            <Controller name="channel" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {CHANNELS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => field.onChange(value)}
                    className={cn(
                      'flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      field.value === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border text-muted-foreground hover:bg-accent'
                    )}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </button>
                ))}
              </div>
            )} />
          </div>

          {/* Subject */}
          <div className="space-y-1">
            <Label>Subject *</Label>
            <Controller name="subject" control={control} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Select inquiry type" />
                </SelectTrigger>
                <SelectContent>
                  {SUBJECTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>

          {/* Department */}
          <div className="space-y-1">
            <Label>Assign to department *</Label>
            <Controller name="department_id" control={control} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
            {errors.department_id && <p className="text-xs text-destructive">{errors.department_id.message}</p>}
          </div>

          {/* Priority */}
          <div className="space-y-1">
            <Label>Priority</Label>
            <Controller name="priority" control={control} render={({ field }) => (
              <div className="flex gap-2">
                {PRIORITIES.map(({ value, label, className }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => field.onChange(value)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      field.value === value
                        ? value === 'urgent'
                          ? 'border-destructive bg-destructive text-destructive-foreground'
                          : 'border-primary bg-primary text-primary-foreground'
                        : className + ' hover:bg-accent'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )} />
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea rows={3} placeholder="Any additional details…" {...register('notes')} />
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create Case & Assign →'}
        </Button>
      </form>
    </div>
  );
};

export default CaseNew;
