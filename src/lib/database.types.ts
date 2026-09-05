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
      topics: {
        Row: {
          category: string | null
          confidence: string
          created_at: string
          definition: string
          difficulty: string
          id: string
          last_practiced_at: string | null
          mental_model: string | null
          mental_model_image_path: string | null
          practice_count: number
          search_text: string | null
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          confidence?: string
          created_at?: string
          definition: string
          difficulty?: string
          id?: string
          last_practiced_at?: string | null
          mental_model?: string | null
          mental_model_image_path?: string | null
          practice_count?: number
          search_text?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          category?: string | null
          confidence?: string
          created_at?: string
          definition?: string
          difficulty?: string
          id?: string
          last_practiced_at?: string | null
          mental_model?: string | null
          mental_model_image_path?: string | null
          practice_count?: number
          search_text?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          p_limit?: number
          p_now: string
          p_query?: string
          p_quick?: string[]
          p_recent_window_days: number
        }
        Returns: {
          category: string
          confidence: string
          created_at: string
          definition: string
          difficulty: string
          id: string
          last_practiced_at: string
          mental_model: string
          mental_model_image_path: string
          practice_count: number
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
          p_limit?: number
          p_practised_before?: string
          p_seed?: string
        }
        Returns: {
          bucket: number
          category: string
          confidence: string
          created_at: string
          definition: string
          difficulty: string
          id: string
          last_practiced_at: string
          mental_model: string
          mental_model_image_path: string
          practice_count: number
          staleness: string
          tags: string[]
          title: string
          updated_at: string
          user_id: string
        }[]
      }
      rail_counts: { Args: { p_review_confidences: string[] }; Returns: Json }
      topic_search_normalise: { Args: { p_value: string }; Returns: string }
      topic_search_pattern: { Args: { p_query: string }; Returns: string }
      topic_search_text: {
        Args: {
          p_category: string
          p_definition: string
          p_mental_model: string
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

