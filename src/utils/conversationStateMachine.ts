import { ConversationState, TeachingContextSummary, StudentIntentType, TeachingMode } from '../types/conversation.ts';
import type { NotebookSource } from '../types/notebook.ts';
import { getRandomTopic, resolveWbbseChapter } from '../data/randomTopics.ts';

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
  private askedQuestions: string[] = [];
  private notebookSources: NotebookSource[] = [];
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
    const activeSources = this.notebookSources.filter((s) => s.isActive);
    return {
      ...this.context,
      resumptionHandle: this.resumptionHandle,
      popQuizPending: Boolean(this.context.pendingQuestion),
      turnsCompleted: this.context.turnCount,
      className: this.context.classGrade,
      notebookSources: [...this.notebookSources],
      activeSourcesCount: activeSources.length,
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

  public setTopic(topic: string) {
    this.context.currentTopic = topic;
    this.context.isLessonStarted = true;
    if (!this.context.topicHistory.includes(topic)) {
      this.context.topicHistory.push(topic);
    }
    this.notify();
  }

  public clearTopic() {
    this.context.currentTopic = null;
    this.context.chapter = undefined;
    this.context.isLessonStarted = false;
    this.context.pendingQuestion = undefined;
    this.context.popQuizPending = false;
    this.askedQuestions = [];
    this.notify();
  }

  public getAskedQuestions(): string[] {
    return [...this.askedQuestions];
  }

  public recordAskedQuestion(question: string) {
    if (!question || typeof question !== 'string') return;
    const trimmed = question.trim();
    if (trimmed && !this.askedQuestions.includes(trimmed)) {
      this.askedQuestions.push(trimmed);
    }
  }

  public setNotebookSources(sources: NotebookSource[]) {
    this.notebookSources = [...sources];
    this.notify();
  }

  public addNotebookSource(source: NotebookSource) {
    const existingIdx = this.notebookSources.findIndex((s) => s.id === source.id);
    if (existingIdx !== -1) {
      this.notebookSources[existingIdx] = source;
    } else {
      this.notebookSources.push(source);
    }
    this.notify();
  }

  public removeNotebookSource(id: string) {
    this.notebookSources = this.notebookSources.filter((s) => s.id !== id);
    this.notify();
  }

  public toggleNotebookSource(id: string) {
    const src = this.notebookSources.find((s) => s.id === id);
    if (src) {
      src.isActive = !src.isActive;
      this.notify();
    }
  }

  public getNotebookSources(): NotebookSource[] {
    return [...this.notebookSources];
  }

  public getActiveNotebookSources(): NotebookSource[] {
    return this.notebookSources.filter((s) => s.isActive);
  }

  public isWaitingForStudent(): boolean {
    return this.context.conversationState === 'WAITING_FOR_STUDENT' || Boolean(this.context.pendingQuestion);
  }

  /**
   * Update persona based on prompt content
   */
  public updatePersona(prompt: string) {
    if (prompt.includes('Google NotebookLM') || prompt.includes('গুগল নোটবুক') || prompt.includes('Dedicated Study Knowledge Base')) {
      this.switchPersona('google-notebook', 'Google NotebookLM স্টাডি মেন্টর', 'Google NotebookLM');
    } else if (prompt.includes('অনিমা ম্যাডাম') || prompt.includes('বিজ্ঞান শিক্ষিকা') || prompt.includes('ভৌত+জীবন')) {
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
    this.context.subject = subject || (personaId === 'shreya-maam' ? 'Spoken English' : personaId === 'google-notebook' ? 'Google NotebookLM' : this.context.subject);
    this.context.classGrade = (personaId === 'shreya-maam' || personaId.includes('sir') || personaId === 'google-notebook') ? undefined : this.context.classGrade;
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
    const isNotebook = this.context.personaId === 'google-notebook' || this.context.subject === 'Google NotebookLM';

    // Check for translation request (Bengali to English translation drill)
    const isTranslationRequest =
      !isNotebook && (
        lower.includes('translation') ||
        lower.includes('traslation') ||
        lower.includes('অনুবাদ') ||
        lower.includes('translat') ||
        (lower.includes('bangla') && lower.includes('english')) ||
        (lower.includes('বাংলা') && lower.includes('ইংরেজি')) ||
        lower.includes('tell me in bangla')
      );

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
    if (!isSpokenEnglish && !isCompetitive && !isNotebook) {
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

    // Check for generic topic change request (e.g. "টপিক চেঞ্জ করো", "অন্য টপিক পড়াও", "change topic")
    const isGenericTopicChange =
      lower.includes('topic change') ||
      lower.includes('টপিক চেঞ্জ') ||
      lower.includes('টপিক পরিবর্তন') ||
      lower.includes('change topic') ||
      lower.includes('next topic') ||
      lower.includes('পরের টপিক') ||
      lower.includes('অন্য টপিক') ||
      lower.includes('নতুন টপিক') ||
      lower.includes('অন্য চ্যাপ্টার') ||
      lower.includes('পরের চ্যাপ্টার') ||
      lower.includes('অন্য অধ্যায়') ||
      lower.includes('পরের অধ্যায়') ||
      lower.includes('পরের সোর্স') ||
      lower.includes('অন্য সোর্স');

    let identifiedTopic: string | null = null;

    if (isNotebook) {
      const active = this.notebookSources.filter((s) => s.isActive);
      if (isGenericTopicChange && active.length > 1) {
        const cur = this.context.currentTopic?.replace('নোটবুক: ', '');
        const currentIndex = active.findIndex((s) => s.title === cur);
        const nextSrc = active[(currentIndex + 1) % active.length];
        identifiedTopic = `নোটবুক: ${nextSrc.title}`;
      } else if (!this.context.currentTopic) {
        identifiedTopic = active.length > 0 ? `নোটবুক: ${active[0].title}` : 'গুগল নোটবুক সোর্সেস';
      } else {
        const mentioned = active.find((s) => lower.includes(s.title.toLowerCase()) || (s.title.length > 4 && text.includes(s.title)));
        if (mentioned) {
          identifiedTopic = `নোটবুক: ${mentioned.title}`;
        }
      }
    } else {
      // Extract numbered chapter if student mentions "chapter 3", "ch 3", "ch3", "অধ্যায় ৩", "চ্যাপ্টার ৩", "৩ নম্বর অধ্যায়", etc.
      const chapterNumMatch =
        text.match(/(?:chapter|ch|অধ্যায়|অধ্যায়|চ্যাপ্টার)\s*([0-9]+(?:\.[0-9]+)?|[০-৯]+(?:\.[০-৯]+)?)/i) ||
        text.match(/([0-9]+|[০-৯]+)\s*(?:নম্বর|নং)?\s*(?:অধ্যায়|অধ্যায়|চ্যাপ্টার)/i);

      if (chapterNumMatch && chapterNumMatch[1]) {
        const resolved = resolveWbbseChapter(this.context.classGrade, this.context.subject, chapterNumMatch[1]);
        if (resolved) {
          identifiedTopic = resolved;
          this.context.chapter = `অধ্যায় ${chapterNumMatch[1]}`;
        }
      }

      if (!identifiedTopic && !isSpokenEnglish) {
      if (/জৈব\s*রসায়ন|organic\s*chem|হাইড্রোকার্বন|মিথেন|ইথিলিন|পলিমার/i.test(text)) {
        identifiedTopic = 'জৈব রসায়ন (Organic Chemistry)';
      } else if (/অজৈব\s*রসায়ন|inorganic\s*chem|অ্যামোনিয়া|হাইড্রোজেন সালফাইড/i.test(text)) {
        identifiedTopic = 'অজৈব রসায়ন ও শিল্প প্রস্তুতি';
      } else if (/পর্যায়\s*সারণী|periodic\s*table|মেন্ডেলিফ|অষ্টক নিয়ম/i.test(text)) {
        identifiedTopic = 'পর্যায় সারণী ও রাসায়নিক বন্ধন';
      } else if (/ধাতুবিদ্যা|metallurgy|আকরিক/i.test(text)) {
        identifiedTopic = 'ধাতুবিদ্যা ও আকরিক নিষ্কাশন';
      } else if (/রাসায়নিক\s*গণনা|chemical\s*calculations/i.test(text)) {
        identifiedTopic = 'রাসায়নিক গণনা (Chemical Calculations)';
      } else if (/বংশগতি|মেন্ডেল|জিনগত\s*রোগ/i.test(text)) {
        identifiedTopic = 'বংশগতি এবং কয়েকটি সাধারণ জিনগত রোগ';
      } else if (/অভিব্যক্তি|ডারউইন|অভিযোজন/i.test(text)) {
        identifiedTopic = 'অভিব্যক্তি ও অভিযোজন';
      } else if (/বয়েল|বয়েল|boyle/i.test(text)) {
        identifiedTopic = "Boyle's Law & Gas Behavior";
      } else if (/চার্লস|চার্লসের|charles/i.test(text)) {
        identifiedTopic = "Charles's Law & Absolute Zero";
      } else if (/অ্যাভোগাড্রো|avogadro/i.test(text)) {
        identifiedTopic = "Avogadro's Hypothesis";
      } else if (/কোষ|cell|সালোকসংশ্লেষ|photosynthesis|ডিএনএ|dna|জিন|genetics|মাইটোকনড্রিয়া|প্লাস্টিড/i.test(text)) {
        identifiedTopic = 'Cell Division / Photosynthesis (Life Science)';
      } else if (/(?:^|[\s(])আলোর?(?:[\s),.!?]|$)|optics|light|প্রতিসরণ|প্রতিফলন|দর্পণ|লেন্স|বিচ্ছুরণ/i.test(text) && !/আলোচনা|আলোচিত/i.test(text.replace(/(?:^|[\s(])আলোর?(?:[\s),.!?]|$)/i, ''))) {
        identifiedTopic = 'আলো (Light)';
      } else if (/চলতড়িৎ|চলতড়িৎ|electricity|ওহম|ohm|কারেন্ট|ভোল্টেজ|রোধ/i.test(text)) {
        identifiedTopic = 'চলতড়িৎ (Current Electricity)';
      } else if (/পরমাণু|অণু|আণবিক|পরমাণুর গঠন|রাদারফোর্ড|বোর/i.test(text)) {
        identifiedTopic = 'পরমাণুর গঠন ও রাসায়নিক বন্ধন';
      } else if (/তাপ|তাপমাত্রা|ক্যালোরিমিতি|থার্মোমিটার|সেলসিয়াস|ফারেনহাইট/i.test(text)) {
        identifiedTopic = 'তাপ ও তাপমাত্রা (Heat & Temperature)';
      } else if (/মানবদেহ|ফুসফুস|পরিপাক|রক্তসংবহন|হৃৎপিণ্ড|রক্তের গ্রুপ/i.test(text)) {
        identifiedTopic = 'মানবদেহের প্রধান অঙ্গ ও শারীরস্থান';
      } else if (/বল ও গতি|গতিসূত্র|নিউটনের|ভরবেগ/i.test(text)) {
        identifiedTopic = 'বল ও গতি (Force and Motion)';
      } else if (/সান্দ্রতা|পৃষ্ঠটান|আর্কিমিডিস|প্লাবতা/i.test(text)) {
        identifiedTopic = 'পদার্থের গঠন ও ধর্ম';
      } else if (/শব্দ|প্রতিধ্বনি|সোনার|sonar/i.test(text)) {
        identifiedTopic = 'শব্দ ও তরঙ্গ (Sound & Waves)';
      } else if (/পলাশী|পলাশির|plassey|বক্সার/i.test(text)) {
        identifiedTopic = 'পলাশীর যুদ্ধ (Battle of Plassey)';
      } else if (/মহাবিদ্রোহ|সিপাহী|1857|১৮৫৭/i.test(text)) {
        identifiedTopic = '১৮৫৭-র মহাবিদ্রোহ';
      } else if (/সংবিধান|constitution|মৌলিক\s*অধিকার|fundamental\s*rights|preamble|প্রস্তাবনা|নাগরিকত্ব|রাষ্ট্রপতি|সংসদ/i.test(text)) {
        identifiedTopic = 'Indian Constitution & Fundamental Rights';
      } else if (/অর্থনীতি|economy|rbi|মুদ্রাস্ফীতি|inflation|gdp|জিডিপি|মুদ্রা|ব্যাংক|বাজেট/i.test(text)) {
        identifiedTopic = 'Indian Economy & Banking System';
      } else if (/মুঘল|মোগল|mughal|বাবর|আকবর|সুলতানি|sultanate|মধ্যযুগ/i.test(text)) {
        identifiedTopic = 'Mughal Empire & Medieval India';
      } else if (/সিন্ধু|হরপ্পা|indus|harappa|মহেঞ্জোদাড়ো|মহেঞ্জোদারো/i.test(text)) {
        identifiedTopic = 'Indus Valley Civilization & Ancient India';
      } else if (/নদী|হিমবাহ|বায়ুমণ্ডল|climate|glacier|জলবায়ু|বায়ুপ্রবাহ/i.test(text)) {
        identifiedTopic = 'ভূগোল ও প্রাকৃতিক ভূমিরূপ';
      } else if (/মহাকাশ|ইসরো|isro|চন্দ্রযান|ডিআরডিও|drdo|মিসাইল|পারমাণবিক/i.test(text)) {
        identifiedTopic = 'Science & Technology: ISRO, Space & Nuclear Tech';
      }
    } else if (!identifiedTopic) {
      if (lower.includes('email') || lower.includes('workplace') || lower.includes('business')) {
        identifiedTopic = 'Professional Workplace Email Writing & Polite Business Dialogue';
      } else if (lower.includes('idiom') || lower.includes('phrasal')) {
        identifiedTopic = 'Everyday Idioms & Phrasal Verbs in Smart Conversations';
      } else if (lower.includes('interview') || lower.includes('ইন্টারভিউ') || lower.includes('intro') || lower.includes('introduce')) {
        identifiedTopic = 'Mastering Job Interview Responses: Self Intro & Goals';
      } else if (lower.includes('travel') || lower.includes('flight') || lower.includes('airport') || lower.includes('ভ্রমণ')) {
        identifiedTopic = 'Travel, Airport & Daily Routine Conversation';
      } else if (lower.includes('story') || lower.includes('narrative') || lower.includes('গল্প')) {
        identifiedTopic = 'Story Building & Picture Narrative Drill';
      } else if (lower.includes('hesitation') || lower.includes('fluency') || lower.includes('speaking')) {
        identifiedTopic = 'Overcoming Hesitation & Fast Turn-Taking';
      } else if (lower.includes('grammar') || lower.includes('tense') || lower.includes('টেন্স') || lower.includes('preposition') || lower.includes('ব্যাকরণ')) {
        identifiedTopic = 'Common Grammatical Traps & Tense Flaws';
      }
    }
    }

    // Direct topic extraction if user explicitly says "Topic: X", "Explain X", "Let's study X", "আমার টপিক X", "[Topic] নিয়ে আলোচনা করো", "[Topic] আলোচনা করো", "[Topic] বলো", "[Topic] পড়াও"
    if (!identifiedTopic && !isNotebook) {
      const explicitTopicMatch =
        text.match(/(?:topic|টপিক|বিষয়|বিষয়|chapter|ch|অধ্যায়|অধ্যায়|চ্যাপ্টার|learn|study|explain|পড়াও|পড়ব|পড়বো|আলোচনা\s*করো)\s*[:：\-]?\s*([A-Za-z0-9\s\u0980-\u09FF\-\'’]{2,40})/i) ||
        text.match(/([A-Za-z0-9\s\u0980-\u09FF\-\'’]{2,40})\s*(?:(?:নিয়ে\s*)?আলোচনা(?:\s*করো)?|সম্পর্কে\s*বলো|সম্পর্কে\s*পড়াও|নিয়ে\s*বলো|বোঝাও|পড়াও|পড়ব|পড়বো|নিয়ে\s*পড়াও|শুরু\s*করো)/i);
      if (explicitTopicMatch && explicitTopicMatch[1]) {
        const candidate = explicitTopicMatch[1].trim();
        if (candidate.length >= 2 && !/^(করো|বলো|দাও|হবে|please|now|এবার|এখন|কথা|কি|কী)$/i.test(candidate)) {
          identifiedTopic = candidate;
        }
      }
    }

    // If generic topic change was requested and still no specific topic extracted, pick a random fresh topic
    if (!identifiedTopic && isGenericTopicChange) {
      identifiedTopic = this.pickRandomTopic(this.context.subject, this.context.classGrade);
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
      this.notify();
    }

    const isTopicSwitch = Boolean(
      (previousTopic && identifiedTopic && previousTopic !== identifiedTopic) ||
      identifiedTopic ||
      lower.includes('এবার') ||
      lower.includes('এখন') ||
      lower.includes('পরের') ||
      lower.includes('next') ||
      lower.includes('বলো') ||
      lower.includes('পড়াও') ||
      lower.includes('learn') ||
      lower.includes('teach') ||
      lower.includes('study')
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
    this.context.lastModelOutput = text.slice(-350).trim();

    // Detect if teacher asked a pop-quiz / attention check question
    const isAskingQuestion =
      text.includes('দাঁড়াও! মন দিয়ে শুনছ তো') ||
      text.includes('চটপট উত্তর দাও') ||
      text.includes('একটি প্রশ্নের উত্তর দাও') ||
      text.includes('উত্তর দাও তো দেখি') ||
      text.includes('বলো তো') ||
      (text.includes('?') && (text.includes('কী') || text.includes('কেন') || text.includes('কত') || text.includes('কোন')));

    if (isAskingQuestion) {
      const qText = text.slice(-200).trim();
      this.context.pendingQuestion = qText;
      this.context.popQuizPending = true;
      if (!this.askedQuestions.includes(qText)) {
        this.askedQuestions.push(qText);
      }
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
    this.askedQuestions = [];
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
    const isNotebook = this.context.personaId === 'google-notebook' || this.context.subject === 'Google NotebookLM' || subject === 'Google NotebookLM';
    if (isNotebook) {
      const active = this.notebookSources.filter((s) => s.isActive);
      const topic = active.length > 0 ? `নোটবুক: ${active[0].title}` : 'গুগল নোটবুক সোর্সেস';
      this.context.currentTopic = topic;
      if (!this.context.topicHistory.includes(topic)) {
        this.context.topicHistory.push(topic);
      }
      this.notify();
      return topic;
    }

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

  public setTeachingMode(mode: TeachingMode, classGrade?: string, subject?: string, autoPickTopic: boolean = false) {
    this.context.teachingMode = mode;
    this.context.teachingModeLabel = mode === 'lecture' ? 'আলোচনা' : mode === 'doubts' ? 'AI কে প্রশ্ন' : 'প্রশ্ন উত্তর';
    this.context.classGrade = classGrade;
    this.context.className = classGrade;
    if (subject) {
      this.context.subject = subject;
    }
    if (autoPickTopic && !this.context.currentTopic) {
      this.pickRandomTopic(this.context.subject, this.context.classGrade);
    }
    this.notify();
  }

  public getTeachingModeDirective(): string {
    const mode = this.context.teachingMode || 'lecture';
    const cls = this.context.classGrade || 'WBBSE';
    const subj = this.context.subject || 'বিজ্ঞান';
    const isSpoken = this.context.personaId === 'shreya-maam' || this.context.subject === 'Spoken English';
    const isNotebook = this.context.personaId === 'google-notebook' || this.context.subject === 'Google NotebookLM';
    const isTranslation = this.context.currentTopic?.toLowerCase().includes('translation') || this.context.teachingModeLabel === 'অনুবাদ অনুশীলন';

    if (isNotebook) {
      if (mode === 'lecture') {
        return [
          '【সক্রিয় মোড: গুগল নোটবুক আলোচনা (NOTEBOOK NON-STOP CONTINUOUS TOPIC LECTURE)】',
          '- ছাত্র তার নিজস্ব Google NotebookLM স্টাডি সোর্স (YouTube, PDF, Drive, Image, Notes) থেকে আলোচনা মোড বেছে নিয়েছে।',
          '- শিক্ষক হিসেবে ছাত্রের যুক্ত করা সোর্সের মূল বিষয়বস্তু, বিশ্লেষণ, তত্ত্ব ও পয়েন্ট ধরে একটানা অনর্গল (Non-stop) প্রাঞ্জল বাংলায় বুঝিয়ে যাবে।',
          '- এক বা দুই লাইন বলে থেমে থাকা কঠোরভাবে নিষিদ্ধ। সোর্সের বাইরে গিয়ে অন্য কোনো সাধারণ বা স্কুলের সিলেবাস আলোচনা করা নিষিদ্ধ।',
          '- ছাত্রের মনোযোগ বজায় রাখতে মাঝেমধ্যে সোর্স থেকে আকস্মিক চটপট প্রশ্ন করে মনোযোগ যাচাই করতে পারো।',
        ].join('\n');
      }
      if (mode === 'doubts') {
        return [
          '【সক্রিয় মোড: গুগল নোটবুক AI কে প্রশ্ন (NOTEBOOK DOUBTS & Q&A)】',
          '- ছাত্র তার যুক্ত করা Google NotebookLM সোর্স সম্পর্কে তোমাকে প্রশ্ন করবে।',
          '- শিক্ষক হিসেবে সোর্সের প্রদত্ত তথ্য ও ধারণার ওপর ভিত্তি করে ছাত্রের প্রতিটি প্রশ্নের পুঙ্খানুপুঙ্খ ও প্রাঞ্জল উত্তর বাংলায় বুঝিয়ে দেবে।',
          '- ছাত্রকে তার সোর্স থেকে প্রশ্ন বা সংশয় জিজ্ঞাসা করতে উৎসাহিত করো।',
        ].join('\n');
      }
      // mode === 'quiz'
      return [
        '【সক্রিয় মোড: গুগল নোটবুক প্রশ্ন উত্তর (NOTEBOOK ORAL QUIZ & VIVA)】',
        '- ছাত্র তার নিজস্ব Google NotebookLM স্টাডি সোর্স থেকে মৌখিক কুইজ ও ভাইভা দিতে চায়।',
        '- শিক্ষক হিসেবে শিক্ষার্থীকে তার যুক্ত করা সোর্স (YouTube, PDF, Drive, Image, Notes) থেকে একটি একটি করে গুরুত্বপূর্ণ ধারণাগত প্রশ্ন ও মৌখিক কুইজ ধরবে।',
        '- অন্য কোনো বই বা স্কুলের সিলেবাস থেকে প্রশ্ন করা নিষিদ্ধ! প্রশ্ন শুধুমাত্র ছাত্রের সোর্স থেকেই হতে হবে।',
        '- প্রশ্ন করার পর কথা থামাবে এবং ছাত্রের উত্তরের জন্য অপেক্ষা করবে।',
        '- ছাত্র উত্তর দিলে তা সোর্সের তথ্য অনুসারে মূল্যায়ন করবে (সঠিক হলে প্রশংসা করবে, ভুল হলে ১-২ লাইনে সঠিক তথ্য বুঝিয়ে দেবে), এবং তারপর সোর্স থেকে পরবর্তী সম্পূর্ণ নতুন প্রশ্নটি করবে। পূর্বে করা প্রশ্ন পুনরাবৃত্তি করবে না।',
      ].join('\n');
    }

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
    const activeSources = this.notebookSources.filter((s) => s.isActive);

    if (!this.context.isLessonStarted && !this.context.currentTopic && !this.context.classGrade && activeSources.length === 0) {
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
    if (this.context.lastModelOutput) {
      parts.push(`Teacher's most recent explanation/sentence: "${this.context.lastModelOutput}"`);
    }

    parts.push('\n### ACTIVE MODE INSTRUCTIONS:');
    parts.push(modeDirective);

    if (this.context.pendingQuestion) {
      parts.push(`Teacher was waiting for student's answer to: "${this.context.pendingQuestion}". If student answers, evaluate and continue!`);
    }

    if (this.askedQuestions.length > 0) {
      parts.push('\n### ALREADY ASKED QUESTIONS (STRICT ANTI-REPETITION RULE):');
      parts.push('The following questions have ALREADY been asked in this session. You MUST NEVER repeat or re-ask any of them:');
      this.askedQuestions.slice(-10).forEach((q, idx) => {
        parts.push(`${idx + 1}. "${q}"`);
      });
      parts.push('Mandatory Instruction: Ask a completely fresh, NEW question from this chapter/topic that has NOT been asked yet!');
    }

    if (this.context.personaId === 'google-notebook' || this.context.subject === 'Google NotebookLM') {
      parts.push('\n### 📚 STRICT GOOGLE NOTEBOOKLM EXCLUSIVE GROUNDING DIRECTIVE:');
      parts.push('You are running in DEDICATED GOOGLE NOTEBOOKLM MODE.');
      parts.push('You MUST strictly and EXCLUSIVELY teach, answer questions, or ask quiz questions from the student’s provided notebook sources.');
      parts.push('DO NOT switch to or mention generic WBBSE syllabus or generic competitive exam chapters. Ground 100% of your teaching in the student’s sources below.');
    }

    if (activeSources.length > 0) {
      parts.push('\n### 📚 GOOGLE NOTEBOOKLM VERIFIED SOURCES (STUDY KNOWLEDGE BASE):');
      parts.push('The student has provided the following verified study materials (YouTube, PDF, Drive, Image, Notes). Ground your explanations, questions, and viva in these materials:');
      activeSources.forEach((src, idx) => {
        parts.push(`--- Source ${idx + 1} [Type: ${src.type.toUpperCase()}] ---`);
        parts.push(`Title: "${src.title}"`);
        if (src.summary) {
          parts.push(`Summary: ${src.summary}`);
        }
        if (src.keyPoints && src.keyPoints.length > 0) {
          parts.push(`Key Points: ${src.keyPoints.join('; ')}`);
        }
        if (src.content) {
          const snippet = src.content.slice(0, 1500).replace(/\s+/g, ' ');
          parts.push(`Content Reference: ${snippet}`);
        }
      });
      parts.push('MANDATORY INSTRUCTION: You MUST actively refer to, explain, or quiz the student using these specific notebook sources.');
    }

    parts.push('[END ACTIVE LESSON CONTEXT]\n');
    return parts.join('\n');
  }

  /**
   * Generates a precise continuation prompt after reconnecting so Gemini Live
   * immediately resumes teaching the exact topic, mode, class, and chapter without repeating or greeting.
   */
  public generateReconnectionPrompt(): string {
    const ctx = this.getContext();
    const topic = ctx.currentTopic || (ctx.subject ? `${ctx.subject} পাঠদান` : 'চলমান বিষয়');
    const mode = ctx.teachingMode || 'lecture';
    const lastSaid = ctx.lastModelOutput;
    const isNotebook = ctx.personaId === 'google-notebook' || ctx.subject === 'Google NotebookLM';

    if (isNotebook) {
      if (mode === 'lecture') {
        return `[সেশন রিকানেকশন — নিরবচ্ছিন্ন নোটবুক আলোচনা চালিয়ে যান]: আমরা নোটবুক সোর্স "${topic}" নিয়ে আলোচনা করছিলাম। কোনো প্রাথমিক সম্ভাষণ বা শুভেচ্ছা ("নমস্কার", "হ্যালো" ইত্যাদি) একেবারেই না বলে, যেখানে আলোচনা থেমেছিল সেখান থেকেই পরবর্তী গুরুত্বপূর্ণ পয়েন্ট ও তত্ত্ব অনর্গল বাংলায় একটানা বুঝিয়ে যান।`;
      } else if (mode === 'doubts') {
        return `[সেশন রিকানেকশন — নোটবুক ডাউট সলভ চালু]: আমরা নোটবুক উপাদান "${topic}" নিয়ে আলোচনা করছিলাম। সংযোগ মসৃণভাবে সচল আছে। কোনো কৃত্রিম সম্ভাষণ ছাড়া সংক্ষেপে ১ লাইনে বলুন যে নোটবুক সোর্স থেকে ছাত্রের যেকোনো প্রশ্ন শোনার জন্য আপনি প্রস্তুত।`;
      } else {
        const pendingQ = ctx.pendingQuestion;
        return pendingQ
          ? `[সেশন রিকানেকশন — নোটবুক কুইজের উত্তর গ্রহণ]: আমরা "${topic}" থেকে মৌখিক প্রশ্ন করেছিলাম: "${pendingQ}"। কোনো ভূমিকা ছাড়া স্বাভাবিক কণ্ঠে ছাত্রকে প্রশ্নটির উত্তর দিতে বলুন।`
          : `[সেশন রিকানেকশন — পরবর্তী নোটবুক কুইজ প্রশ্ন]: আমরা "${topic}" থেকে মৌখিক কুইজ নিচ্ছিলাম। কোনো সম্ভাষণ ছাড়া সরাসরি পরবর্তী সম্পূর্ণ নতুন ও গুরুত্বপূর্ণ প্রশ্নটি ছাত্রকে জিজ্ঞাসা করুন।`;
      }
    }

    // WBBSE or Competitive Subjects
    const classLabel = ctx.classGrade ? ` (${ctx.classGrade})` : '';
    const subjName = ctx.subject || '';

    if (mode === 'lecture') {
      const excerpt = lastSaid ? (lastSaid.length > 200 ? lastSaid.slice(0, 190) + '...' : lastSaid) : '';
      const continuationHint = excerpt
        ? `সর্বশেষ ব্যাখ্যা করা হচ্ছিল: "${excerpt}" — ঠিক এখান থেকেই পরবর্তী ধারণা ও পয়েন্ট অনর্গল বাংলায় একটানা বুঝিয়ে যান।`
        : `কোনো ভূমিকা না নিয়ে সরাসরি "${topic}" বিষয়ের পরবর্তী গভীর ও বিশদ তথ্য অনর্গল বাংলায় বুঝিয়ে যান।`;
      return `[সেশন রিকানেকশন — নিরবচ্ছিন্ন পাঠদান অব্যাহত রাখুন]: আমাদের ${subjName}${classLabel} বিষয়ের "${topic}" অধ্যায়ের পাঠদান চলছিল। কোনো প্রাথমিক সম্ভাষণ (যেমন "নমস্কার", "হ্যালো", বা "শুনতে পাচ্ছ") একেবারেই বলবেন না। ${continuationHint}`;
    } else if (mode === 'quiz') {
      const pendingQ = ctx.pendingQuestion;
      return pendingQ
        ? `[সেশন রিকানেকশন — কুইজের উত্তর গ্রহণ]: আমাদের ${subjName}${classLabel} বিষয়ের "${topic}" অধ্যায়ের মৌখিক কুইজ চলছিল। শিক্ষক প্রশ্ন করেছিলেন: "${pendingQ}"। কোনো অপ্রয়োজনীয় ভূমিকা বা সম্ভাষণ ছাড়া স্বাভাবিক কণ্ঠে ছাত্রকে বলুন প্রশ্নটির উত্তর দিতে।`
        : `[সেশন রিকানেকশন — পরবর্তী কুইজ প্রশ্ন]: আমাদের ${subjName}${classLabel} বিষয়ের "${topic}" অধ্যায়ের মৌখিক কুইজ চলছিল। কোনো সম্ভাষণ ছাড়া সরাসরি এই অধ্যায়ের পরবর্তী সম্পূর্ণ নতুন ও গুরুত্বপূর্ণ প্রশ্নটি ছাত্রকে জিজ্ঞাসা করুন।`;
    } else {
      return `[সেশন রিকানেকশন — ডাউট সেশন অব্যাহত]: আমাদের ${subjName}${classLabel} বিষয়ের "${topic}" অধ্যায়ের ডাউট সেশন চলছিল। কোনো প্রাথমিক ভূমিকা বা সম্ভাষণ ছাড়া সংক্ষেপে স্বাভাবিকভাবে বলুন যে আপনি প্রস্তুত এবং ছাত্রকে "${topic}" নিয়ে প্রশ্ন করতে বলুন।`;
    }
  }
}

export const conversationStateMachine = new ConversationStateMachine();
