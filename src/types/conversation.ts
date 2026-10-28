/**
 * Conversation State Machine and Context Summary Types
 * Used for strict tracking of teaching progress, topic switching, and seamless resumption.
 */

export type ConversationState =
  | 'INITIALIZING'       // Genuinely new teaching session is being initialized
  | 'READY'              // Connected and ready for student's first request
  | 'TEACHING'           // Teacher is actively explaining a topic continuously
  | 'WAITING_FOR_STUDENT'// Teacher paused with a checkpoint question, waiting for student
  | 'PROCESSING_INPUT'   // Student's speech, answer, or new topic request is being processed
  | 'SWITCHING_TOPIC'    // Student requested a new topic within existing conversation
  | 'RECONNECTING'       // Transport/session is reconnecting without restarting lesson
  | 'ERROR';             // Unrecoverable error has occurred

export type TeachingMode = 'lecture' | 'doubts' | 'quiz';

export interface TeachingContextSummary {
  personaId: string;
  personaTitle: string;
  className?: string;           // e.g. "Class 10"
  classGrade?: string;          // Alias for className
  subject?: string;             // e.g. "WBBSE Science", "Physical Science", "Life Science"
  chapter?: string;             // e.g. "অধ্যায় ২"
  currentTopic: string | null;  // e.g. "Boyle's Law & Gas Behavior"
  teachingMode?: TeachingMode;  // 'lecture' (আলোচনা) | 'doubts' (AI কে প্রশ্ন) | 'quiz' (প্রশ্ন উত্তর)
  teachingModeLabel?: string;   // 'আলোচনা' | 'AI কে প্রশ্ন' | 'প্রশ্ন উত্তর'
  lastCompletedConcept?: string;// e.g. "বয়েলের সূত্র ও গাণিতিক রূপ"
  conceptsCovered: string[];    // e.g. ["Boyle's Law", "Charles's Law"]
  topicHistory: string[];       // All topics visited during this lesson
  pendingQuestion?: string;     // Last question teacher asked before waiting
  popQuizPending: boolean;      // Whether teacher asked a checkpoint question
  lastStudentInput?: string;    // Last recognized student transcript/message
  conversationState: ConversationState;
  turnCount: number;
  turnsCompleted: number;       // Alias for turnCount
  isLessonStarted: boolean;
  resumptionCount: number;
  resumptionHandle: string | null;
  lastUpdated: number;
}

export type StudentIntentType =
  | 'TOPIC_REQUEST'      // e.g., "Class 10 Physical Science Chapter 2 Boyle's law"
  | 'TOPIC_SWITCH'       // e.g., "এবার চার্লসের সূত্র বোঝাও" or "এবার জীবনবিজ্ঞান পড়াও"
  | 'REPEAT_EXPLANATION' // e.g., "আগের বিষয়টা আরেকবার বুঝিয়ে দাও"
  | 'ANSWER'             // e.g., student answers the checkpoint question
  | 'QUESTION'           // e.g., student asks a question during lesson
  | 'START_NEW_LESSON'   // e.g., "আজ নতুন করে পড়া শুরু করি"
  | 'UNKNOWN';

export type StudentIntent = StudentIntentType | {
  type: StudentIntentType;
  extractedTopic?: string;
};
