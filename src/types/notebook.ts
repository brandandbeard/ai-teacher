export type NotebookSourceType = 'youtube' | 'pdf' | 'drive' | 'image' | 'text';

export interface NotebookSource {
  id: string;
  type: NotebookSourceType;
  title: string;
  summary: string;
  content: string;
  keyPoints?: string[];
  url?: string;
  thumbnailUrl?: string;
  fileName?: string;
  fileSize?: number;
  isActive: boolean;
  createdAt: number;
}

export interface StudyGuide {
  title: string;
  overview: string;
  keyConcepts: { term: string; definition: string }[];
  quizQuestions: { question: string; answer: string }[];
  suggestedTopics: string[];
  generatedAt: number;
}
