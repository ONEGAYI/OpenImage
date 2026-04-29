export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  head_response_id: string | null;
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
  api_mode: "responses" | "images" | "chat";
  model_name: string;
}

export interface AttachedFile {
  id: string;
  name: string;
  data: string;
  media_type: string;
  preview_url: string;
}
