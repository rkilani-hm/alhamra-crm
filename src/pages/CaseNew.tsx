import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Department, CaseCategory } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Building2, Truck, UserCheck, ArrowLeft } from 'lucide-react';
import LeasingForm from '@/components/intake/LeasingForm';
import VendorForm from '@/components/intake/VendorForm';
import VisitorForm from '@/components/intake/VisitorForm';

type IntakeType = 'leasing' | 'vendor' | 'visitor';

const TYPE_CARDS: { type: IntakeType; label: string; icon: typeof Building2; activeClass: string }[] = [
  { type: 'leasing', label: 'Leasing', icon: Building2, activeClass: 'border-blue-400 bg-blue-50 text-blue-700' },
  { type: 'vendor', label: 'Vendor', icon: Truck, activeClass: 'border-amber-400 bg-amber-50 text-amber-700' },
  { type: 'visitor', label: 'Visitor', icon: UserCheck, activeClass: 'border-green-400 bg-green-50 text-green-700' },
];

const CaseNew = () => {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<IntakeType | null>(null);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery<CaseCategory[]>({
    queryKey: ['case-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('case_categories').select('*').order('sort_order').order('name');
      return data ?? [];
    },
  });

  const handleCreated = () => setSelectedType(null);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold">New Case</h1>
        <p className="text-sm text-muted-foreground mt-1">Select the inquiry type to begin</p>
      </div>

      {!selectedType ? (
        <div className="grid grid-cols-3 gap-4">
          {TYPE_CARDS.map(({ type, label, icon: Icon, activeClass }) => (
            <Card
              key={type}
              className={cn(
                'cursor-pointer border-2 p-6 text-center transition-all hover:shadow-md',
                'border-border hover:border-muted-foreground/30'
              )}
              onClick={() => setSelectedType(type)}
            >
              <div className={cn('mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl', activeClass)}>
                <Icon className="h-6 w-6" />
              </div>
              <p className="font-serif text-lg font-semibold">{label}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {type === 'leasing' && 'Lease inquiries & tenant services'}
                {type === 'vendor' && 'Vendor registration & proposals'}
                {type === 'visitor' && 'Walk-ins, meetings & deliveries'}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 gap-1 text-muted-foreground"
            onClick={() => setSelectedType(null)}
          >
            <ArrowLeft className="h-4 w-4" /> Change type
          </Button>

          {selectedType === 'leasing' && (
            <LeasingForm
              departments={departments}
              categories={categories.filter(c => c.inquiry_type === 'leasing')}
              userId={user?.id}
              onCreated={handleCreated}
            />
          )}
          {selectedType === 'vendor' && (
            <VendorForm
              departments={departments}
              categories={categories.filter(c => c.inquiry_type === 'vendor')}
              userId={user?.id}
              onCreated={handleCreated}
            />
          )}
          {selectedType === 'visitor' && (
            <VisitorForm
              departments={departments}
              categories={categories.filter(c => c.inquiry_type === 'visitor')}
              userId={user?.id}
              onCreated={handleCreated}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default CaseNew;
