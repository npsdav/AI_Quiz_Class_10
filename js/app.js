
// js/app.js
import { CHAPTER_CSV } from './chapters.js';

/*
  ---- Config ----
*/
const QUESTIONS_PER_TEST = 10;   // number of questions per run
const SECONDS_PER_QUESTION = 30; // per-question timer in seconds

/*
  ---- State ----
*/
const STATE = {
  deck: [],                 // current question set for the run
  index: 0,                 // current question index
  score: 0,                 // correct answers count
  selected: {},             // map: questionIndex -> selectedOptionIndex | null (timeout)
  timer: { left: SECONDS_PER_QUESTION, id: null },
  actualCount: 0,           // number of questions in the current deck
  loaded: false,            // has CSV been loaded and normalized
  csvUrl: CHAPTER_CSV['chapter1_ai_project_cycle'], // default chapter
};

/*
  ---- DOM References ----
  These IDs should exist in index.html:
*/
const quizCard        = document.getElementById('quizCard');
const quizBody        = quizCard.querySelector('.card-body');
const resultCard      = document.getElementById('resultCard');

const chapterSelect   = document.getElementById('chapterSelect');
const startBtn        = document.getElementById('startQuizBtn');

const scoreVal        = document.getElementById('scoreVal');
const qNow            = document.getElementById('qNow');
const finalScore      = document.getElementById('finalScore');

const restartTopBtn   = document.getElementById('restartTop');
const restartBottomBtn= document.getElementById('restartBottom');
const endTopBtn       = document.getElementById('endTop');

const homeTopBtn      = document.getElementById('homeTop');
const homeBottomBtn   = document.getElementById('homeBottom');

/*
  ---- Top-level Controls ----
*/
// Home (top & bottom)
homeTopBtn?.addEventListener('click', () => location.href = 'index.html');
homeBottomBtn?.addEventListener('click', () => location.href = 'index.html');

// Restart (top & bottom) -> new shuffled run of the currently selected chapter
restartTopBtn?.addEventListener('click', restart);
restartBottomBtn?.addEventListener('click', restart);

// End Quiz (only in top bar)
endTopBtn?.addEventListener('click', finish);

// Chapter selection (do NOT auto-start)
chapterSelect?.addEventListener('change', (e) => {
  STATE.csvUrl = CHAPTER_CSV[e.target.value];
});

// Start Quiz -> show quiz, load CSV, render first question
startBtn?.addEventListener('click', async () => {
  startBtn.disabled = true;
  resultCard.style.display = 'none';
  quizCard.style.display = 'block';

  try {
    await restart(); // loads CSV & renders Q1
  } catch (err) {
    quizBody.innerHTML = `<div class="alert alert-danger" role="alert">Failed to start: ${err.message}</div>`;
  } finally {
    startBtn.disabled = false;
  }
});

/*
  ---- PapaParse Loader ----
  Expects CSV header: q,options,answer,explain
  - q: plain text question
  - options: pipe-separated ("A|B|C|D")
  - answer: 0-based index of correct option
  - explain: short explanation (optional)
*/
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

    // Basic validation
    if (!q || rawOptions.length === 0 || Number.isNaN(answerIndex) ||
        answerIndex < 0 || answerIndex >= rawOptions.length) {
      console.warn(`Skipping invalid row #${idx + 2}:`, r);
      return null;
    }

    // Shuffle options while keeping track of correct answer
    const optsWithIndex = rawOptions.map((text, oi) => ({ text, oi }));
    shuffle(optsWithIndex);
    const shuffledOptions = optsWithIndex.map(o => o.text);
    const correctShuffledIndex = optsWithIndex.findIndex(o => o.oi === answerIndex);

    return { q, options: shuffledOptions, answer: correctShuffledIndex, explain };
  }).filter(Boolean);

  return items; // return full normalized list for restart() to trim
}

