import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { Button } from '../components/Button';
import { Field, TextInput } from '../components/Field';
import { LabelCard } from '../components/LabelCard';
import { PageHeader, Surface } from '../components/Page';
import { getSettings, listInventory } from '../lib/supabase/api';
import { useOrg } from '../lib/org/OrgProvider';

export function LabelsScreen() {
  const { organization } = useOrg();
  const [search, setSearch] = useState('');
  const settingsQuery = useQuery({ queryKey: ['settings', organization.id], queryFn: () => getSettings(organization.id) });
  const inventoryQuery = useQuery({ queryKey: ['inventory', organization.id, 'labels'], queryFn: () => listInventory(organization.id) });
  const currencySymbol = settingsQuery.data?.currencySymbol || 'S$';
  const items = (inventoryQuery.data || []).filter((item) =>
    [item.itemName, item.itemNumber, item.cardNumber, item.productCategory].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="grid gap-4">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Print prep"
          title="Labels"
          description={settingsQuery.data?.labelSheetPreset || '30-up-avery-5160'}
          action={<Button className="flex shrink-0 items-center gap-2" onClick={() => window.print()}><Printer size={18} /> Print</Button>}
        />
      </div>
      <Surface className="print:hidden">
        <Field label="Filter labels">
          <TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, item number or product type" />
        </Field>
      </Surface>
      <div className="label-sheet grid min-w-0 gap-2 sm:grid-cols-2 md:grid-cols-3 print:grid-cols-3 print:gap-0">
        {items.map((item) => <LabelCard key={item.id} item={item} currencySymbol={currencySymbol} />)}
      </div>
    </div>
  );
}
