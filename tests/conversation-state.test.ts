import test from 'node:test';
import assert from 'node:assert/strict';
import { ConversationStateMachine } from '../src/utils/conversationStateMachine.ts';
import {
  WBBSE_SCIENCE_PROMPT,
  WBBSE_HISTORY_PROMPT,
  SHREYA_MAAM_PROMPT,
  NON_STOP_TEACHING_SYSTEM_RULE,
} from '../src/data/teacherPersonas.ts';

test('Scenario A: Fresh session initialization with default empty context', () => {
  const sm = new ConversationStateMachine();
  assert.equal(sm.getState(), 'INITIALIZING');
  sm.transitionTo('READY');
  assert.equal(sm.getState(), 'READY');

  const ctx = sm.getContext();
  assert.equal(ctx.currentTopic, null);
  assert.equal(ctx.turnsCompleted, 0);
  assert.equal(ctx.popQuizPending, false);
});

test('Scenario B: Topic extraction and continuity (Boyle\'s Law and Charles\'s Law)', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.transitionTo('READY');

  // Student asks for Class 10 Physical Science Boyle's Law
  const intent1 = sm.processStudentInput("ক্লাস ১০ এর ভৌত বিজ্ঞান দ্বিতীয় অধ্যায় বয়েলের সূত্র এবং চার্লসের সূত্র বুঝিয়ে দাও");
  assert.ok(intent1.type === 'TOPIC_REQUEST' || intent1.type === 'TOPIC_SWITCH');
  assert.equal(intent1.extractedTopic, "Boyle's Law & Gas Behavior");
  assert.equal(sm.getContext().classGrade, 'Class 10');
  assert.equal(sm.getContext().chapter, 'অধ্যায় ২');

  // Durable instruction should now contain active topic and strict anti-reset directive
  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /CURRENT ONGOING LESSON CONTEXT/);
  assert.match(durable, /Boyle's Law/);
  assert.match(durable, /DO NOT say any introductory greeting/);
});

test('Scenario C: Topic switch without conversation reset (Boyle -> Charles -> Avogadro)', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.transitionTo('READY');

  sm.processStudentInput("বয়েলের সূত্রটা পড়াও");
  assert.equal(sm.getContext().currentTopic, "Boyle's Law & Gas Behavior");

  // Model begins teaching Boyle's law
  sm.processModelOutput("বয়েলের সূত্রে নির্দিষ্ট উষ্ণতায় নির্দিষ্ট ভরের গ্যাসের আয়তন চাপের সঙ্গে ব্যস্তানুপাতে পরিবর্তিত হয়...");
  assert.equal(sm.getState(), 'TEACHING');

  // Student switches to Charles's Law
  const intent2 = sm.processStudentInput("আচ্ছা এবার চার্লসের সূত্রটা বলো");
  assert.equal(intent2.type, 'TOPIC_SWITCH');
  assert.equal(intent2.extractedTopic, "Charles's Law & Absolute Zero");
  assert.equal(sm.getContext().currentTopic, "Charles's Law & Absolute Zero");

  // Topic history should preserve both
  const ctx = sm.getContext();
  assert.ok(ctx.topicHistory.includes("Boyle's Law & Gas Behavior"));
  assert.ok(ctx.topicHistory.includes("Charles's Law & Absolute Zero"));

  // Durable context ensures model teaches Charles's law without restarting greeting
  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /Charles's Law & Absolute Zero/);
  assert.doesNotMatch(durable, /স্নেহের ছাত্র, আজ আমরা কোন ক্লাসের কোন অধ্যায়টা/);
});

test('Scenario D: Physical Science to Life Science branch switch within WBBSE Science', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.transitionTo('READY');

  sm.processStudentInput("ভৌত বিজ্ঞান বয়েলের সূত্র");
  assert.ok(sm.getContext().subject?.includes('Science'));

  // Switch to Life Science Chapter (Photosynthesis / Cell Division)
  const intent = sm.processStudentInput("এবার জীবন বিজ্ঞানের কোষ বিভাজন বা সালোকসংশ্লেষ পড়াও");
  assert.equal(intent.type, 'TOPIC_SWITCH');
  assert.equal(intent.extractedTopic, 'Cell Division / Photosynthesis (Life Science)');

  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /Cell Division \/ Photosynthesis/);
});

