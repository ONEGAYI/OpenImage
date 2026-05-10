export type MessageRole = "user" | "assistant" | "system";
export type ApiMode = "responses" | "images" | "chat";

interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface Session extends BaseEntity {
  name: string;
  head_response_id: string | null;
  image_count?: number;
  latest_image_id?: string | null;
}

export interface Image {
  id: string;
  session_id: string;
  step: number;
  response_id: string;
  prompt: string;
  revised_prompt: string | null;
  parent_image_id: string | null;
  file_path: string;
  size: string;
  quality: string;
  output_format: string;
  created_at: string;
}

export interface GenerateParams {
  size?: string;
  quality?: string;
  output_format?: string;
  input_fidelity?: string;
  moderation?: string;
}

export interface GenerateRequest {
  session_id: string;
  prompt: string;
  images?: ImageInput[];
  fork_from?: string;
  params?: GenerateParams;
}

export interface ImageInput {
  type: "base64" | "image_id";
  data?: string;
  media_type?: string;
  id?: string;
}

export interface GenerateCompleted {
  image_id: string;
  response_id: string;
  revised_prompt: string | null;
  step: number;
  file_path: string;
  size: string;
  quality: string;
}

export interface SettingsResponse {
  api_key_set: boolean;
  api_key_preview: string | null;
  api_key: string | null;
  base_url: string | null;
  api_mode: ApiMode;
  model_name: string;
  resolved_endpoint: string;
  full_version: string;
}

export interface ReferenceImage {
  data: string;
  media_type: string;
}

export interface InpaintRequest {
  session_id: string;
  prompt: string;
  source_image_id?: string;
  source_image_b64?: string;
  mask_b64: string;
  reference_images?: ReferenceImage[];
  params?: GenerateParams;
}

export type InpaintCompleted = GenerateCompleted;

export type MaskImageSource =
  | { type: "generated"; imageId: string }
  | { type: "attachment"; attachmentId: string; imageB64: string };

export interface AttachedFile {
  id: string;
  name: string;
  data: string;
  media_type: string;
  preview_url: string;
}

// ── LLM AI 助手 ──

export interface LLMChatSession extends BaseEntity {
  session_id: string;
  name: string;
  total_tokens: number;
}

export interface LLMMessage {
  id: string;
  chat_session_id: string;
  role: MessageRole;
  content: string;
  ai_block: string | null;
  token_count: number;
  attachments: string | null;
  thinking_content: string | null;
  thinking_duration_ms: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface LLMSettings {
  llm_api_key_set: boolean;
  llm_api_key_preview: string | null;
  llm_api_key: string | null;
  llm_base_url: string | null;
  llm_model_name: string | null;
  llm_supports_vision: boolean | null;
  llm_system_prompt: string | null;
}

export interface LLMSettingsUpdate {
  llm_api_key?: string;
  llm_base_url?: string;
  llm_model_name?: string;
  llm_supports_vision?: boolean;
  llm_system_prompt?: string;
}

export interface AiBlockQuestions {
  type: "questions";
  message: string;
  fields: QuestionField[];
}

export interface AiBlockSuggestions {
  type: "suggestions";
  message: string;
  items: SuggestionItem[];
}

export type AiBlock = AiBlockQuestions | AiBlockSuggestions;

export interface QuestionField {
  id: string;
  label: string;
  widget: "text" | "textarea" | "radio" | "select" | "checkbox";
  options?: string[];
  placeholder?: string;
  required: boolean;
}

export interface SuggestionItem {
  id: string;
  title: string;
  prompt: string;
  recommended?: boolean;
}

export interface ChatContext {
  aspect_ratio?: string;
  size_label?: string;
}

export interface LLMChatRequest {
  content: string;
  attachments?: Array<{ data: string; media_type: string }>;
  form_response?: Record<string, string>;
  context?: ChatContext;
}
