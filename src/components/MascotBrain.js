/* ═══════════════════════════════════════════════════════════════
   MascotBrain — Pure JS state-machine for the chibi mascot
   Manages: state transitions, DOM anchor tracking, blink timer,
   scroll velocity, mouse tracking, idle detection, dialogue queue.
   ═══════════════════════════════════════════════════════════════ */

// ── DOM anchor definitions (CSS selectors) ────────────────
const ANCHORS = [
  { id: 'nav',       selector: 'nav',                         side: 'top-center',  state: 'idle'  },
  { id: 'hero',      selector: 'section:first-of-type',       side: 'right',      state: 'fly'   },
  { id: 'about',     selector: '#about',                      side: 'left',       state: 'sit'   },
  { id: 'skills',    selector: '#skills',                     side: 'right',      state: 'sit'   },
  { id: 'stacked',   selector: '.pyramid-loader',             side: 'top-right',  state: 'idle'  },
  { id: 'dome',      selector: '#interactive-showcase',      side: 'bottom-right', state: 'fly' },
  { id: 'circular',  selector: '.circular-gallery',           side: 'left',       state: 'fly'   },
  { id: 'timeline',  selector: '#timeline',                  side: 'left',       state: 'sit'   },
  { id: 'chronicle', selector: '#chronicle',                  side: 'right',      state: 'sit'   },
  { id: 'contact',   selector: '#contact',                   side: 'right',      state: 'sit'   },
  { id: 'footer',    selector: 'footer',                      side: 'bottom-center', state: 'idle' },
];

// ── Dialogue triggers ─────────────────────────────────────
const DIALOGUES = {
  welcome:      ["Oh! A new visitor! ✨ Stop staring at the code and look at me!", "Hiii~ Welcome to Muneeb's world! I live here! 🏠"],
  scrollFast:   ["Waaaah! Slow down, I'm trying to fly here! 🌪️", "Hey!! I'm getting dizzy!! 💫"],
  idle10:       ["Hey... are you still there? *knocks on screen glass* 👀", "...Hello? Did you fall asleep? 😴", "*tap tap tap* Is this thing on?"],
  hoverContact: ["Yes! Click it! He really needs the money! 💸", "Ooo email! Send him fan mail! 💌"],
  hoverVideo:   ["Ooooh, pretty colors! I want to watch too! 🎬", "These videos are so cinematic~ 🌟", "I wish I could act in this video! 🎭"],
  hoverNav:     ["Ooh exploring the menu? Good taste! 😎", "Where shall we go next~ ✨", "I live in the nav bar, it's cozy here! 🏠"],
  hoverSkills:  ["He knows so many things! I just know how to be cute 💕", "Python? I prefer Python... the snake 🐍", "Linux? I tried using it once... I broke the terminal 💻"],
  hoverAbout:   ["This is my favourite section! He's so cool~ 😊", "Muneeb is going to build an imagining AI... and I'll help! 🤖", "He's a 15-year-old genius! I'm just 2 months old 👶"],
  hoverFooter:  ["The end already? Stay a little longer! 🥺", "Come back soon, okay? I'll miss you! 💝"],
  hoverFooter:  ["The end already? Stay a little longer! 🥺", "Come back soon, okay? I'll miss you! 💝"],
  scrollDown:   ["Ooh we're going down~ wheee! 🎢", "More content below! Let's go explore! 🔍"],
  clickMascot:  ["Hey! That tickles! 😆", "Boop! 👉👈", "*giggle* Don't poke me! 😤💕"],
};

