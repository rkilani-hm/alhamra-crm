export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          assigned_to: string | null
          body: string | null
          case_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          done: boolean | null
          done_at: string | null
          duration_min: number | null
          id: string
          organization_id: string | null
          outcome: string | null
          scheduled_at: string | null
          subject: string
          type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          case_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          done?: boolean | null
          done_at?: string | null
          duration_min?: number | null
          id?: string
          organization_id?: string | null
          outcome?: string | null
          scheduled_at?: string | null
          subject: string
          type: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          case_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          done?: boolean | null
          done_at?: string | null
          duration_min?: number | null
          id?: string
          organization_id?: string | null
          outcome?: string | null
          scheduled_at?: string | null
          subject?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "lease_expiry_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_attachments: {
        Row: {
          case_id: string
          created_at: string | null
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          case_id: string
          created_at?: string | null
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string | null
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_attachments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          inquiry_type: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          inquiry_type?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          inquiry_type?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      case_history: {
        Row: {
          actor_id: string | null
          case_id: string
          changed_at: string | null
          field: string
          id: string
          new_value: string
          old_value: string | null
        }
        Insert: {
          actor_id?: string | null
          case_id: string
          changed_at?: string | null
          field: string
          id?: string
          new_value: string
          old_value?: string | null
        }
        Update: {
          actor_id?: string | null
          case_id?: string
          changed_at?: string | null
          field?: string
          id?: string
          new_value?: string
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_history_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      case_notes: {
        Row: {
          author_id: string | null
          body: string
          case_id: string | null
          created_at: string | null
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          case_id?: string | null
          created_at?: string | null
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          case_id?: string | null
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          category_id: string | null
          channel: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          department_id: string | null
          due_at: string | null
          id: string
          inquiry_type: string | null
          notes: string | null
          priority: string | null
          status: string | null
          subject: string
          wazzup_deal_id: string | null
        }
        Insert: {
          category_id?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          due_at?: string | null
          id?: string
          inquiry_type?: string | null
          notes?: string | null
          priority?: string | null
          status?: string | null
          subject: string
          wazzup_deal_id?: string | null
        }
        Update: {
          category_id?: string | null
          channel?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          department_id?: string | null
          due_at?: string | null
          id?: string
          inquiry_type?: string | null
          notes?: string | null
          priority?: string | null
          status?: string | null
          subject?: string
          wazzup_deal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "case_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          avatar_url: string | null
          client_type: string | null
          company_name: string | null
          contract_number: string | null
          created_at: string | null
          email: string | null
          floor: string | null
          host_name: string | null
          id: string
          id_number: string | null
          job_title: string | null
          linkedin_url: string | null
          name: string
          organization_id: string | null
          phone: string | null
          sap_bp_number: string | null
          source: string | null
          unit: string | null
          vendor_type: string | null
          visit_purpose: string | null
          wazzup_synced_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          client_type?: string | null
          company_name?: string | null
          contract_number?: string | null
          created_at?: string | null
          email?: string | null
          floor?: string | null
          host_name?: string | null
          id?: string
          id_number?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          name: string
          organization_id?: string | null
          phone?: string | null
          sap_bp_number?: string | null
          source?: string | null
          unit?: string | null
          vendor_type?: string | null
          visit_purpose?: string | null
          wazzup_synced_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          client_type?: string | null
          company_name?: string | null
          contract_number?: string | null
          created_at?: string | null
          email?: string | null
          floor?: string | null
          host_name?: string | null
          id?: string
          id_number?: string | null
          job_title?: string | null
          linkedin_url?: string | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          sap_bp_number?: string | null
          source?: string | null
          unit?: string | null
          vendor_type?: string | null
          visit_purpose?: string | null
          wazzup_synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "lease_expiry_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      intake_routing: {
        Row: {
          auto_assign: boolean | null
          created_at: string | null
          default_priority: string
          department_name: string
          id: string
          inquiry_type: string
        }
        Insert: {
          auto_assign?: boolean | null
          created_at?: string | null
          default_priority?: string
          department_name: string
          id?: string
          inquiry_type: string
        }
        Update: {
          auto_assign?: boolean | null
          created_at?: string | null
          default_priority?: string
          department_name?: string
          id?: string
          inquiry_type?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          case_id: string | null
          created_at: string | null
          id: string
          link: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          case_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          case_id?: string | null
          created_at?: string | null
          id?: string
          link?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          email: string | null
          id: string
          industry: string | null
          lease_contract_number: string | null
          lease_end_date: string | null
          lease_rental_object: string | null
          lease_start_date: string | null
          lease_status: string | null
          logo_url: string | null
          name: string
          name_arabic: string | null
          owner_id: string | null
          phone: string | null
          sap_bp_number: string | null
          sap_last_synced_at: string | null
          type: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          lease_contract_number?: string | null
          lease_end_date?: string | null
          lease_rental_object?: string | null
          lease_start_date?: string | null
          lease_status?: string | null
          logo_url?: string | null
          name: string
          name_arabic?: string | null
          owner_id?: string | null
          phone?: string | null
          sap_bp_number?: string | null
          sap_last_synced_at?: string | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          lease_contract_number?: string | null
          lease_end_date?: string | null
          lease_rental_object?: string | null
          lease_start_date?: string | null
          lease_status?: string | null
          logo_url?: string | null
          name?: string
          name_arabic?: string | null
          owner_id?: string | null
          phone?: string | null
          sap_bp_number?: string | null
          sap_last_synced_at?: string | null
          type?: string
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          department_id: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string | null
          department_id?: string | null
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string | null
          department_id?: string | null
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          body: string
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          title: string
        }
        Insert: {
          body: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_channels: {
        Row: {
          channel_id: string
          created_at: string | null
          id: string
          label: string | null
          phone: string
          state: string | null
          transport: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string | null
          id?: string
          label?: string | null
          phone: string
          state?: string | null
          transport?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string | null
          id?: string
          label?: string | null
          phone?: string
          state?: string | null
          transport?: string | null
        }
        Relationships: []
      }
      wa_conversations: {
        Row: {
          assigned_to: string | null
          case_id: string | null
          channel_id: string
          chat_id: string
          contact_id: string | null
          created_at: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          unread_count: number | null
          wazzup_deal_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          case_id?: string | null
          channel_id: string
          chat_id: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          wazzup_deal_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          case_id?: string | null
          channel_id?: string
          chat_id?: string
          contact_id?: string | null
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          unread_count?: number | null
          wazzup_deal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "wa_channels"
            referencedColumns: ["channel_id"]
          },
          {
            foreignKeyName: "wa_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string | null
          direction: string
          id: string
          media_url: string | null
          msg_type: string | null
          sender_name: string | null
          sent_at: string
          status: string | null
          wazzup_id: string | null
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string | null
          direction: string
          id?: string
          media_url?: string | null
          msg_type?: string | null
          sender_name?: string | null
          sent_at?: string
          status?: string | null
          wazzup_id?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string | null
          direction?: string
          id?: string
          media_url?: string | null
          msg_type?: string | null
          sender_name?: string | null
          sent_at?: string
          status?: string | null
          wazzup_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      web_submissions: {
        Row: {
          case_id: string | null
          created_at: string | null
          form_data: Json
          id: string
          inquiry_type: string
          ip_address: string | null
        }
        Insert: {
          case_id?: string | null
          created_at?: string | null
          form_data: Json
          id?: string
          inquiry_type: string
          ip_address?: string | null
        }
        Update: {
          case_id?: string | null
          created_at?: string | null
          form_data?: Json
          id?: string
          inquiry_type?: string
          ip_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "web_submissions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      lease_expiry_alerts: {
        Row: {
          alert_level: string | null
          days_remaining: number | null
          email: string | null
          id: string | null
          lease_contract_number: string | null
          lease_end_date: string | null
          lease_rental_object: string | null
          lease_start_date: string | null
          lease_status: string | null
          name: string | null
          name_arabic: string | null
          phone: string | null
          sap_bp_number: string | null
        }
        Insert: {
          alert_level?: never
          days_remaining?: never
          email?: string | null
          id?: string | null
          lease_contract_number?: string | null
          lease_end_date?: string | null
          lease_rental_object?: string | null
          lease_start_date?: string | null
          lease_status?: string | null
          name?: string | null
          name_arabic?: string | null
          phone?: string | null
          sap_bp_number?: string | null
        }
        Update: {
          alert_level?: never
          days_remaining?: never
          email?: string | null
          id?: string | null
          lease_contract_number?: string | null
          lease_end_date?: string | null
          lease_rental_object?: string | null
          lease_start_date?: string | null
          lease_status?: string | null
          name?: string | null
          name_arabic?: string | null
          phone?: string | null
          sap_bp_number?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_role: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
