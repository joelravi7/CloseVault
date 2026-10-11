export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      activities: {
        Row: {
          command_id: string
          created_at: string
          details: Json
          id: string
          kind: string
          lead_id: string
          occurred_at: string
          owner_id: string
          summary: string
        }
        Insert: {
          command_id: string
          created_at?: string
          details?: Json
          id?: string
          kind: string
          lead_id: string
          occurred_at?: string
          owner_id: string
          summary: string
        }
        Update: {
          command_id?: string
          created_at?: string
          details?: Json
          id?: string
          kind?: string
          lead_id?: string
          occurred_at?: string
          owner_id?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_lead_id_owner_id_fkey"
            columns: ["lead_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "activities_owner_id_command_id_fkey"
            columns: ["owner_id", "command_id"]
            isOneToOne: false
            referencedRelation: "command_receipts"
            referencedColumns: ["owner_id", "command_id"]
          },
        ]
      }
      command_receipts: {
        Row: {
          command_id: string
          command_type: string
          created_at: string
          owner_id: string
          request: Json
          result: Json
        }
        Insert: {
          command_id: string
          command_type: string
          created_at?: string
          owner_id: string
          request: Json
          result: Json
        }
        Update: {
          command_id?: string
          command_type?: string
          created_at?: string
          owner_id?: string
          request?: Json
          result?: Json
        }
        Relationships: []
      }
      follow_ups: {
        Row: {
          cancellation_cause: string | null
          created_at: string
          due_at: string
          id: string
          lead_id: string
          outcome: string | null
          owner_id: string
          replaces_follow_up_id: string | null
          status: string
          terminal_at: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          cancellation_cause?: string | null
          created_at?: string
          due_at: string
          id?: string
          lead_id: string
          outcome?: string | null
          owner_id: string
          replaces_follow_up_id?: string | null
          status?: string
          terminal_at?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          cancellation_cause?: string | null
          created_at?: string
          due_at?: string
          id?: string
          lead_id?: string
          outcome?: string | null
          owner_id?: string
          replaces_follow_up_id?: string | null
          status?: string
          terminal_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_lead_id_owner_id_fkey"
            columns: ["lead_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id", "owner_id"]
          },
          {
            foreignKeyName: "follow_ups_replaces_follow_up_id_owner_id_lead_id_fkey"
            columns: ["replaces_follow_up_id", "owner_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id", "owner_id", "lead_id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          closed_at: string | null
          closure_reason: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          owner_id: string
          phone: string | null
          primary_follow_up_id: string | null
          source: string | null
          stage: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          closed_at?: string | null
          closure_reason?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          owner_id: string
          phone?: string | null
          primary_follow_up_id?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          closed_at?: string | null
          closure_reason?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          owner_id?: string
          phone?: string | null
          primary_follow_up_id?: string | null
          source?: string | null
          stage?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "primary_follow_up_same_lead"
            columns: ["primary_follow_up_id", "owner_id", "id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id", "owner_id", "lead_id"]
          },
        ]
      }
      reminder_intents: {
        Row: {
          action: string
          command_id: string
          created_at: string
          follow_up_id: string
          id: string
          lead_id: string
          owner_id: string
          task_version: number
        }
        Insert: {
          action: string
          command_id: string
          created_at?: string
          follow_up_id: string
          id?: string
          lead_id: string
          owner_id: string
          task_version: number
        }
        Update: {
          action?: string
          command_id?: string
          created_at?: string
          follow_up_id?: string
          id?: string
          lead_id?: string
          owner_id?: string
          task_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reminder_intents_follow_up_id_owner_id_lead_id_fkey"
            columns: ["follow_up_id", "owner_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "follow_ups"
            referencedColumns: ["id", "owner_id", "lead_id"]
          },
          {
            foreignKeyName: "reminder_intents_owner_id_command_id_fkey"
            columns: ["owner_id", "command_id"]
            isOneToOne: false
            referencedRelation: "command_receipts"
            referencedColumns: ["owner_id", "command_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cv_owner_status: {
        Args: { [K in never]: never }
        Returns: boolean
      }
      cv_cancel_follow_up: {
        Args: {
          p_command_id: string
          p_due_at: string
          p_expected_version: number
          p_follow_up_id: string
          p_next_action: string
          p_reason: string
        }
        Returns: Json
      }
      cv_create_lead: {
        Args: {
          p_command_id: string
          p_email?: string
          p_full_name: string
          p_initial_action?: string
          p_initial_due_at?: string
          p_initial_summary?: string
          p_phone?: string
          p_source?: string
        }
        Returns: Json
      }
      cv_edit_lead: {
        Args: {
          p_changes: Json
          p_command_id: string
          p_expected_version: number
          p_lead_id: string
        }
        Returns: Json
      }
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
