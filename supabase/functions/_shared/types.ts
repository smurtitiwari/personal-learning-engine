// ============================================================
// Shared types for Learning Engine Edge Functions
// ============================================================

export interface Resource {
  id: string;
  user_id: string;
  url: string;
  title?: string;
  source?: string;
  source_type: 'video' | 'article' | 'newsletter' | 'pdf' | 'other';
  creator_name?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  reading_time_minutes?: number;
  page_count?: number;
  published_at?: string;
  saved_at: string;
  content_text?: string;
  transcript?: string;
  ai_summary?: string;
  ai_key_takeaways: string[];
  ai_concepts: string[];
  ai_keywords: string[];
  processing_status: 'processing' | 'ready' | 'failed';
  processing_error?: string;
  progress_percentage: number;
  completed_at?: string;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  status: 'active' | 'paused' | 'archived';
  ai_rationale?: string;
  created_at: string;
  updated_at: string;
}

export interface Recommendation {
  id: string;
  user_id: string;
  goal_id?: string;
  title: string;
  url?: string;
  source?: string;
  source_type?: string;
  creator_name?: string;
  description?: string;
  topics: string[];
  score: number;
  reason?: string;
  reason_detail?: string;
  score_breakdown: Record<string, number>;
  recommendation_type: string;
  status: 'active' | 'dismissed' | 'saved';
  generated_at: string;
  dismissed_at?: string;
  created_at: string;
}

export interface AIAnalysisResult {
  summary: string;
  topics: string[];
  concepts: string[];
  keywords: string[];
}

export interface AIGoalAnalysis {
  topics: string[];
  rationale: string;
}

export interface ExtractedContent {
  title?: string;
  creator?: string;
  content_text?: string;
  transcript?: string;
  thumbnail_url?: string;
  duration_seconds?: number;
  reading_time_minutes?: number;
  page_count?: number;
  published_at?: string;
  source?: string;
  source_type: 'video' | 'article' | 'newsletter' | 'pdf' | 'other';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