/*
  ---- Utilities ----
*/
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/*
  ---- Rendering & Quiz Flow ----
*/
function renderQuestion() {
  if (!STATE.loaded || STATE.actualCount === 0) {
    quizBody.innerHTML = '<div class="alert alert-info" role="status">Loading questions…</div>';
    return;
  }

  const item = STATE.deck[STATE.index];
  if (!item) { finish(); return; }

  qNow.textContent = (STATE.index + 1);
  quizBody.innerHTML = '';

  // Header: question text + timer badge
  const head = document.createElement('div');
  head.className = 'd-flex justify-content-between align-items-center gap-3 mb-2';

  const htext = document.createElement('div');
  htext.className = 'fw-semibold fs-5';
  htext.textContent = item.q;

  const timerBadge = document.createElement('div');
  timerBadge.className = 'badge rounded-pill text-bg-primary-subtle';
  timerBadge.setAttribute('role', 'status');
  timerBadge.setAttribute('aria-live', 'polite');
  timerBadge.innerHTML = `<strong>Time:</strong> <span id="timerLabel">${SECONDS_PER_QUESTION}s</span>`;

  head.appendChild(htext);
  head.appendChild(timerBadge);

  // Progress bar (custom CSS; Bootstrap feel)
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('span');
  fill.id = 'timeFill';
  bar.appendChild(fill);

  // Options
  const opts = document.createElement('div');
  opts.className = 'options';
  item.options.forEach((opt, oi) => {
    const b = document.createElement('button');
    // Avoid pale Bootstrap style; rely on .option styles
    b.className = 'option btn';
    b.type = 'button';
    b.textContent = opt;
    b.addEventListener('click', () => choose(oi));
    opts.appendChild(b);
  });

  // Controls (ONLY Next/Finish here; End Quiz exists in the top bar)
  const ctr = document.createElement('div');
  ctr.className = 'd-flex align-items-center gap-2 mt-2';

  const info = document.createElement('span');
  info.id = 'info';
  info.className = 'info-text'; // high-contrast pill
  info.setAttribute('aria-live', 'polite');
  info.textContent = 'Tap an option to answer (revision mode: no penalty)';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-outline-primary';
  nextBtn.id = 'nextBtn';
  nextBtn.textContent = (STATE.index === STATE.actualCount - 1 ? 'Finish' : 'Next');
  nextBtn.disabled = true;
  nextBtn.addEventListener('click', next);

  ctr.appendChild(info);
  ctr.appendChild(nextBtn);

  // Attach all to quiz body
  quizBody.appendChild(head);
  quizBody.appendChild(bar);
  quizBody.appendChild(opts);
  quizBody.appendChild(ctr);

  // Start the per-question timer
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
  if (label) label.textContent = `${STATE.timer.left}s`;
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

  // remember the selection
  STATE.selected[STATE.index] = oi;

  // remove any prior glow
  options.forEach(el => el.classList.remove('selected'));

  options.forEach((el, i) => {
    if (i === oi) {
      // apply animated glow
      el.classList.add('selected');

      // evaluation + styling
      if (i === correct) {
        el.classList.add('correct');
        STATE.score++; // revision mode: reward only correct
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

/*
  ---- Restart: fresh run (new shuffled deck of current chapter) ----
*/
async function restart() {
  clearInterval(STATE.timer.id);
  STATE.index = 0;
  STATE.score = 0;
  STATE.selected = {};
  scoreVal.textContent = 0;
  qNow.textContent = 1;

  // Load, shuffle, slice to QUESTIONS_PER_TEST
  const allItems = await loadCSVDeck(STATE.csvUrl);
  shuffle(allItems);
  const target = Math.min(QUESTIONS_PER_TEST, allItems.length);
  STATE.deck = allItems.slice(0, target);
  STATE.actualCount = STATE.deck.length;
  STATE.loaded = true;

  // Ensure correct panels
  resultCard.style.display = 'none';
  quizCard.style.display = 'block';

  // Render first question
  renderQuestion();
}
