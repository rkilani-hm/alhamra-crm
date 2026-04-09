export type Role = 'frontdesk' | 'department' | 'manager';
export type Channel = 'call' | 'visit' | 'web' | 'whatsapp';
export type Priority = 'low' | 'normal' | 'urgent';
export type CaseStatus = 'new' | 'inprogress' | 'done';

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
}

export interface Contact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: Channel | null;
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
