import { ConversationState, TeachingContextSummary, StudentIntent } from '../types/conversation.ts';

/**
 * Conversation State Machine & Durable Context Manager
 * Enforces continuity across turns, interruptions, topic switches, and transport reconnects.
 */
export class ConversationStateMachine {
  private context: TeachingContextSummary;
  private reconnectingLock = false;
  private reconnectLockTimer: any = null;
  private onStateChangeCallback: ((state: ConversationState, context: TeachingContextSummary) => void) | null = null;

  constructor(personaId: string = 'wbbse-science', personaTitle: string = 'বিজ্ঞান (ভৌত+জীবন · Class V - X)') {
    this.context = {
      personaId,
      personaTitle,
      conversationState: 'INITIALIZING',
      conceptsCovered: [],
      turnCount: 0,
      isLessonStarted: false,
      resumptionCount: 0,
      lastUpdated: Date.now(),
    };
  }

  public getContext(): TeachingContextSummary {
    return { ...this.context };
  }

  public getState(): ConversationState {
    return this.context.conversationState;
  }

  public setOnStateChange(cb: (state: ConversationState, context: TeachingContextSummary) => void) {
    this.onStateChangeCallback = cb;
  }

  private notify() {
    this.context.lastUpdated = Date.now();
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(this.context.conversationState, { ...this.context });
    }
  }

  /**
   * Transition state with strict validation
   */
  public transitionTo(newState: ConversationState, reason?: string): boolean {
    const currentState = this.context.conversationState;
    if (currentState === newState) {
      return true;
    }

    // Rules:
    // 1. RECONNECTING should not wipe lesson context
    // 2. ERROR can be entered from any state
    // 3. READY -> TEACHING / PROCESSING_INPUT
    console.log(`[ConversationStateMachine] State transition: ${currentState} -> ${newState} (${reason || 'no reason given'})`);

    this.context.conversationState = newState;
    this.notify();
    return true;
  }

  /**
   * Analyze student speech/text intent and update context
   */
  public processStudentInput(rawText: string): StudentIntent {
    const text = rawText.trim();
    if (!text) return 'UNKNOWN';

    this.context.lastStudentInput = text;
    this.context.turnCount++;

    const lower = text.toLowerCase();

    // Check for explicit new lesson request
    const isExplicitNewLesson =
      lower.includes('নতুন করে পড়া শুরু') ||
      lower.includes('নতুন ক্লাস শুরু') ||
      lower.includes('শুরু থেকে পড়াও') ||
      lower.includes('start a fresh lesson') ||
      lower.includes('new session') ||
      lower.includes('notun kore pora');

    if (isExplicitNewLesson) {
      this.context.isLessonStarted = false;
      this.context.className = undefined;
      this.context.subject = undefined;
      this.context.chapter = undefined;
      this.context.currentTopic = undefined;
      this.context.lastCompletedConcept = undefined;
      this.context.pendingQuestion = undefined;
      this.context.conceptsCovered = [];
      this.transitionTo('PROCESSING_INPUT', 'Explicit new lesson request');
      return 'START_NEW_LESSON';
    }

    // Check for re-explanation request
    const isRepeatRequest =
      lower.includes('আগের বিষয়টা আরেকবার') ||
      lower.includes('আগেরটা আবার') ||
      lower.includes('আর একবার বোঝাও') ||
      lower.includes('আগেরটা বুঝিনি') ||
      lower.includes('repeat that') ||
      lower.includes('explain again');

    if (isRepeatRequest) {
      this.transitionTo('PROCESSING_INPUT', 'Repeat previous explanation');
      return 'REPEAT_EXPLANATION';
    }

    // Extract class information if mentioned
    const classMatch =
      text.match(/class\s*(v|vi|vii|viii|ix|x|5|6|7|8|9|10)/i) ||
      text.match(/(পঞ্চম|ষষ্ঠ|সপ্তম|অষ্টম|নবম|দশম|\d+)\s*শ্রেণি/i);
    if (classMatch) {
      let cls = classMatch[0].trim();
      if (/10|x|দশম/i.test(cls)) cls = 'Class 10';
      else if (/9|ix|নবম/i.test(cls)) cls = 'Class 9';
      else if (/8|viii|অষ্টম/i.test(cls)) cls = 'Class 8';
      else if (/7|vii|সপ্তম/i.test(cls)) cls = 'Class 7';
      else if (/6|vi|ষষ্ঠ/i.test(cls)) cls = 'Class 6';
      else if (/5|v|পঞ্চম/i.test(cls)) cls = 'Class 5';
      this.context.className = cls;
    }

    // Extract subject info if mentioned
    if (/ভৌতবিজ্ঞান|physical\s*science/i.test(text)) {
      this.context.subject = 'Physical Science (ভৌতবিজ্ঞান)';
    } else if (/জীবনবিজ্ঞান|life\s*science|biology/i.test(text)) {
      this.context.subject = 'Life Science (জীবনবিজ্ঞান)';
    } else if (/ইতিহাস|history/i.test(text)) {
      this.context.subject = 'History (ইতিহাস)';
    } else if (/ভূগোল|geography/i.test(text)) {
      this.context.subject = 'Geography (ভূগোল)';
    } else if (/polity|সংবিধান/i.test(text)) {
      this.context.subject = 'Polity & Constitution';
    } else if (/economy|অর্থনীতি/i.test(text)) {
      this.context.subject = 'Indian Economy';
    }

    // Extract chapter info if mentioned
    const chapterMatch =
      text.match(/(chapter|অধ্যায়|চ্যাপ্টার)\s*(\d+|[a-z]+)/i) ||
      text.match(/(\d+)\s*নম্বর\s*(অধ্যায়|চ্যাপ্টার)/i);
    if (chapterMatch) {
      this.context.chapter = chapterMatch[0].trim();
    }

    // Check for topic switch within ongoing conversation
    const isTopicSwitch =
      lower.includes('এবার') ||
      lower.includes('এখন') ||
      lower.includes('পরের') ||
      lower.includes('next') ||
      lower.includes('switch to') ||
      (this.context.isLessonStarted && (Boolean(classMatch) || Boolean(chapterMatch) || lower.includes('বোঝাও') || lower.includes('পড়াও') || lower.includes('explain')));

    // Extract potential topic
    let identifiedTopic = '';
    if (/বয়েল|boyle/i.test(text)) identifiedTopic = "বয়েলের সূত্র (Boyle's Law)";
    else if (/চার্লস|charles/i.test(text)) identifiedTopic = "চার্লসের সূত্র (Charles's Law)";
    else if (/অ্যাভোগাড্রো|avogadro/i.test(text)) identifiedTopic = "অ্যাভোগাড্রো সূত্র (Avogadro's Hypothesis)";
    else if (/গ্যাসের আচরণ|behavior of gases/i.test(text)) identifiedTopic = 'গ্যাসের আচরণ';
    else if (/আলো|optics|light/i.test(text)) identifiedTopic = 'আলো (Light)';
    else if (/চলতড়িৎ|current electricity/i.test(text)) identifiedTopic = 'চলতড়িৎ (Current Electricity)';
    else if (/কোষ|cell/i.test(text)) identifiedTopic = 'কোষ ও কোষীয় অঙ্গাণু (Cell Biology)';
    else if (/সালোকসংশ্লেষ|photosynthesis/i.test(text)) identifiedTopic = 'সালোকসংশ্লেষ (Photosynthesis)';
    else if (/হরমোন|hormone/i.test(text)) identifiedTopic = 'হরমোন (Hormones)';
    else if (/পলাশীর যুদ্ধ|battle of plassey/i.test(text)) identifiedTopic = 'পলাশীর যুদ্ধ (Battle of Plassey)';
    else if (/সিপাহী বিদ্রোহ|মহাবিদ্রোহ|1857/i.test(text)) identifiedTopic = '১৮৫৭-র মহাবিদ্রোহ';
    else if (/হিমালয়|himalayas/i.test(text)) identifiedTopic = 'হিমালয় পর্বতের ভূপ্রকৃতি';

    if (identifiedTopic) {
      if (this.context.currentTopic && this.context.currentTopic !== identifiedTopic) {
        this.context.lastCompletedConcept = this.context.currentTopic;
        if (!this.context.conceptsCovered.includes(this.context.currentTopic)) {
          this.context.conceptsCovered.push(this.context.currentTopic);
        }
      }
      this.context.currentTopic = identifiedTopic;
    }

    if (this.context.pendingQuestion) {
      // Student is answering the pending question
      this.context.pendingQuestion = undefined;
      this.transitionTo('PROCESSING_INPUT', 'Student answered checkpoint question');
      return 'ANSWER';
    }

    if (isTopicSwitch && this.context.isLessonStarted) {
      this.transitionTo('SWITCHING_TOPIC', `Switched topic to ${this.context.currentTopic || 'new topic'}`);
      return 'TOPIC_SWITCH';
    }

    // Mark lesson as started
    this.context.isLessonStarted = true;
    this.transitionTo('PROCESSING_INPUT', 'Received student request');
    return 'TOPIC_REQUEST';
  }

  /**
   * Process model speech/transcript
   */
  public processModelOutput(text: string) {
    if (!text) return;
    this.context.isLessonStarted = true;

    // Detect if teacher asked a pop-quiz / attention check question
    const isAskingQuestion =
      text.includes('দাঁড়াও! মন দিয়ে শুনছ তো') ||
      text.includes('চটপট উত্তর দাও') ||
      text.includes('একটি প্রশ্নের উত্তর দাও') ||
      text.includes('উত্তর দাও তো দেখি') ||
      (text.includes('?') && (text.includes('কী') || text.includes('কেন') || text.includes('বল')));

    if (isAskingQuestion) {
      this.context.pendingQuestion = text.slice(-200);
      this.transitionTo('WAITING_FOR_STUDENT', 'Teacher asked checkpoint question');
    } else {
      this.transitionTo('TEACHING', 'Teacher is actively explaining');
    }
  }

  /**
   * Switch teacher persona
   */
  public switchPersona(personaId: string, personaTitle: string) {
    console.log(`[ConversationStateMachine] Switching persona to ${personaId} (${personaTitle})`);
    this.context.personaId = personaId;
    this.context.personaTitle = personaTitle;
    this.context.pendingQuestion = undefined;
    // Don't wipe class/subject if student already stated them, but update state
    this.notify();
  }

  /**
   * Acquire atomic reconnection lock to prevent duplicate concurrent reconnect attempts
   */
  public acquireReconnectLock(timeoutMs: number = 5000): boolean {
    if (this.reconnectingLock) {
      console.warn('[ConversationStateMachine] Reconnection already in progress. Rejecting duplicate attempt.');
      return false;
    }
    this.reconnectingLock = true;
    this.transitionTo('RECONNECTING', 'Acquired reconnect lock');

    if (this.reconnectLockTimer) {
      clearTimeout(this.reconnectLockTimer);
    }
    this.reconnectLockTimer = setTimeout(() => {
      this.releaseReconnectLock();
    }, timeoutMs);

    return true;
  }

  public releaseReconnectLock() {
    this.reconnectingLock = false;
    if (this.reconnectLockTimer) {
      clearTimeout(this.reconnectLockTimer);
      this.reconnectLockTimer = null;
    }
    if (this.context.conversationState === 'RECONNECTING') {
      this.transitionTo(this.context.isLessonStarted ? 'TEACHING' : 'READY', 'Released reconnect lock');
    }
  }

  public isReconnecting(): boolean {
    return this.reconnectingLock;
  }

  /**
   * Increment resumption counter
   */
  public recordResumption() {
    this.context.resumptionCount++;
    this.notify();
  }

  /**
   * Reset session cleanly on explicit user stop or explicit new lesson
   */
  public resetSession(keepPersona: boolean = true) {
    this.releaseReconnectLock();
    this.context = {
      personaId: keepPersona ? this.context.personaId : 'wbbse-science',
      personaTitle: keepPersona ? this.context.personaTitle : 'বিজ্ঞান (ভৌত+জীবন · Class V - X)',
      conversationState: 'INITIALIZING',
      conceptsCovered: [],
      turnCount: 0,
      isLessonStarted: false,
      resumptionCount: 0,
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  /**
   * Generate durable context directive for systemInstruction injection.
   * Ensures Gemini continues seamlessly even if native session resumption handle was expired/rejected!
   */
  public generateDurableContextInstruction(): string {
    if (!this.context.isLessonStarted) {
      return '';
    }

    const parts: string[] = [
      '\n[ACTIVE LESSON CONTINUITY CONTEXT — MANDATORY OVERRIDE]',
      'IMPORTANT: You are in an ACTIVE, ONGOING teaching session that was seamlessly reconnected or resumed.',
      'DO NOT introduce yourself. DO NOT ask "আজ কোন ক্লাসের কোন বিষয় পড়বে?" or any introductory questions!',
      `Current Active Persona: ${this.context.personaTitle}`,
    ];

    if (this.context.className) {
      parts.push(`Class: ${this.context.className}`);
    }
    if (this.context.subject) {
      parts.push(`Subject: ${this.context.subject}`);
    }
    if (this.context.chapter) {
      parts.push(`Chapter: ${this.context.chapter}`);
    }
    if (this.context.currentTopic) {
      parts.push(`Active Topic to teach: ${this.context.currentTopic}`);
    }
    if (this.context.lastCompletedConcept) {
      parts.push(`Last Completed Concept: ${this.context.lastCompletedConcept}`);
    }
    if (this.context.conceptsCovered.length > 0) {
      parts.push(`Concepts already explained in this session: ${this.context.conceptsCovered.join(', ')}`);
    }
    if (this.context.lastStudentInput) {
      parts.push(`Student's most recent statement/question: "${this.context.lastStudentInput}"`);
    }

    if (this.context.pendingQuestion) {
      parts.push(`Teacher was waiting for student's answer to: "${this.context.pendingQuestion}". If student answers, evaluate and continue non-stop!`);
    } else {
      parts.push('Directive: Proceed directly with deep, continuous non-stop explanation of the active topic in fluent Bengali.');
    }

    parts.push('[END ACTIVE LESSON CONTEXT]\n');
    return parts.join('\n');
  }
}
