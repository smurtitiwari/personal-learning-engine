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
      activity_events: {
        Row: {
          created_at: string
          duration_seconds: number
          event_type: string
          id: string
          metadata: Json
          progress_percentage: number
          resource_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          event_type: string
          id?: string
          metadata?: Json
          progress_percentage?: number
          resource_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          event_type?: string
          id?: string
          metadata?: Json
          progress_percentage?: number
          resource_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_topics: {
        Row: {
          goal_id: string
          topic_id: string
        }
        Insert: {
          goal_id: string
          topic_id: string
        }
        Update: {
          goal_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_topics_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goal_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          ai_rationale: string | null
          created_at: string
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_rationale?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_rationale?: string | null
          created_at?: string
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recommendations: {
        Row: {
          created_at: string
          creator_name: string | null
          description: string | null
          dismissed_at: string | null
          generated_at: string
          goal_id: string | null
          id: string
          reason: string | null
          reason_detail: string | null
          recommendation_type: string
          score: number
          score_breakdown: Json
          source: string | null
          source_type: string | null
          status: string
          title: string
          topics: Json
          url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          creator_name?: string | null
          description?: string | null
          dismissed_at?: string | null
          generated_at?: string
          goal_id?: string | null
          id?: string
          reason?: string | null
          reason_detail?: string | null
          recommendation_type?: string
          score?: number
          score_breakdown?: Json
          source?: string | null
          source_type?: string | null
          status?: string
          title: string
          topics?: Json
          url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          creator_name?: string | null
          description?: string | null
          dismissed_at?: string | null
          generated_at?: string
          goal_id?: string | null
          id?: string
          reason?: string | null
          reason_detail?: string | null
          recommendation_type?: string
          score?: number
          score_breakdown?: Json
          source?: string | null
          source_type?: string | null
          status?: string
          title?: string
          topics?: Json
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_embeddings: {
        Row: {
          created_at: string
          embedding: string | null
          model: string
          resource_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          embedding?: string | null
          model?: string
          resource_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          embedding?: string | null
          model?: string
          resource_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_embeddings_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: true
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_topics: {
        Row: {
          resource_id: string
          topic_id: string
        }
        Insert: {
          resource_id: string
          topic_id: string
        }
        Update: {
          resource_id?: string
          topic_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resource_topics_resource_id_fkey"
            columns: ["resource_id"]
            isOneToOne: false
            referencedRelation: "resources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resource_topics_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "topics"
            referencedColumns: ["id"]
          },
        ]
      }
      resources: {
        Row: {
          ai_concepts: Json
          ai_key_takeaways: Json
          ai_keywords: Json
          ai_summary: string | null
          completed_at: string | null
          content_text: string | null
          created_at: string
          creator_name: string | null
          deleted_at: string | null
          duration_seconds: number | null
          id: string
          page_count: number | null
          processing_error: string | null
          processing_status: string
          progress_percentage: number
          published_at: string | null
          reading_time_minutes: number | null
          saved_at: string
          source: string | null
          source_type: string
          thumbnail_url: string | null
          title: string | null
          transcript: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          ai_concepts?: Json
          ai_key_takeaways?: Json
          ai_keywords?: Json
          ai_summary?: string | null
          completed_at?: string | null
          content_text?: string | null
          created_at?: string
          creator_name?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          page_count?: number | null
          processing_error?: string | null
          processing_status?: string
          progress_percentage?: number
          published_at?: string | null
          reading_time_minutes?: number | null
          saved_at?: string
          source?: string | null
          source_type?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          ai_concepts?: Json
          ai_key_takeaways?: Json
          ai_keywords?: Json
          ai_summary?: string | null
          completed_at?: string | null
          content_text?: string | null
          created_at?: string
          creator_name?: string | null
          deleted_at?: string | null
          duration_seconds?: number | null
          id?: string
          page_count?: number | null
          processing_error?: string | null
          processing_status?: string
          progress_percentage?: number
          published_at?: string | null
          reading_time_minutes?: number | null
          saved_at?: string
          source?: string | null
          source_type?: string
          thumbnail_url?: string | null
          title?: string | null
          transcript?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      topics: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      trends: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          momentum: string | null
          relevance: string | null
          source_info: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          momentum?: string | null
          relevance?: string | null
          source_info?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          momentum?: string | null
          relevance?: string | null
          source_info?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          ai_recommendations_enabled: boolean
          appearance: string
          updated_at: string
          user_id: string
          weekly_target_minutes: number
        }
        Insert: {
          ai_recommendations_enabled?: boolean
          appearance?: string
          updated_at?: string
          user_id: string
          weekly_target_minutes?: number
        }
        Update: {
          ai_recommendations_enabled?: boolean
          appearance?: string
          updated_at?: string
          user_id?: string
          weekly_target_minutes?: number
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          about: string | null
          emerging_interests: Json
          full_name: string | null
          interests: Json
          knowledge_gaps: Json
          learning_frequency: Json
          preferred_content_types: Json
          topic_strength: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          about?: string | null
          emerging_interests?: Json
          full_name?: string | null
          interests?: Json
          knowledge_gaps?: Json
          learning_frequency?: Json
          preferred_content_types?: Json
          topic_strength?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          about?: string | null
          emerging_interests?: Json
          full_name?: string | null
          interests?: Json
          knowledge_gaps?: Json
          learning_frequency?: Json
          preferred_content_types?: Json
          topic_strength?: Json
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
      get_topic_analytics: {
        Args: { p_user_id: string }
        Returns: {
          count: number
          recent_count: number
          topic: string
        }[]
      }
      search_resources_by_embedding: {
        Args: {
          p_embedding: string
          p_limit?: number
          p_threshold?: number
          p_user_id: string
        }
        Returns: {
          resource_id: string
          similarity: number
          title: string
        }[]
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

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
