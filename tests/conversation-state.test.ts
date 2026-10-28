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

