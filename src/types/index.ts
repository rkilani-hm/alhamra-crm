export type Role = 'frontdesk' | 'department' | 'manager';
export type Channel = 'call' | 'visit' | 'web' | 'whatsapp';
export type Priority = 'low' | 'normal' | 'urgent';
export type CaseStatus = 'new' | 'inprogress' | 'done';
export type InquiryType = 'leasing' | 'vendor' | 'visitor' | 'general';
export type ClientType = 'existing_tenant' | 'potential' | 'vendor' | 'visitor';

export interface Department {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
  department_id: string | null;
  created_at: string;
  departments?: Department;
}

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: Channel | null;
  client_type: ClientType | null;
  sap_bp_number: string | null;
  unit: string | null;
  floor: string | null;
  contract_number: string | null;
  company_name: string | null;
  vendor_type: string | null;
  id_number: string | null;
  host_name: string | null;
  visit_purpose: string | null;
  created_at: string;
}

export interface Case {
  id: string;
  contact_id: string;
  channel: Channel;
  subject: string;
  priority: Priority;
  status: CaseStatus;
  department_id: string;
  created_by: string;
  notes: string | null;
  due_at: string | null;
  created_at: string;
  inquiry_type: InquiryType | null;
  contacts?: Contact;
  departments?: Department;
  profiles?: Profile;
}

export interface CaseNote {
  id: string;
  case_id: string;
  author_id: string;
  body: string;
  created_at: string;
  profiles?: Profile;
}

export interface CaseCategory {
  id: string;
  name: string;
  inquiry_type: InquiryType;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface SapClient {
  bp_number: string;
  name: string;
  phone: string;
  email: string;
  unit: string;
  floor: string;
  contract_number: string;
  contract_status: 'active' | 'expired' | 'pending';
}

// ── WhatsApp / Wazzup24 ──────────────────────────────────────
export interface WaChannel {
  id: string;
  channel_id: string;
  phone: string;
  label: string | null;
  transport: string;
  state: string;
  created_at: string;
}

export interface WaConversation {
  id: string;
  channel_id: string;
  chat_id: string;
  contact_id: string | null;
  case_id: string | null;
  assigned_to: string | null;
  unread_count: number;
  last_message: string | null;
  last_message_at: string | null;
  created_at: string;
  contacts?: { id: string; name: string; phone: string | null; email: string | null } | null;
  wa_channels?: { phone: string; label: string | null } | null;
}

export interface WaMessage {
  id: string;
  wazzup_id: string | null;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  msg_type: string;
  body: string | null;
  media_url: string | null;
  sender_name: string | null;
  status: string;
  sent_at: string;
  created_at: string;
}

// ── Organizations & Activities (Pipedrive-inspired) ──────────

export type OrgType = 'tenant' | 'vendor' | 'partner' | 'prospect' | 'other';

export interface Organization {
  id:            string;
  name:          string;
  type:          OrgType;
  industry:      string | null;
  website:       string | null;
  email:         string | null;
  phone:         string | null;
  address:       string | null;
  city:          string | null;
  country:       string | null;
  sap_bp_number: string | null;
  description:   string | null;
  owner_id:      string | null;
  created_by:    string | null;
  created_at:    string;
  updated_at:    string;
  // joins
  contacts?:     Contact[];
  profiles?:     Profile;
  _count?: {
    contacts: number;
    cases:    number;
    activities: number;
  };
}

export type ActivityType = 'call' | 'meeting' | 'whatsapp' | 'email' | 'visit' | 'task' | 'note' | 'case';

export interface Activity {
  id:              string;
  type:            ActivityType;
  subject:         string;
  body:            string | null;
  organization_id: string | null;
  contact_id:      string | null;
  case_id:         string | null;
  scheduled_at:    string | null;
  duration_min:    number | null;
  done:            boolean;
  done_at:         string | null;
  outcome:         string | null;
  created_by:      string | null;
  assigned_to:     string | null;
  department_id:   string | null;
  created_at:      string;
  updated_at:      string;
  // joins
  organizations?:  { id: string; name: string } | null;
  contacts?:       { id: string; name: string; phone: string | null } | null;
  cases?:          { id: string; subject: string } | null;
  profiles?:       { id: string; full_name: string | null } | null;
  assigned?:       { id: string; full_name: string | null } | null;
  departments?:    { id: string; name: string } | null;
}

// ── Extended Organization with new fields ────────────────────
// (extends the base Organization interface above)
export interface OrganizationExtended extends Organization {
  name_arabic:          string | null;
  logo_url:             string | null;
  // SAP Leasing Data
  lease_contract_number: string | null;
  lease_rental_object:  string | null;
  lease_start_date:     string | null;  // ISO date
  lease_end_date:       string | null;  // ISO date
  lease_status:         'active' | 'expired' | 'pending' | 'terminated' | null;
}

// ── Extended Contact with avatar ─────────────────────────────
export interface ContactExtended extends Contact {
  avatar_url: string | null;
}