// ── Utility ────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default class MascotBrain {
  constructor() {
    // public state
    this.state = 'idle';         // idle | walk | sit | fly | tap
    this.pos = { x: 0.65, y: 0.7 }; // normalised 0‒1 screen position
    this.targetPos = { x: 0.65, y: 0.7 };
    this.mouseNDC = [0, 0];      // -1 to 1
    this.blink = 0;
    this.breathe = 0;
    this.visible = true;
    this.currentDialogue = null;
    this.dialogueQueue = [];

    // internal
    this._scrollY = 0;
    this._lastScrollY = 0;
    this._scrollVel = 0;
    this._mouseX = 0;
    this._mouseY = 0;
    this._lastMouseMove = Date.now();
    this._idleTime = 0;
    this._blinkTimer = 0;
    this._blinkDuration = 0;
    this._nextBlinkIn = 2 + Math.random() * 3;
    this._dialogueTimeout = null;
    this._lastDialogueTrigger = {};
    this._t = 0;
    this._activeAnchor = null;
    this._anchorCooldown = 0;
    this._initialized = false;
  }

  /* ── init (call once) ─────────────────────────────────── */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    window.addEventListener('scroll', () => {
      this._scrollY = window.scrollY;
    }, { passive: true });

    window.addEventListener('mousemove', (e) => {
      this._mouseX = e.clientX;
      this._mouseY = e.clientY;
      this._lastMouseMove = Date.now();
      this._idleTime = 0;
      this.mouseNDC[0] = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouseNDC[1] = -(e.clientY / window.innerHeight) * 2 + 1;
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (e.touches.length) {
        this._mouseX = e.touches[0].clientX;
        this._mouseY = e.touches[0].clientY;
        this._lastMouseMove = Date.now();
        this._idleTime = 0;
      }
    }, { passive: true });

    // welcome dialogue after 1.5s
    this._dialogueTimeout = setTimeout(() => {
      this.say('welcome');
    }, 1500);
  }

  /* ── tick (call every frame) ────────────────────────────── */
  update(dt) {
    this._t += dt;

    // scroll velocity
    this._scrollVel = Math.abs(this._scrollY - this._lastScrollY);
    this._lastScrollY = this._scrollY;

    // idle time
    const now = Date.now();
    if (now - this._lastMouseMove > 1000) {
      this._idleTime += dt;
    }

    // blink
    this._blinkTimer += dt;
    if (this._blinkTimer > this._nextBlinkIn) {
      this._blinkDuration = 0.15;
      this._blinkTimer = 0;
      this._nextBlinkIn = 2 + Math.random() * 4;
    }
    if (this._blinkDuration > 0) {
      this._blinkDuration -= dt;
      this.blink = 1;
    } else {
      this.blink = lerp(this.blink, 0, 0.2);
    }

    // breathe
    this.breathe = (Math.sin(this._t * 2.5) + 1) * 0.5;

    // trigger: scroll fast
    this._triggerWithCooldown('scrollFast', this._scrollVel > 80, 8);
    this._triggerWithCooldown('scrollDown', this._scrollVel > 15, 5);
    this._triggerWithCooldown('idle10', this._idleTime > 10, 20);
    this._triggerWithCooldown('idle10', this._idleTime > 15, 30);

    // determine target anchor
    this._updateAnchor();

    // move towards target
    const speed = this.state === 'fly' ? 1.2 : this.state === 'walk' ? 0.5 : 0.25;
    this.pos.x = lerp(this.pos.x, this.targetPos.x, speed * dt);
    this.pos.y = lerp(this.pos.y, this.targetPos.y, speed * dt);
  }

  /* ── anchor tracking ───────────────────────────────────── */
  _updateAnchor() {
    this._anchorCooldown -= 1/60;
    const vh = window.innerHeight;
    const viewCenter = this._scrollY + vh * 0.4;

    let closest = null;
    let closestDist = Infinity;

    for (const anchor of ANCHORS) {
      const el = document.querySelector(anchor.selector);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const centerY = rect.top + this._scrollY + rect.height * 0.4;
      const dist = Math.abs(centerY - viewCenter);
      if (dist < closestDist && rect.bottom > this._scrollY - 100 && rect.top < this._scrollY + vh + 100) {
        closestDist = dist;
        closest = anchor;
      }
    }

    if (closest && closest.id !== this._activeAnchor?.id && this._anchorCooldown <= 0) {
      this._activeAnchor = closest;
      this._anchorCooldown = 2;
      this.state = closest.state;

      const el = document.querySelector(closest.selector);
      if (el) {
        const rect = el.getBoundingClientRect();
        const nx = (rect.left + rect.width) / window.innerWidth;
        const ny = (rect.top + this._scrollY) / (document.body.scrollHeight);

        switch (closest.side) {
          case 'top-center':    this.targetPos = { x: clamp(nx, 0.08, 0.92), y: 0.08 }; break;
          case 'right':         this.targetPos = { x: clamp(nx + rect.width/window.innerWidth - 0.08, 0.08, 0.92), y: clamp(ny, 0.05, 0.95) }; break;
          case 'left':          this.targetPos = { x: clamp(nx + 0.06, 0.08, 0.92), y: clamp(ny, 0.05, 0.95) }; break;
          case 'top-right':     this.targetPos = { x: clamp(nx + rect.width/window.innerWidth - 0.06, 0.08, 0.92), y: clamp(ny, 0.05, 0.95) }; break;
          case 'bottom-right':  this.targetPos = { x: clamp(nx + rect.width/window.innerWidth - 0.06, 0.08, 0.92), y: clamp(ny + 0.3, 0.05, 0.95) }; break;
          case 'bottom-center': this.targetPos = { x: clamp(nx, 0.08, 0.92), y: clamp(ny + 0.1, 0.05, 0.95) }; break;
          default:              this.targetPos = { x: 0.65, y: 0.7 };
        }

        // clamp to safe area
        this.targetPos.x = clamp(this.targetPos.x, 0.06, 0.94);
        this.targetPos.y = clamp(this.targetPos.y, 0.04, 0.96);
      }
    }
  }

  /* ── external hover triggers (called from React) ────────── */
  onHoverSection(section) {
    const key = `hover_${section}`;
    this._triggerWithCooldown(key, true, 12);
  }

  onClickMascot() {
    this.state = 'tap';
    setTimeout(() => { this.state = this._activeAnchor?.state || 'idle'; }, 1500);
    this._triggerWithCooldown('clickMascot', true, 15);
  }

  /* ── dialogue helpers ──────────────────────────────────── */
  _triggerWithCooldown(key, condition, cooldownSec) {
    if (!condition) return;
    const last = this._lastDialogueTrigger[key] || 0;
    if (Date.now() - last > cooldownSec * 1000) {
      this._lastDialogueTrigger[key] = Date.now();
      this.say(key);
    }
  }

  say(key) {
    const pool = DIALOGUES[key];
    if (!pool) return;
    const text = pool[Math.floor(Math.random() * pool.length)];
    this.currentDialogue = text;
    clearTimeout(this._dialogueTimeout);
    this._dialogueTimeout = setTimeout(() => {
      if (this.currentDialogue === text) this.currentDialogue = null;
    }, 4000);
  }

  dismissDialogue() {
    this.currentDialogue = null;
  }

  destroy() {
    clearTimeout(this._dialogueTimeout);
  }
}