test('Scenario E: Reconnect with resumption handle preserved', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.transitionTo('READY');

  sm.processStudentInput("ক্লাস ১০ বয়েলের সূত্র");
  sm.setResumptionHandle("gemini-live-token-xyz-123");

  assert.equal(sm.getResumptionHandle(), "gemini-live-token-xyz-123");
  assert.equal(sm.getContext().resumptionHandle, "gemini-live-token-xyz-123");
});

test('Scenario F: Rejection of invalid resumption handle with seamless durable context fallback', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.transitionTo('READY');

  sm.processStudentInput("ক্লাস ১০ ভৌত বিজ্ঞান বয়েলের সূত্র");
  sm.setResumptionHandle("expired-token-400");

  // Simulate handle invalidation/clearing
  sm.setResumptionHandle(null);
  assert.equal(sm.getResumptionHandle(), null);

  // Durable instruction MUST still keep the ongoing topic so fresh session does not loop into greeting!
  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /Boyle's Law/);
  assert.match(durable, /DO NOT say any introductory greeting/);
});

test('Scenario G: Atomic reconnect lock prevents concurrent reconnect collision', () => {
  const sm = new ConversationStateMachine();

  // First lock attempt succeeds
  const lock1 = sm.acquireReconnectLock();
  assert.equal(lock1, true);

  // Second concurrent attempt (e.g. from GoAway + onclose) MUST be rejected
  const lock2 = sm.acquireReconnectLock();
  assert.equal(lock2, false);

  // Release lock
  sm.releaseReconnectLock();

  // Next attempt succeeds
  const lock3 = sm.acquireReconnectLock();
  assert.equal(lock3, true);
  sm.releaseReconnectLock();
});

test('Scenario H: Barge-in interruption transitions state cleanly to PROCESSING_INPUT', () => {
  const sm = new ConversationStateMachine();
  sm.transitionTo('READY');
  sm.processModelOutput("বয়েলের সূত্রে PV ধ্রুবক...");
  assert.equal(sm.getState(), 'TEACHING');

  // Student interrupts
  sm.transitionTo('PROCESSING_INPUT');
  assert.equal(sm.getState(), 'PROCESSING_INPUT');
});

test('Scenario I: Pop quiz detection sets isWaitingForStudent for quota-saving silence timeout', () => {
  const sm = new ConversationStateMachine();
  sm.transitionTo('READY');

  // Teacher asks a pop quiz check
  sm.processModelOutput("বলো তো, বয়েলের সূত্রে কোন দুটি রাশি ধ্রুবক থাকে?");
  assert.equal(sm.isWaitingForStudent(), true);
  assert.equal(sm.getContext().popQuizPending, true);

  // After turn_complete, system transitions to WAITING_FOR_STUDENT
  sm.transitionTo('WAITING_FOR_STUDENT');
  assert.equal(sm.getState(), 'WAITING_FOR_STUDENT');
});

test('Scenario J: Pop quiz answer continuation validates and clears pending flag', () => {
  const sm = new ConversationStateMachine();
  sm.transitionTo('READY');

  sm.processModelOutput("বলো তো, বয়েলের সূত্রে কোন দুটি রাশি ধ্রুবক থাকে?");
  assert.equal(sm.getContext().popQuizPending, true);

  // Student answers
  const intent = sm.processStudentInput("ভর আর উষ্ণতা");
  assert.equal(intent.type, 'ANSWER');
  assert.equal(sm.getContext().popQuizPending, false);
});

test('Scenario K: Inactivity disconnect condition matches WAITING_FOR_STUDENT', () => {
  const sm = new ConversationStateMachine();
  sm.transitionTo('READY');

  // Pop quiz asked
  sm.processModelOutput("চার্লসের সূত্রে শূন্য ডিগ্রি পরম উষ্ণতার মান কত?");
  assert.equal(sm.isWaitingForStudent(), true);

  // In this state, client arms the 22-second inactivity timer to protect quota
  assert.equal(sm.isWaitingForStudent(), true);
});

