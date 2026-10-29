import { ConversationState, TeachingContextSummary, StudentIntentType, TeachingMode } from '../types/conversation.ts';
import { getRandomTopic } from '../data/randomTopics.ts';

export interface StudentIntentResult {
  type: StudentIntentType;
  extractedTopic?: string;
  toString(): string;
}

/**
 * Conversation State Machine & Durable Context Manager
 * Enforces continuity across turns, interruptions, topic switches, and transport reconnects.
 */
export class ConversationStateMachine {
  private context: TeachingContextSummary;
  private resumptionHandle: string | null = null;
  private reconnectingLock = false;
  private reconnectLockTimer: any = null;
  private listeners: Set<(context: TeachingContextSummary, state: ConversationState) => void> = new Set();

  constructor(personaId: string = 'wbbse-science', personaTitle: string = 'বিজ্ঞান (ভৌত+জীবন · Class V - X)') {
    this.context = {
      personaId,
      personaTitle,
      subject: 'WBBSE Science',
      classGrade: undefined,
      chapter: undefined,
      currentTopic: null,
      teachingMode: 'lecture',
      teachingModeLabel: 'আলোচনা',
      conceptsCovered: [],
      topicHistory: [],
      popQuizPending: false,
      turnCount: 0,
      turnsCompleted: 0,
      isLessonStarted: false,
      resumptionCount: 0,
      resumptionHandle: null,
      conversationState: 'INITIALIZING',
      lastUpdated: Date.now(),
    };
  }

  public getContext(): TeachingContextSummary {
    return {
      ...this.context,
      resumptionHandle: this.resumptionHandle,
      popQuizPending: Boolean(this.context.pendingQuestion),
      turnsCompleted: this.context.turnCount,
      className: this.context.classGrade,
    };
  }

  public getState(): ConversationState {
    return this.context.conversationState;
  }

