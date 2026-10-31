// Keep existing controls and event handlers intact while paging persona cards.
const root = document.querySelector('#tab-persona');
const cards = [...root.querySelectorAll(':scope > .panel-card')];
const labels = ['ตัวละคร', 'หน้า / ชุด', 'ข้อความ', 'สร้าง'];
let current = 0;
const nav = document.createElement('nav');
nav.className = 'persona-progress';
nav.setAttribute('aria-label', 'ขั้นตอนสร้างตัวตน');
const buttons = cards.map((card, i) => {
  card.id ||= `persona-stage-${i + 1}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = `<span>${i + 1}</span><b>${labels[i]}</b>`;
  button.setAttribute('aria-controls', card.id);
  button.addEventListener('click', () => show(i));
  nav.append(button);
  return button;
});
root.querySelector('.hero').after(nav);
const footer = document.createElement('div');
footer.className = 'wizard-footer';
footer.innerHTML = '<button type="button" class="btn-ghost" id="persona-prev">ย้อนกลับ</button><span aria-live="polite" id="persona-step-status"></span><button type="button" class="btn-primary" id="persona-next">ถัดไป →</button>';
root.querySelector('.action-bar').before(footer);
const prev = footer.querySelector('#persona-prev');
const next = footer.querySelector('#persona-next');
function available() { return cards.map((_, i) => i).filter(i => !cards[i].classList.contains('hidden')); }
function show(index, focus = true) {
  const steps = available();
  current = steps.includes(index) ? index : steps[0];
  cards.forEach((card, i) => {
    card.classList.toggle('wizard-inactive', i !== current);
    buttons[i].disabled = !steps.includes(i);
    buttons[i].setAttribute('aria-current', i === current ? 'step' : 'false');
  });
  prev.disabled = current === steps[0];
  next.hidden = current === steps.at(-1);
  root.querySelector('.action-bar').classList.toggle('wizard-inactive', current !== steps.at(-1));
  footer.querySelector('#persona-step-status').textContent = `ขั้นตอน ${steps.indexOf(current) + 1} / ${steps.length}`;
  if (focus) {
    const title = cards[current].querySelector('.card-title');
    title.tabIndex = -1;
    title.focus({preventScroll:true});
    document.querySelector('.content').scrollTop = 0;
  }
}
prev.onclick = () => { const steps = available(); show(steps[steps.indexOf(current) - 1]); };
next.onclick = () => { const steps = available(); show(steps[steps.indexOf(current) + 1]); };
// The library mode hides AI-only content; omit that step without losing values.
let lastHidden = cards[2].classList.contains('hidden');
new MutationObserver(() => {
  const hidden = cards[2].classList.contains('hidden');
  if (hidden !== lastHidden) { lastHidden = hidden; show(current, false); }
}).observe(cards[2], {attributes:true, attributeFilter:['class']});
show(0, false);