test('Scenario L: Persona switching resets and re-initializes cleanly without topic bleed', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.processStudentInput("বয়েলের সূত্র");
  assert.equal(sm.getContext().subject, 'WBBSE Science');
  assert.ok(sm.getContext().currentTopic?.includes("Boyle"));

  // Student selects Spoken English with Shreya Ma'am
  sm.updatePersona(SHREYA_MAAM_PROMPT);
  const ctx = sm.getContext();
  assert.equal(ctx.subject, 'Spoken English');
  assert.equal(ctx.currentTopic, null);
  assert.equal(ctx.turnsCompleted, 0);

  // Student selects WBBSE History
  sm.updatePersona(WBBSE_HISTORY_PROMPT);
  const ctxHist = sm.getContext();
  assert.equal(ctxHist.subject, 'WBBSE History');
  assert.equal(ctxHist.currentTopic, null);
});

test('Scenario M: Teaching mode selection — আলোচনা (Non-stop lecture mode)', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('lecture', 'Class 10', 'বিজ্ঞান (ভৌত+জীবন)');

  assert.equal(sm.getContext().teachingMode, 'lecture');
  assert.equal(sm.getContext().teachingModeLabel, 'আলোচনা');
  assert.equal(sm.getContext().classGrade, 'Class 10');

  const directive = sm.getTeachingModeDirective();
  assert.match(directive, /সক্রিয় মোড: আলোচনা/);
  assert.match(directive, /Non-stop/);

  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /Selected Mode: আলোচনা/);
  assert.match(durable, /DO NOT say any introductory greeting/);
});

test('Scenario N: Teaching mode selection — AI কে প্রশ্ন (Student doubts / Q&A mode)', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('doubts', 'Class 9', 'বিজ্ঞান');

  assert.equal(sm.getContext().teachingMode, 'doubts');
  assert.equal(sm.getContext().teachingModeLabel, 'AI কে প্রশ্ন');
  assert.equal(sm.getContext().classGrade, 'Class 9');

  const directive = sm.getTeachingModeDirective();
  assert.match(directive, /সক্রিয় মোড: AI কে প্রশ্ন/);
  assert.match(directive, /ছাত্রের সব প্রশ্নের উত্তর তোমাকেই দিতে হবে/);

  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /Selected Mode: AI কে প্রশ্ন/);
});

test('Scenario O: Teaching mode selection — প্রশ্ন উত্তর (AI oral quiz & test mode)', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('quiz', 'Class 8', 'বিজ্ঞান');

  assert.equal(sm.getContext().teachingMode, 'quiz');
  assert.equal(sm.getContext().teachingModeLabel, 'প্রশ্ন উত্তর');
  assert.equal(sm.getContext().classGrade, 'Class 8');

  const directive = sm.getTeachingModeDirective();
  assert.match(directive, /সক্রিয় মোড: প্রশ্ন উত্তর/);
  assert.match(directive, /AI ছাত্রকে প্রশ্ন করবে এবং ছাত্র উত্তর দেবে/);

  const durable = sm.generateDurableContextInstruction();
  assert.match(durable, /Selected Mode: প্রশ্ন উত্তর/);
});

test('Scenario P: Spoken English isolation prevents WBBSE subject bleed and clears Class 10', () => {
  const sm = new ConversationStateMachine();
  // First in WBBSE Class 10 Science
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('lecture', 'Class 10', 'বিজ্ঞান');
  assert.equal(sm.getContext().classGrade, 'Class 10');

  // Now student switches to Spoken English
  sm.updatePersona(SHREYA_MAAM_PROMPT);
  sm.setTeachingMode('lecture', undefined, 'Spoken English');

  assert.equal(sm.getContext().subject, 'Spoken English');
  assert.equal(sm.getContext().classGrade, undefined);

  // Student mentions "cell" in casual English conversation, should NOT trigger Life Science
  sm.processStudentInput('My cell phone battery died');
  assert.equal(sm.getContext().subject, 'Spoken English');
});

