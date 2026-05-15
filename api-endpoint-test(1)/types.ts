export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type AIProvider = 'anthropic' | 'openai' | 'gemini' | 'ollama';

export type AnalysisMode = 'static' | 'ai';

export interface DetectedRoute {
  name: string;
  method: HttpMethod;
  path: string;
  headers: { key: string; value: string }[];
  body: string;
  bodyType: 'json' | 'form' | 'none';
  authRequired: boolean;
  description: string;
  sourceFile: string;
}

export interface SavedProject {
  id: string;
  name: string;
  framework: string;
  folderPath: string;
  port?: number;
  routes: DetectedRoute[];
  analyzedAt: string;
  mode: AnalysisMode;
}
