// js/app.js

import { CHAPTER_CSV } from './chapters.js';

// ===== Config =====
const QUESTIONS_PER_TEST = 10;
const SECONDS_PER_QUESTION = 30;

// ===== State =====
const STATE = {
  deck: [],
  index: 0,
  score: 0,
  selected: {},
  timer: { left: SECONDS_PER_QUESTION, id: null },
  actualCount: 0,
  loaded: false,
  csvUrl: CHAPTER_CSV['chapter1_ai_project_cycle'], // default
};

// ===== Bind UI =====
const chapterSelect = document.getElementById('chapterSelect');
const startBtn = document.getElementById('startQuizBtn');

chapterSelect.addEventListener('change', (e) => {
  STATE.csvUrl = CHAPTER_CSV[e.target.value];
  // Do NOT start automatically; user must click Start
});

// NEW: Start button triggers the quiz
startBtn.addEventListener('click', async () => {
  // Optionally disable while loading
  startBtn.disabled = true;

  // Make sure cards are hidden until render
  document.getElementById('resultCard').style.display = 'none';
  const quizCard = document.getElementById('quizCard');
  quizCard.style.display = 'block';

  try {
    await restart(); // loads CSV and renders first question
  } catch (err) {
    const quizBody = quizCard.querySelector('.card-body');
    quizBody.innerHTML = `<div class="error">Failed to start: ${err.message}</div>`;
  } finally {
    startBtn.disabled = false;
  }
});

// PapaParse loader — expects CSV schema: q,options,answer,explain
async function loadCSVDeck(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load CSV: ' + res.status);
  const text = await res.text();

  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  if (parsed.errors?.length) console.warn('CSV parse errors:', parsed.errors);

  const rows = parsed.data;
  const items = rows.map((r, idx) => {
    const q = (r.q || '').trim();
    const rawOptions = (r.options || '').split('|').map(s => s.trim()).filter(Boolean);
    const answerIndex = Number(r.answer);
    const explain = (r.explain || '').trim();

    if (!q || rawOptions.length === 0 || Number.isNaN(answerIndex) ||
        answerIndex < 0 || answerIndex >= rawOptions.length) {
      console.warn(`Skipping invalid row #${idx + 2}:`, r);
      return null;
    }

    const optsWithIndex = rawOptions.map((text, oi) => ({ text, oi }));
    shuffle(optsWithIndex);
    const shuffledOptions = optsWithIndex.map(o => o.text);
    const correctShuffledIndex = optsWithIndex.findIndex(o => o.oi === answerIndex);

    return { q, options: shuffledOptions, answer: correctShuffledIndex, explain };
  }).filter(Boolean);

  shuffle(items);
  const target = Math.min(QUESTIONS_PER_TEST, items.length);
  STATE.deck = items.slice(0, target);
  STATE.actualCount = STATE.deck.length;
  STATE.loaded = true;
}

// ===== Utilities =====
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ===== DOM references =====
const quizCard = document.getElementById('quizCard');
const quizBody = quizCard.querySelector('.card-body');
const scoreVal = document.getElementById('scoreVal');
const qNow = document.getElementById('qNow');
const resultCard = document.getElementById('resultCard');
const finalScore = document.getElementById('finalScore');

document.getElementById('restartTop').addEventListener('click', restart);
document.getElementById('endTop').addEventListener('click', finish);
document.getElementById('homeBtn').addEventListener('click', () => location.href = 'index.html');
document.getElementById('againBtn').addEventListener('click', restart);

// ===== Render & quiz flow (same as your revised version) =====
function renderQuestion() {
  if (!STATE.loaded || STATE.actualCount === 0) {
    quizBody.innerHTML = '<div class="muted">Loading questions…</div>';
    return;
  }
  resultCard.style.display = 'none';
  quizCard.style.display = 'block';

  const item = STATE.deck[STATE.index];
  if (!item) { finish(); return; }

  qNow.textContent = (STATE.index + 1);
  quizBody.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'qhead';

  const htext = document.createElement('div');
  htext.className = 'qtext';
  htext.textContent = item.q; // plain text

  const timer = document.createElement('div');
  timer.className = 'pill';
  timer.setAttribute('role', 'status');
  timer.setAttribute('aria-live', 'polite');
  timer.innerHTML = `<strong>Time:</strong> <span id="timerLabel">${SECONDS_PER_QUESTION}s</span>`;
  head.appendChild(htext);
  head.appendChild(timer);

  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('span');
  fill.id = 'timeFill';
  bar.appendChild(fill);

  const opts = document.createElement('div');
  opts.className = 'options';
  item.options.forEach((opt, oi) => {
    const b = document.createElement('button');
    b.className = 'option';
    b.type = 'button';
    b.textContent = opt;
    b.addEventListener('click', () => choose(oi));
    opts.appendChild(b);
  });

  const ctr = document.createElement('div');
  ctr.className = 'controls';
  const info = document.createElement('span');
  info.className = 'muted';
  info.textContent = 'Tap an option to answer (revision mode: no penalty)';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn secondary';
  nextBtn.id = 'nextBtn';
  nextBtn.textContent = (STATE.index === STATE.actualCount - 1 ? 'Finish' : 'Next');
  nextBtn.disabled = true;
  nextBtn.addEventListener('click', next);

  const endBtn = document.createElement('button');
  endBtn.className = 'btn red';
  endBtn.textContent = 'End Quiz';
  endBtn.addEventListener('click', finish);

  ctr.appendChild(info);
  ctr.appendChild(nextBtn);
  ctr.appendChild(endBtn);

  quizBody.appendChild(head);
  quizBody.appendChild(bar);
  quizBody.appendChild(opts);
  quizBody.appendChild(ctr);

  startTimer();
}