test('Scenario Q: Hard translation drill detection locks state and treats student response as ANSWER', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(SHREYA_MAAM_PROMPT);
  sm.setTeachingMode('lecture', undefined, 'Spoken English');

  // Student requests translation drill
  const intent = sm.processStudentInput('hard traslation tell me in bangla i will tell in english');
  assert.equal(intent.type, 'TOPIC_SWITCH');
  assert.equal(sm.getContext().currentTopic, 'Bengali to English Hard Translation Drill');
  assert.equal(sm.getContext().teachingModeLabel, 'অনুবাদ অনুশীলন');

  const directive = sm.getTeachingModeDirective();
  assert.match(directive, /BENGALI TO ENGLISH HARD TRANSLATION DRILL/);

  // Next student input should be evaluated as an answer, not a topic switch
  const answerIntent = sm.processStudentInput('I will read the book tomorrow');
  assert.equal(answerIntent.type, 'ANSWER');
  assert.equal(sm.getContext().currentTopic, 'Bengali to English Hard Translation Drill');
});

test('Scenario R: Dynamic topic badge update when user mentions topics like Professional Workplace Email Writing', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(SHREYA_MAAM_PROMPT);
  sm.setTeachingMode('lecture', undefined, 'Spoken English');

  let notifiedTopic: string | null = null;
  const unsubscribe = sm.subscribe((ctx) => {
    notifiedTopic = ctx.currentTopic;
  });

  // Student mentions Workplace Email Writing
  const intent = sm.processStudentInput('I want to learn professional workplace email writing');
  assert.equal(intent.type, 'TOPIC_SWITCH');
  assert.equal(sm.getContext().currentTopic, 'Professional Workplace Email Writing & Polite Business Dialogue');
  assert.equal(notifiedTopic, 'Professional Workplace Email Writing & Polite Business Dialogue');

  // Student mentions Idioms
  sm.processStudentInput('Teach me everyday idioms and phrasal verbs');
  assert.equal(sm.getContext().currentTopic, 'Everyday Idioms & Phrasal Verbs in Smart Conversations');
  assert.equal(notifiedTopic, 'Everyday Idioms & Phrasal Verbs in Smart Conversations');

  unsubscribe();
});

test('Scenario S: Class 7 Science topics (Heat, Atoms, Human Body) correctly extracted', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('lecture', 'Class 7', 'বিজ্ঞান');

  // Student asks for Heat / Temperature
  const intent1 = sm.processStudentInput('ম্যাডাম ক্লাস ৭ এর তাপ ও তাপমাত্রা নিয়ে আলোচনা করুন');
  assert.equal(sm.getContext().currentTopic, 'তাপ ও তাপমাত্রা (Heat & Temperature)');

  // Student switches to Human Body / Digestion / Lungs
  const intent2 = sm.processStudentInput('এবার মানবদেহের ফুসফুস ও পরিপাকতন্ত্র নিয়ে বলো');
  assert.equal(sm.getContext().currentTopic, 'মানবদেহের প্রধান অঙ্গ ও শারীরস্থান');

  // Student requests generic topic change
  const intent3 = sm.processStudentInput('টপিক চেঞ্জ করো');
  assert.ok(sm.getContext().currentTopic !== null);
});

test('Scenario T: Competitive subject selection (Science & Tech, Indian History) does not cross-pollinate with WBBSE Science', () => {
  const sm = new ConversationStateMachine();
  
  // Competitive Science & Technology
  const compTopic = sm.pickRandomTopic('Science & Technology');
  assert.ok(compTopic.includes('ISRO') || compTopic.includes('ডিআরডিও') || compTopic.includes('পারমাণবিক') || compTopic.includes('বায়োটেকনোলজি') || compTopic.includes('কৃত্রিম বুদ্ধিমত্তা') || compTopic.includes('শক্তি'));
  // Must NOT be WBBSE Class 10 Light
  assert.ok(!compTopic.includes('গোলীয় দর্পণ'));

  // Competitive Indian History
  const histTopic = sm.pickRandomTopic('Indian History');
  assert.ok(
    histTopic.includes('সিন্ধু') ||
    histTopic.includes('মৌর্য') ||
    histTopic.includes('গুপ্ত') ||
    histTopic.includes('সুলতানি') ||
    histTopic.includes('মুঘল') ||
    histTopic.includes('পলাশী') ||
    histTopic.includes('মহাবিদ্রোহ') ||
    histTopic.includes('গান্ধী') ||
    histTopic.includes('নেতাজি')
  );
});