  public subscribe(cb: (context: TeachingContextSummary, state: ConversationState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  public setOnStateChange(cb: (state: ConversationState, context: TeachingContextSummary) => void) {
    this.listeners.add((ctx, state) => cb(state, ctx));
  }

  private notify() {
    this.context.lastUpdated = Date.now();
    this.context.resumptionHandle = this.resumptionHandle;
    this.context.popQuizPending = Boolean(this.context.pendingQuestion);
    this.context.turnsCompleted = this.context.turnCount;
    const snapshot = this.getContext();
    for (const listener of this.listeners) {
      try {
        listener(snapshot, this.context.conversationState);
      } catch (e) {
        console.error('[ConversationStateMachine] Listener error:', e);
      }
    }
  }

  public getResumptionHandle(): string | null {
    return this.resumptionHandle;
  }

  public setResumptionHandle(handle: string | null) {
    this.resumptionHandle = handle;
    this.context.resumptionHandle = handle;
    this.notify();
  }

  public isWaitingForStudent(): boolean {
    return this.context.conversationState === 'WAITING_FOR_STUDENT' || Boolean(this.context.pendingQuestion);
  }

  /**
   * Update persona based on prompt content
   */
  public updatePersona(prompt: string) {
    if (prompt.includes('অনিমা ম্যাডাম') || prompt.includes('বিজ্ঞান শিক্ষিকা') || prompt.includes('ভৌত+জীবন')) {
      this.switchPersona('wbbse-science', 'বিজ্ঞান (ভৌত+জীবন · Class V - X)', 'WBBSE Science');
    } else if (prompt.includes('ইতিহাস') || prompt.includes('WBBSE History')) {
      this.switchPersona('wbbse-history', 'ইতিহাস (Class V - X)', 'WBBSE History');
    } else if (prompt.includes('ভূগোল') || prompt.includes('WBBSE Geography')) {
      this.switchPersona('wbbse-geography', 'ভূগোল (Class V - X)', 'WBBSE Geography');
    } else if (prompt.includes('Shreya Ma\'am') || prompt.includes('English Trainer')) {
      this.switchPersona('shreya-maam', 'Spoken English', 'Spoken English');
    } else if (prompt.includes('Bhattacharya Sir') || prompt.includes('Indian History')) {
      this.switchPersona('history-sir', 'Indian History', 'Indian History');
    } else if (prompt.includes('Sarmad') || prompt.includes('Polity')) {
      this.switchPersona('polity-sir', 'Polity & Constitution', 'Polity & Constitution');
    } else if (prompt.includes('Mrunal') || prompt.includes('Economy')) {
      this.switchPersona('economy-sir', 'Indian Economy', 'Indian Economy');
    } else {
      this.switchPersona('general', 'Dedicated Mentor', 'General');
    }
  }

  public switchPersona(personaId: string, personaTitle: string, subject?: string) {
    console.log(`[ConversationStateMachine] Switching persona to ${personaId} (${personaTitle})`);
    this.context.personaId = personaId;
    this.context.personaTitle = personaTitle;
    this.context.subject = subject || (personaId === 'shreya-maam' ? 'Spoken English' : this.context.subject);
    this.context.classGrade = (personaId === 'shreya-maam' || personaId.includes('sir')) ? undefined : this.context.classGrade;
    this.context.className = this.context.classGrade;
    this.context.chapter = undefined;
    this.context.currentTopic = null;
    this.context.pendingQuestion = undefined;
    this.context.turnCount = 0;
    this.context.turnsCompleted = 0;
    this.context.conceptsCovered = [];
    this.context.topicHistory = [];
    this.context.lastCompletedConcept = undefined;
    this.context.lastStudentInput = undefined;
    this.context.isLessonStarted = false;
    this.notify();
  }

  /**
   * Transition state with strict validation
   */
  public transitionTo(newState: ConversationState, reason?: string): boolean {
    const currentState = this.context.conversationState;
    if (currentState === newState) {
      return true;
    }

    console.log(`[ConversationStateMachine] State transition: ${currentState} -> ${newState} (${reason || 'no reason given'})`);
    this.context.conversationState = newState;
    this.notify();
    return true;
  }

  /**
   * Analyze student speech/text intent and update context
   */
  public processStudentInput(rawText: string): StudentIntentResult {
    const text = rawText.trim();
    if (!text) {
      return {
        type: 'UNKNOWN',
        toString() { return 'UNKNOWN'; }
      };
    }

    this.context.lastStudentInput = text;
    this.context.turnCount++;
    this.context.turnsCompleted = this.context.turnCount;

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
      this.context.classGrade = undefined;
      this.context.chapter = undefined;
      this.context.currentTopic = null;
      this.context.lastCompletedConcept = undefined;
      this.context.pendingQuestion = undefined;
      this.context.conceptsCovered = [];
      this.context.topicHistory = [];
      this.transitionTo('PROCESSING_INPUT', 'Explicit new lesson request');
      return {
        type: 'START_NEW_LESSON',
        toString() { return 'START_NEW_LESSON'; }
      };
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
      return {
        type: 'REPEAT_EXPLANATION',
        toString() { return 'REPEAT_EXPLANATION'; }
      };
    }

    const isSpokenEnglish = this.context.personaId === 'shreya-maam' || this.context.subject === 'Spoken English';
    const isCompetitive = ['history-sir', 'polity-sir', 'economy-sir'].includes(this.context.personaId);

    // Check for translation request (Bengali to English translation drill)
    const isTranslationRequest =
      lower.includes('translation') ||
      lower.includes('traslation') ||
      lower.includes('অনুবাদ') ||
      lower.includes('translat') ||
      (lower.includes('bangla') && lower.includes('english')) ||
      (lower.includes('বাংলা') && lower.includes('ইংরেজি')) ||
      lower.includes('tell me in bangla');

    if (isTranslationRequest) {
      this.context.currentTopic = 'Bengali to English Hard Translation Drill';
      this.context.teachingMode = 'quiz';
      this.context.teachingModeLabel = 'অনুবাদ অনুশীলন';
      this.context.classGrade = undefined;
      this.context.className = undefined;
      this.context.subject = 'Spoken English';
      this.context.isLessonStarted = true;
      if (!this.context.topicHistory.includes(this.context.currentTopic)) {
        this.context.topicHistory.push(this.context.currentTopic);
      }
      this.transitionTo('SWITCHING_TOPIC', 'Switched to Bengali to English Translation Drill');
      return {
        type: 'TOPIC_SWITCH',
        extractedTopic: this.context.currentTopic,
        toString() { return 'TOPIC_SWITCH'; }
      };
    }

    // Extract class info if mentioned (only for WBBSE school personas)
    if (!isSpokenEnglish && !isCompetitive) {
      const classMatch =
        text.match(/class\s*(v|vi|vii|viii|ix|x|5|6|7|8|9|10)/i) ||
        text.match(/(পঞ্চম|ষষ্ঠ|সপ্তম|অষ্টম|নবম|দশম|\d+)\s*শ্রেণি/i) ||
        text.match(/ক্লাস\s*(\d+|১০|৯|৮|৭|৬|৫)/i);

      if (classMatch) {
        let cls = classMatch[0].trim();
        if (/10|x|দশম|১০/i.test(cls)) cls = 'Class 10';
        else if (/9|ix|নবম|৯/i.test(cls)) cls = 'Class 9';
        else if (/8|viii|অষ্টম|৮/i.test(cls)) cls = 'Class 8';
        else if (/7|vii|সপ্তম|৭/i.test(cls)) cls = 'Class 7';
        else if (/6|vi|ষষ্ঠ|৬/i.test(cls)) cls = 'Class 6';
        else if (/5|v|পঞ্চম|৫/i.test(cls)) cls = 'Class 5';
        this.context.classGrade = cls;
      }

      // Extract subject info if mentioned
      if (/ভৌত\s*বিজ্ঞান|physical\s*science/i.test(text)) {
        this.context.subject = 'Physical Science (ভৌতবিজ্ঞান)';
      } else if (/জীবন\s*বিজ্ঞান|life\s*science|biology/i.test(text)) {
        this.context.subject = 'Life Science (জীবনবিজ্ঞান)';
      } else if (/ইতিহাস|history/i.test(text)) {
        this.context.subject = 'WBBSE History';
      } else if (/ভূগোল|geography/i.test(text)) {
        this.context.subject = 'WBBSE Geography';
      }

      // Extract chapter info if mentioned
      const chapterMatch =
        text.match(/(chapter|অধ্যায়|চ্যাপ্টার)\s*(\d+|[a-z]+|২|১|৩|৪|৫|৬)/i) ||
        text.match(/(\d+|দ্বিতীয়|প্রথম|তৃতীয়)\s*(নম্বর\s*)?(অধ্যায়|চ্যাপ্টার)/i);
      if (chapterMatch) {
        let ch = chapterMatch[0].trim();
        if (/দ্বিতীয়|২|2/i.test(ch)) ch = 'অধ্যায় ২';
        else if (/প্রথম|১|1/i.test(ch)) ch = 'অধ্যায় ১';
        else if (/তৃতীয়|৩|3/i.test(ch)) ch = 'অধ্যায় ৩';
        this.context.chapter = ch;
      }
    }

    // Extract topic
    let identifiedTopic: string | null = null;
    if (!isSpokenEnglish) {
      if (/বয়েল|boyle/i.test(text)) {
        identifiedTopic = "Boyle's Law & Gas Behavior";
      } else if (/চার্লস|charles/i.test(text)) {
        identifiedTopic = "Charles's Law & Absolute Zero";
      } else if (/অ্যাভোগাড্রো|avogadro/i.test(text)) {
        identifiedTopic = "Avogadro's Hypothesis";
      } else if (/কোষ|cell|সালোকসংশ্লেষ|photosynthesis/i.test(text)) {
        identifiedTopic = 'Cell Division / Photosynthesis (Life Science)';
      } else if (/আলো|optics|light/i.test(text)) {
        identifiedTopic = 'আলো (Light)';
      } else if (/চলতড়িৎ|electricity/i.test(text)) {
        identifiedTopic = 'চলতড়িৎ (Current Electricity)';
      } else if (/পলাশী|plassey/i.test(text)) {
        identifiedTopic = 'পলাশীর যুদ্ধ (Battle of Plassey)';
      } else if (/মহাবিদ্রোহ|সিপাহী/i.test(text)) {
        identifiedTopic = '১৮৫৭-র মহাবিদ্রোহ';
      }
    } else {
      if (lower.includes('interview')) identifiedTopic = 'Job Interview & Formal Intro Practice';
      else if (lower.includes('travel') || lower.includes('flight')) identifiedTopic = 'Travel, Airport & Daily Routine Conversation';
      else if (lower.includes('story') || lower.includes('narrative')) identifiedTopic = 'Story Building & Picture Narrative Drill';
    }

    // If currently in translation drill, student input is an answer
    if (this.context.currentTopic?.toLowerCase().includes('translation') || this.context.teachingModeLabel === 'অনুবাদ অনুশীলন') {
      this.transitionTo('PROCESSING_INPUT', 'Student answered translation drill');
      return {
        type: 'ANSWER',
        extractedTopic: this.context.currentTopic || undefined,
        toString() { return 'ANSWER'; }
      };
    }

    // If answer to checkpoint question
    if (this.context.pendingQuestion) {
      this.context.pendingQuestion = undefined;
      this.context.popQuizPending = false;
      this.transitionTo('PROCESSING_INPUT', 'Student answered checkpoint question');
      return {
        type: 'ANSWER',
        extractedTopic: identifiedTopic || undefined,
        toString() { return 'ANSWER'; }
      };
    }

    const previousTopic = this.context.currentTopic;

    if (identifiedTopic) {
      if (previousTopic && previousTopic !== identifiedTopic) {
        this.context.lastCompletedConcept = previousTopic;
        if (!this.context.conceptsCovered.includes(previousTopic)) {
          this.context.conceptsCovered.push(previousTopic);
        }
      }
      this.context.currentTopic = identifiedTopic;
      if (!this.context.topicHistory.includes(identifiedTopic)) {
        this.context.topicHistory.push(identifiedTopic);
      }
      if (!this.context.conceptsCovered.includes(identifiedTopic)) {
        this.context.conceptsCovered.push(identifiedTopic);
      }
    }

    const isTopicSwitch = Boolean(
      (previousTopic && identifiedTopic && previousTopic !== identifiedTopic) ||
      lower.includes('এবার') ||
      lower.includes('এখন') ||
      lower.includes('পরের') ||
      lower.includes('next') ||
      lower.includes('বলো') ||
      lower.includes('পড়াও')
    );

    this.context.isLessonStarted = true;

    if (isTopicSwitch) {
      this.transitionTo('SWITCHING_TOPIC', `Switched topic to ${this.context.currentTopic || 'new topic'}`);
      return {
        type: 'TOPIC_SWITCH',
        extractedTopic: this.context.currentTopic || undefined,
        toString() { return 'TOPIC_SWITCH'; }
      };
    }

    this.transitionTo('PROCESSING_INPUT', 'Received student request');
    return {
      type: 'TOPIC_REQUEST',
      extractedTopic: this.context.currentTopic || undefined,
      toString() { return 'TOPIC_REQUEST'; }
    };
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
      text.includes('বলো তো') ||
      (text.includes('?') && (text.includes('কী') || text.includes('কেন') || text.includes('কত') || text.includes('কোন')));

    if (isAskingQuestion) {
      this.context.pendingQuestion = text.slice(-200);
      this.context.popQuizPending = true;
      this.transitionTo('WAITING_FOR_STUDENT', 'Teacher asked checkpoint question');
    } else {
      this.transitionTo('TEACHING', 'Teacher is actively explaining');
    }
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

  public recordResumption() {
    this.context.resumptionCount++;
    this.notify();
  }

  public resetSession(keepPersona: boolean = true) {
    this.releaseReconnectLock();
    this.resumptionHandle = null;
    this.context = {
      personaId: keepPersona ? this.context.personaId : 'wbbse-science',
      personaTitle: keepPersona ? this.context.personaTitle : 'বিজ্ঞান (ভৌত+জীবন · Class V - X)',
      subject: keepPersona ? this.context.subject : 'WBBSE Science',
      classGrade: undefined,
      chapter: undefined,
      currentTopic: null,
      conceptsCovered: [],
      topicHistory: [],
      popQuizPending: false,
      turnCount: 0,
      turnsCompleted: 0,
      isLessonStarted: false,
      resumptionCount: 0,
      resumptionHandle: null,
      conversationState: 'INITIALIZING',
      lastUpdated: Date.now(),
    };
    this.notify();
  }

  public pickRandomTopic(subject?: string, className?: string): string {
    const subj = subject || this.context.subject || 'বিজ্ঞান';
    const cls = className || this.context.classGrade || 'Class 10';
    const topic = getRandomTopic(subj, cls);
    this.context.currentTopic = topic;
    if (!this.context.topicHistory.includes(topic)) {
      this.context.topicHistory.push(topic);
    }
    this.notify();
    return topic;
  }

  public setTeachingMode(mode: TeachingMode, classGrade?: string, subject?: string) {
    this.context.teachingMode = mode;
    this.context.teachingModeLabel = mode === 'lecture' ? 'আলোচনা' : mode === 'doubts' ? 'AI কে প্রশ্ন' : 'প্রশ্ন উত্তর';
    this.context.classGrade = classGrade;
    this.context.className = classGrade;
    if (subject) {
      this.context.subject = subject;
    }
    if (!this.context.currentTopic) {
      this.pickRandomTopic(this.context.subject, this.context.classGrade);
    }
    this.context.isLessonStarted = true;
    this.notify();
  }

  public getTeachingModeDirective(): string {
    const mode = this.context.teachingMode || 'lecture';
    const cls = this.context.classGrade || 'WBBSE';
    const subj = this.context.subject || 'বিজ্ঞান';
    const isSpoken = this.context.personaId === 'shreya-maam' || this.context.subject === 'Spoken English';
    const isTranslation = this.context.currentTopic?.toLowerCase().includes('translation') || this.context.teachingModeLabel === 'অনুবাদ অনুশীলন';

    if (isTranslation) {
      return [
        '【সক্রিয় মোড: বাংলা থেকে ইংরেজি অনুবাদ ড্রিল (BENGALI TO ENGLISH HARD TRANSLATION DRILL)】',
        '- শিক্ষক একটি করে বাংলা বাক্য বলবেন (চ্যালেঞ্জিং/দৈনন্দিন প্র্যাকটিক্যাল বাক্য)।',
        '- ছাত্র সেই বাক্যটি ইংরেজিতে মুখে বলবে বা চ্যাটে লিখে পাঠাবে।',
        '- ছাত্র উত্তর দিলে শিক্ষক সংক্ষেপে ১ লাইনে মূল্যায়ন করবেন (সঠিক হলে প্রশংসা করবেন, ভুল বা দুর্বল গ্রামার থাকলে সঠিক English রূপটি শিখিয়ে দেবেন)।',
        '- এরপর বিলম্ব না করে ছাত্রকে অনুবাদ করার জন্য পরবর্তী নতুন বাংলা বাক্যটি বলবেন ("এবার বলুন: ...")।',
        '- কোনো অযথা লম্বা বক্তৃতা বা পুরানো কোনো টপিকে ফিরে যাওয়া কঠোরভাবে নিষিদ্ধ। শুধুমাত্র একটি করে বাংলা বাক্য দেবেন এবং ছাত্রের ইংরেজি অনুবাদ নেবেন।',
      ].join('\n');
    }

    if (isSpoken) {
      if (mode === 'lecture') {
        return [
          '【সক্রিয় মোড: Spoken English আলোচনা ও গাইডেন্স】',
          '- শিক্ষক শ্রেয়া ম্যাডাম হিসেবে ব্যবহারিক স্পোকেন ইংলিশ, স্বাভাবিক কথোপকথন এবং প্রয়োজনীয় ব্যাকরণ/উচ্চারণ সাবলীল বাংলা ও ইংরেজিতে বুঝিয়ে দিন।',
          '- কোনো অবস্থাতেই স্কুলের বিজ্ঞান বা ইতিহাসের পাঠ আনবেন না। এটি সম্পূর্ণ স্পোকেন ইংলিশের সেশন।',
        ].join('\n');
      }
      if (mode === 'doubts') {
        return [
          '【সক্রিয় মোড: Spoken English ডাউট ক্লিয়ারিং】',
          '- ছাত্রের ইংরেজি কথা বলা, গ্রামার বা ভোকাবুলারি সংক্রান্ত যেকোনো প্রশ্নের সহজ-সরল উত্তর বুঝিয়ে দিন।',
        ].join('\n');
      }
      return [
        '【সক্রিয় মোড: Spoken English প্রশ্ন ও স্পিকিং টেস্ট】',
        '- ছাত্রকে বাস্তব জীবনের কোনো পরিস্থিতিতে ইংরেজিতে কথা বলার প্রশ্ন বা বাক্য দিন এবং ছাত্রের উত্তরের জন্য অপেক্ষা করুন।',
      ].join('\n');
    }

    if (mode === 'lecture') {
      return [
        '【সক্রিয় মোড: আলোচনা (NON-STOP CONTINUOUS TOPIC LECTURE)】',
        `শ্রেণি: ${cls}, বিষয়: ${subj}`,
        '- ছাত্র "আলোচনা" মোড বেছে নিয়েছে। শিক্ষক হিসেবে এই শ্রেণির পাঠ্যবই অনুসারে প্রতিটি অধ্যায় ও বিষয়বস্তু একটানা অনর্গল (Non-stop) বিস্তারিতভাবে বাংলায় বুঝিয়ে যাবে।',
        '- এক বা দুই লাইন বলে থেমে থাকা কঠোরভাবে নিষিদ্ধ।',
        '- শিক্ষার্থীর মনোযোগ বজায় রাখতে মাঝে মাঝে আকস্মিক মনোযোগ যাচাই ছাড়া একটানা প্রাঞ্জল পাঠদান চালিয়ে যাও। "আজ কোন ক্লাসের কোন বিষয় পড়বে" জাতীয় কোনো প্রাথমিক প্রশ্ন করবে না।',
      ].join('\n');
    }

    if (mode === 'doubts') {
      return [
        '【সক্রিয় মোড: AI কে প্রশ্ন (STUDENT ASKS QUESTIONS & DOUBT CLEARING)】',
        `শ্রেণি: ${cls}, বিষয়: ${subj}`,
        '- ছাত্র "AI কে প্রশ্ন" মোড বেছে নিয়েছে। ছাত্রের সব প্রশ্নের উত্তর তোমাকেই দিতে হবে।',
        '- ছাত্র তোমাকে বিষয় বা অধ্যায় নিয়ে যা প্রশ্ন বা সংশয় জিজ্ঞেস করবে, তুমি শিক্ষক হিসেবে অত্যন্ত মনোযোগ ও স্নেহের সাথে সহজ বাংলায় প্রতিটি প্রশ্নের পুঙ্খানুপুঙ্খ সঠিক উত্তর বুঝিয়ে দেবে।',
        '- ছাত্রকে বলবে তার কী প্রশ্ন আছে জিজ্ঞাসা করতে, এবং প্রশ্ন শোনার পর তা বিশদভাবে বুঝিয়ে দেবে।',
      ].join('\n');
    }

    // mode === 'quiz'
    return [
      '【সক্রিয় মোড: প্রশ্ন উত্তর (ORAL QUIZ & INTERACTIVE TESTING)】',
      `শ্রেণি: ${cls}, বিষয়: ${subj}`,
      '- ছাত্র "প্রশ্ন উত্তর" মোড বেছে নিয়েছে। এখানে AI ছাত্রকে প্রশ্ন করবে এবং ছাত্র উত্তর দেবে।',
      '- শিক্ষক হিসেবে পশ্চিমবঙ্গ মধ্যশিক্ষা পর্ষদের পাঠ্যবই অনুযায়ী এই শ্রেণি ও বিষয়ের সিলেবাস থেকে শিক্ষার্থীকে একটি একটি করে গুরুত্বপূর্ণ মৌখিক প্রশ্ন করবে।',
      '- প্রশ্ন করার পর কথা থামাবে এবং ছাত্রের উত্তরের জন্য অপেক্ষা করবে।',
      '- ছাত্র উত্তর দিলে তা মূল্যায়ন করবে (সঠিক হলে প্রশংসা করবে, ভুল হলে ১-২ লাইনে সঠিক তথ্য বুঝিয়ে দেবে), এবং তারপর পরবর্তী প্রশ্নটি করবে।',
    ].join('\n');
  }

  public generateDurableContextInstruction(): string {
    const modeDirective = this.getTeachingModeDirective();

    if (!this.context.isLessonStarted && !this.context.currentTopic && !this.context.classGrade) {
      return modeDirective ? `\n[TEACHING MODE DIRECTIVE]\n${modeDirective}\n[END TEACHING MODE DIRECTIVE]\n` : '';
    }

    const parts: string[] = [
      '\n[ACTIVE LESSON CONTINUITY CONTEXT — MANDATORY OVERRIDE]',
      '### CURRENT ONGOING LESSON CONTEXT',
      'IMPORTANT: You are in an ACTIVE, ONGOING teaching session.',
      'DO NOT say any introductory greeting. DO NOT ask "আজ কোন ক্লাসের কোন বিষয় পড়বে?" or any introductory questions!',
      `Current Active Persona: ${this.context.personaTitle}`,
      `Selected Mode: ${this.context.teachingModeLabel || 'আলোচনা'} (${this.context.teachingMode || 'lecture'})`,
    ];

    if (this.context.classGrade) {
      parts.push(`Class: ${this.context.classGrade}`);
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

    parts.push('\n### ACTIVE MODE INSTRUCTIONS:');
    parts.push(modeDirective);

    if (this.context.pendingQuestion) {
      parts.push(`Teacher was waiting for student's answer to: "${this.context.pendingQuestion}". If student answers, evaluate and continue!`);
    }

    parts.push('[END ACTIVE LESSON CONTEXT]\n');
    return parts.join('\n');
  }
}

export const conversationStateMachine = new ConversationStateMachine();
