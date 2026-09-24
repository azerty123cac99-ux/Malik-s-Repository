export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      invite_revocations: {
        Row: {
          email: string
          id: number
          revoked_at: string
          revoked_by: string | null
          revoked_user_id: string
          team_id: string | null
        }
        Insert: {
          email: string
          id?: never
          revoked_at?: string
          revoked_by?: string | null
          revoked_user_id: string
          team_id?: string | null
        }
        Update: {
          email?: string
          id?: never
          revoked_at?: string
          revoked_by?: string | null
          revoked_user_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_revocations_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_revocations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      pitches: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          exit_trigger: string
          id: string
          key_risk: string
          objective_id: string | null
          sources: string
          stage: Database["public"]["Enums"]["pitch_stage"]
          team_id: string
          thesis: string
          ticker: string
          updated_at: string
        }
        Insert: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          exit_trigger?: string
          id?: string
          key_risk?: string
          objective_id?: string | null
          sources?: string
          stage?: Database["public"]["Enums"]["pitch_stage"]
          team_id: string
          thesis: string
          ticker: string
          updated_at?: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          exit_trigger?: string
          id?: string
          key_risk?: string
          objective_id?: string | null
          sources?: string
          stage?: Database["public"]["Enums"]["pitch_stage"]
          team_id?: string
          thesis?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pitches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          is_president: boolean
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          full_name: string
          id: string
          is_president?: boolean
          role: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_president?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      roster_invites: {
        Row: {
          claimed_at: string | null
          created_at: string
          email: string
          expires_at: string
          invited_by: string | null
          is_president: boolean
          role: Database["public"]["Enums"]["app_role"]
          team_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          invited_by?: string | null
          is_president?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          invited_by?: string | null
          is_president?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roster_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          id: string
          name: string
          starting_capital: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          starting_capital?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          starting_capital?: number
        }
        Relationships: []
      }
      trades: {
        Row: {
          created_at: string
          id: string
          pitch_id: string | null
          placed_by: string | null
          price: number
          quantity: number
          rationale: string
          side: Database["public"]["Enums"]["trade_side"]
          team_id: string
          ticker: string
          trade_date: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pitch_id?: string | null
          placed_by?: string | null
          price: number
          quantity: number
          rationale: string
          side: Database["public"]["Enums"]["trade_side"]
          team_id: string
          ticker: string
          trade_date?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pitch_id?: string | null
          placed_by?: string | null
          price?: number
          quantity?: number
          rationale?: string
          side?: Database["public"]["Enums"]["trade_side"]
          team_id?: string
          ticker?: string
          trade_date?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitch_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_pitch_id_fkey"
            columns: ["pitch_id"]
            isOneToOne: false
            referencedRelation: "pitches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_voided_by_fkey"
            columns: ["voided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      pitch_board: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"] | null
          created_at: string | null
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          display_stage: string | null
          exit_trigger: string | null
          id: string | null
          key_risk: string | null
          net_quantity: number | null
          objective_id: string | null
          sources: string | null
          stage: Database["public"]["Enums"]["pitch_stage"] | null
          team_id: string | null
          thesis: string | null
          ticker: string | null
          trade_count: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pitches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pitches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          last_price: number | null
          last_trade_date: string | null
          quantity: number | null
          team_id: string | null
          ticker: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trades_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_invite_tokens: {
        Args: never
        Returns: {
          email: string
          token: string
        }[]
      }
      invite_token: { Args: { p_email: string }; Returns: string }
      lookup_invite: {
        Args: { p_token: string }
        Returns: {
          email: string
          team_name: string
        }[]
      }
      regenerate_invite: { Args: { p_email: string }; Returns: string }
      revoke_and_reissue: { Args: { p_email: string }; Returns: string }
      set_member_active: {
        Args: { p_active: boolean; p_user: string }
        Returns: undefined
      }
      set_member_role: {
        Args: {
          p_role: Database["public"]["Enums"]["app_role"]
          p_user: string
        }
        Returns: undefined
      }
      void_trade: {
        Args: { p_reason: string; p_trade: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "member" | "leader" | "advisor"
      asset_type: "stock" | "etf" | "bond" | "fund" | "other"
      pitch_stage: "idea" | "pitched" | "approved" | "rejected"
      trade_side: "buy" | "sell"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["member", "leader", "advisor"],
      asset_type: ["stock", "etf", "bond", "fund", "other"],
      pitch_stage: ["idea", "pitched", "approved", "rejected"],
      trade_side: ["buy", "sell"],
    },
  },
} as const