test('Scenario U: User request "জৈব রসায়ন আলোচনা করো।" updates topic to Organic Chemistry', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('lecture', 'Class 10', 'বিজ্ঞান');

  const intent = sm.processStudentInput('জৈব রসায়ন আলোচনা করো।');
  assert.equal(intent.extractedTopic, 'জৈব রসায়ন (Organic Chemistry)');
  assert.equal(sm.getContext().currentTopic, 'জৈব রসায়ন (Organic Chemistry)');
});

test('Scenario V: Numbered chapter resolution for Class 10 Science Chapter 3 and Class 7 Geography', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  sm.setTeachingMode('lecture', 'Class 10', 'বিজ্ঞান');

  const intent1 = sm.processStudentInput('অধ্যায় ৩ পড়াও');
  assert.ok(intent1.extractedTopic?.includes('রাসায়নিক গণনা'));

  const sm2 = new ConversationStateMachine();
  sm2.setTeachingMode('lecture', 'Class 7', 'ভূগোল');
  const intent2 = sm2.processStudentInput('chapter 2 পড়াও');
  assert.ok(intent2.extractedTopic?.includes('অক্ষরেখা ও দ্রাঘিমারেখা'));
});

test('Scenario W: Custom topic provided before call start initializes context and durable instruction', () => {
  const sm = new ConversationStateMachine();
  sm.updatePersona(WBBSE_SCIENCE_PROMPT);
  
  // Custom topic entered in starting box
  const customTopic = 'জৈব রসায়ন';
  sm.setTeachingMode('lecture', 'Class 10', 'বিজ্ঞান');
  sm.processStudentInput(customTopic);
  
  if (!sm.getContext().currentTopic) {
    sm.setTopic(customTopic);
  }

  assert.equal(sm.getContext().currentTopic, 'জৈব রসায়ন (Organic Chemistry)');
  const instruction = sm.generateDurableContextInstruction();
  assert.match(instruction, /Active Topic to teach: জৈব রসায়ন/);
});

test('Scenario X: Disconnecting call (clearTopic) resets currentTopic to null and clears state', () => {
  const sm = new ConversationStateMachine();
  sm.setTopic('Bengali to English Hard Translation Drill');
  assert.equal(sm.getContext().currentTopic, 'Bengali to English Hard Translation Drill');

  // Call ends
  sm.clearTopic();
  assert.equal(sm.getContext().currentTopic, null);
  assert.equal(sm.getContext().chapter, undefined);
  assert.equal(sm.getContext().isLessonStarted, false);
});

test('Scenario Y: Bilingual filter accepts pure Bengali, pure English, and mixed Bengali-English', async () => {
  const { sanitizeBilingualText } = await import('../src/utils/bilingualFilter.ts');
  
  // Pure Bengali
  assert.equal(sanitizeBilingualText('আমি জৈব রসায়ন পড়তে চাই'), 'আমি জৈব রসায়ন পড়তে চাই');
  
  // Pure English
  assert.equal(sanitizeBilingualText('Please explain the periodic table'), 'Please explain the periodic table');
  
  // Mixed Bengali-English (Benglish)
  assert.equal(sanitizeBilingualText('Sir, ei topic er main point ta explain korun'), 'Sir, ei topic er main point ta explain korun');
});

test('Scenario Z: Bilingual filter rejects and cleans foreign acoustic hallucinations (Korean, French)', async () => {
  const { sanitizeBilingualText, isForeignHallucination } = await import('../src/utils/bilingualFilter.ts');
  
  // Korean Hangul noise
  assert.equal(sanitizeBilingualText('안녕하세요'), '');
  assert.equal(isForeignHallucination('안녕하세요'), true);
  
  // Korean noise prefixing valid Bengali
  assert.equal(sanitizeBilingualText('어... আলো অধ্যায় পড়াও'), 'আলো অধ্যায় পড়াও');
  
  // Pure French acoustic hallucination
  assert.equal(sanitizeBilingualText('Oui merci'), '');
  assert.equal(sanitizeBilingualText("d'accord"), '');
  assert.equal(isForeignHallucination('Merci beaucoup'), true);
});






