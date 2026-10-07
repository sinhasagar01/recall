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
      capabilities: {
        Row: {
          created_at: string
          id: string
          name: string
          phase_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          phase_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          phase_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "phases"
            referencedColumns: ["id"]
          },
        ]
      }
      days: {
        Row: {
          apply_done: boolean
          apply_text: string | null
          blocker_resolved_at: string | null
          blocker_text: string | null
          created_at: string
          day: string
          explain_done: boolean
          explain_text: string | null
          id: string
          rebuild_done: boolean
          rebuild_text: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          apply_done?: boolean
          apply_text?: string | null
          blocker_resolved_at?: string | null
          blocker_text?: string | null
          created_at?: string
          day: string
          explain_done?: boolean
          explain_text?: string | null
          id?: string
          rebuild_done?: boolean
          rebuild_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          apply_done?: boolean
          apply_text?: string | null
          blocker_resolved_at?: string | null
          blocker_text?: string | null
          created_at?: string
          day?: string
          explain_done?: boolean
          explain_text?: string | null
          id?: string
          rebuild_done?: boolean
          rebuild_text?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      interview_rounds: {
        Row: {
          answered: number
          asked: number
          code: string[]
          created_at: string
          depth: number
          elapsed_seconds: number
          enquiry: number
          follow_ups_held: number
          follow_ups_offered: number
          hints_used: number
          id: string
          level: string
          minutes: number
          over_by_seconds: number
          overall: number
          precision: number
          questions_asked: number
          recall: number
          round_type: string
          topic_ids: string[]
          user_id: string
        }
        Insert: {
          answered: number
          asked: number
          code?: string[]
          created_at?: string
          depth: number
          elapsed_seconds: number
          enquiry: number
          follow_ups_held: number
          follow_ups_offered: number
          hints_used: number
          id?: string
          level: string
          minutes: number
          over_by_seconds?: number
          overall: number
          precision: number
          questions_asked: number
          recall: number
          round_type: string
          topic_ids?: string[]
          user_id?: string
        }
        Update: {
          answered?: number
          asked?: number
          code?: string[]
          created_at?: string
          depth?: number
          elapsed_seconds?: number
          enquiry?: number
          follow_ups_held?: number
          follow_ups_offered?: number
          hints_used?: number
          id?: string
          level?: string
          minutes?: number
          over_by_seconds?: number
          overall?: number
          precision?: number
          questions_asked?: number
          recall?: number
          round_type?: string
          topic_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      phases: {
        Row: {
          created_at: string
          id: string
          name: string
          sources_text: string | null
          updated_at: string
          user_id: string
          when_text: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sources_text?: string | null
          updated_at?: string
          user_id?: string
          when_text?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sources_text?: string | null
          updated_at?: string
          user_id?: string
          when_text?: string | null
        }
        Relationships: []
      }
      project_items: {
        Row: {
          capability_id: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          note: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capability_id?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          note?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          capability_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          note?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_items_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          chapter: string | null
          course: string | null
          coverage: Json
          created_at: string
          duration_seconds: number | null
          id: string
          lesson: string
          transcript: string | null
          transcript_deleted_at: string | null
          transcript_words: number | null
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          chapter?: string | null
          course?: string | null
          coverage?: Json
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lesson: string
          transcript?: string | null
          transcript_deleted_at?: string | null
          transcript_words?: number | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          chapter?: string | null
          course?: string | null
          coverage?: Json
          created_at?: string
          duration_seconds?: number | null
          id?: string
          lesson?: string
          transcript?: string | null
          transcript_deleted_at?: string | null
          transcript_words?: number | null
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          capability_id: string | null
          category: string | null
          challenge_at: string | null
          challenge_note: string | null
          challenge_url: string | null
          confidence: string
          correct_option: number | null
          created_at: string
          definition: string | null
          difficulty: string
          extracted: boolean
          id: string
          kind: string
          last_practiced_at: string | null
          last_recall: string | null
          last_recall_at: string | null
          mental_model: string | null
          mental_model_image_path: string | null
          options: string[] | null
          parent_topic_id: string | null
          practice_count: number
          production_at: string | null
          production_note: string | null
          production_url: string | null
          rebuild_at: string | null
          rebuild_note: string | null
          rebuild_url: string | null
          search_text: string | null
          source_id: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capability_id?: string | null
          category?: string | null
          challenge_at?: string | null
          challenge_note?: string | null
          challenge_url?: string | null
          confidence?: string
          correct_option?: number | null
          created_at?: string
          definition?: string | null
          difficulty?: string
          extracted?: boolean
          id?: string
          kind?: string
          last_practiced_at?: string | null
          last_recall?: string | null
          last_recall_at?: string | null
          mental_model?: string | null
          mental_model_image_path?: string | null
          options?: string[] | null
          parent_topic_id?: string | null
          practice_count?: number
          production_at?: string | null
          production_note?: string | null
          production_url?: string | null
          rebuild_at?: string | null
          rebuild_note?: string | null
          rebuild_url?: string | null
          search_text?: string | null
          source_id?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          capability_id?: string | null
          category?: string | null
          challenge_at?: string | null
          challenge_note?: string | null
          challenge_url?: string | null
          confidence?: string
          correct_option?: number | null
          created_at?: string
          definition?: string | null
          difficulty?: string
          extracted?: boolean
          id?: string
          kind?: string
          last_practiced_at?: string | null
          last_recall?: string | null
          last_recall_at?: string | null
          mental_model?: string | null
          mental_model_image_path?: string | null
          options?: string[] | null
          parent_topic_id?: string | null
          practice_count?: number
          production_at?: string | null
          production_note?: string | null
          production_url?: string | null
          rebuild_at?: string | null
          rebuild_note?: string | null
          rebuild_url?: string | null
          search_text?: string | null
          source_id?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "topics_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_parent_topic_id_fkey"
            columns: ["parent_topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topics_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      library_counts: {
        Args: {
          p_category?: string
          p_confidence?: string
          p_difficulty?: string
          p_kinds?: string[]
          p_now: string
          p_query?: string
          p_quick?: string[]
          p_recent_window_days: number
        }
        Returns: Json
      }
      library_page: {
        Args: {
          p_category?: string
          p_confidence?: string
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_difficulty?: string
          p_kinds?: string[]
          p_limit?: number
          p_now: string
          p_query?: string
          p_quick?: string[]
          p_recent_window_days: number
        }
        Returns: {
          category: string
          challenge_at: string
          challenge_note: string
          challenge_url: string
          confidence: string
          correct_option: number
          created_at: string
          definition: string
          difficulty: string
          extracted: boolean
          id: string
          kind: string
          last_practiced_at: string
          mental_model: string
          mental_model_image_path: string
          options: string[]
          practice_count: number
          production_at: string
          production_note: string
          production_url: string
          rebuild_at: string
          rebuild_note: string
          rebuild_url: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }[]
      }
      practice_ordered_page: {
        Args: {
          p_bucket_order: string[]
          p_confidences?: string[]
          p_cursor_bucket?: number
          p_cursor_created_at?: string
          p_cursor_id?: string
          p_cursor_staleness?: string
          p_ids?: string[]
          p_kinds?: string[]
          p_limit?: number
          p_practised_before?: string
          p_seed?: string
        }
        Returns: {
          bucket: number
          category: string
          confidence: string
          correct_option: number
          created_at: string
          definition: string
          difficulty: string
          extracted: boolean
          id: string
          kind: string
          last_practiced_at: string
          mental_model: string
          mental_model_image_path: string
          options: string[]
          practice_count: number
          staleness: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }[]
      }
      practice_setup_counts: {
        Args: { p_kind: string }
        Returns: Json
      }
      rail_counts: { Args: { p_review_confidences: string[] }; Returns: Json }
      topic_search_normalise: { Args: { p_value: string }; Returns: string }
      topic_search_pattern: { Args: { p_query: string }; Returns: string }
      topic_search_text:
        | {
            Args: {
              p_category: string
              p_definition: string
              p_mental_model: string
              p_tags: string[]
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_category: string
              p_definition: string
              p_mental_model: string
              p_options: string[]
              p_tags: string[]
              p_title: string
            }
            Returns: string
          }
      weak_counts: {
        Args: {
          p_confidences: string[]
          p_practised_before?: string
          p_settled_confidences?: string[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
