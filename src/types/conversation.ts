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

export interface TeachingContextSummary {
  personaId: string;
  personaTitle: string;
  className?: string;           // e.g. "Class 10"
  subject?: string;             // e.g. "Physical Science" or "Life Science"
  chapter?: string;             // e.g. "Chapter 2 - গ্যাসের আচরণ"
  currentTopic?: string;        // e.g. "চার্লসের সূত্র (Charles's Law)"
  lastCompletedConcept?: string;// e.g. "বয়েলের সূত্র ও গাণিতিক রূপ"
  conceptsCovered: string[];    // e.g. ["বয়েলের সূত্র", "P1V1=P2V2"]
  pendingQuestion?: string;     // Last question teacher asked before waiting
  lastStudentInput?: string;    // Last recognized student transcript/message
  conversationState: ConversationState;
  turnCount: number;
  isLessonStarted: boolean;
  resumptionCount: number;
  lastUpdated: number;
}

export type StudentIntent =
  | 'TOPIC_REQUEST'      // e.g., "Class 10 Physical Science Chapter 2 Boyle's law"
  | 'TOPIC_SWITCH'       // e.g., "এবার চার্লসের সূত্র বোঝাও" or "এবার জীবনবিজ্ঞান পড়াও"
  | 'REPEAT_EXPLANATION' // e.g., "আগের বিষয়টা আরেকবার বুঝিয়ে দাও"
  | 'ANSWER'             // e.g., student answers the checkpoint question
  | 'QUESTION'           // e.g., student asks a question during lesson
  | 'START_NEW_LESSON'   // e.g., "আজ নতুন করে পড়া শুরু করি"
  | 'UNKNOWN';