function startTimer() {
  clearInterval(STATE.timer.id);
  STATE.timer.left = SECONDS_PER_QUESTION;
  updateTimerUI();
  STATE.timer.id = setInterval(() => {
    STATE.timer.left--;
    updateTimerUI();
    if (STATE.timer.left <= 0) {
      clearInterval(STATE.timer.id);
      timesUp();
    }
  }, 1000);
}

function updateTimerUI() {
  const label = document.getElementById('timerLabel');
  if (label) label.textContent = STATE.timer.left + 's';
  const fill = document.getElementById('timeFill');
  if (fill) {
    const elapsed = Math.max(0, SECONDS_PER_QUESTION - STATE.timer.left);
    fill.style.width = (elapsed / SECONDS_PER_QUESTION * 100) + '%';
  }
}

function lockOptions() {
  const options = quizBody.querySelectorAll('.option');
  options.forEach(btn => btn.disabled = true);
}

function choose(oi) {
  clearInterval(STATE.timer.id);
  if (typeof STATE.selected[STATE.index] !== 'undefined') return;

  const item = STATE.deck[STATE.index];
  const options = quizBody.querySelectorAll('.option');
  const correct = item.answer;

  STATE.selected[STATE.index] = oi;

  options.forEach((el, i) => {
    if (i === oi) {
      if (i === correct) {
        el.classList.add('correct');
        STATE.score++; // reward only correct
      } else {
        el.classList.add('wrong');
      }
    }
    if (i !== oi) el.classList.add('disabled');
  });

  if (item.explain) {
    const exp = document.createElement('div');
    exp.className = 'explain';
    exp.innerHTML = `<strong>Explanation:</strong> ${item.explain}`;
    quizBody.appendChild(exp);
  }

  scoreVal.textContent = STATE.score;
  lockOptions();
  const nextBtn = quizBody.querySelector('#nextBtn');
  if (nextBtn) nextBtn.disabled = false;
}

function timesUp() {
  const item = STATE.deck[STATE.index];
  if (!item) return;
  const correct = item.answer;
  const options = quizBody.querySelectorAll('.option');

  options.forEach((el, i) => {
    if (i === correct) el.classList.add('correct');
    else el.classList.add('disabled');
  });

  if (typeof STATE.selected[STATE.index] === 'undefined') {
    STATE.selected[STATE.index] = null; // timeout/no attempt
  }

  if (item.explain) {
    const exp = document.createElement('div');
    exp.className = 'explain';
    exp.innerHTML = `<strong>Explanation:</strong> ${item.explain}`;
    quizBody.appendChild(exp);
  }

  lockOptions();
  const nextBtn = quizBody.querySelector('#nextBtn');
  if (nextBtn) nextBtn.disabled = false;
}

function next() {
  const nextBtn = quizBody.querySelector('#nextBtn');
  if (nextBtn) nextBtn.disabled = true;

  if (STATE.index < STATE.actualCount - 1) {
    STATE.index++;
    renderQuestion();
  } else {
    finish();
  }
}

function finish() {
  clearInterval(STATE.timer.id);
  quizCard.style.display = 'none';
  resultCard.style.display = 'block';
  finalScore.textContent = `${STATE.score}/${STATE.actualCount}`;
}

async function restart() {
  clearInterval(STATE.timer.id);
  STATE.index = 0;
  STATE.score = 0;
  STATE.selected = {};

  // Reset counters
  document.getElementById('scoreVal').textContent = 0;
  document.getElementById('qNow').textContent = 1;

  // Load CSV for current selection and render
  await loadCSVDeck(STATE.csvUrl);
  renderQuestion();
}

// Boot
// Enable below to auto-start
// restart();
