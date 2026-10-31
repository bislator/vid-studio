const bar = document.querySelector('.topbar');
const menu = document.querySelector('.tabbar');
menu.id = 'studio-menu';
menu.setAttribute('aria-label', 'เมนูหลัก');
menu.hidden = true;
const trigger = document.createElement('button');
trigger.type = 'button';
trigger.className = 'menu-trigger';
trigger.setAttribute('aria-label', 'เปิดเมนูหลัก');
trigger.setAttribute('aria-controls', menu.id);
trigger.setAttribute('aria-expanded', 'false');
trigger.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
bar.prepend(trigger);
function setOpen(open, restore = false) {
  menu.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
  trigger.setAttribute('aria-label', open ? 'ปิดเมนูหลัก' : 'เปิดเมนูหลัก');
  if (open) menu.querySelector('.nav-item.active').focus();
  else if (restore) trigger.focus();
}
trigger.onclick = () => setOpen(menu.hidden);
menu.addEventListener('click', event => { if (event.target.closest('.nav-item')) setOpen(false, true); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) setOpen(false, true); });
document.addEventListener('click', event => { if (!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target)) setOpen(false); });
document.addEventListener('focusin', event => { if (!menu.hidden && !menu.contains(event.target) && !trigger.contains(event.target)) setOpen(false); });
// Original monogram: a lowercase b with a play-shaped counter.
for (const mark of document.querySelectorAll('.logo-mark')) {
  mark.innerHTML = '<svg viewBox="0 0 32 32" width="28" height="28" fill="none" aria-hidden="true"><path d="M8 5v22h9a9 9 0 0 0 0-18h-3V5H8Z" fill="white"/><path d="m15 13 8 5-8 5z" fill="#2457c5"/></svg>';
}
