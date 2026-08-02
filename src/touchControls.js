// On-screen touch controls for phones / tablets. Desktop input is unchanged.

export function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    return (
        window.matchMedia('(pointer: coarse)').matches
        || ('ontouchstart' in window)
        || (navigator.maxTouchPoints > 0)
    );
}

/**
 * @param {object} opts
 * @param {() => boolean} opts.isPlaying
 * @param {object} opts.input  mutable { forward, back, left, right, run }
 * @param {object} opts.player mutable { yaw, pitch }
 * @param {() => void} opts.onShoot
 * @param {() => void} opts.onInteract
 * @param {() => void} opts.onFlashlight
 * @param {() => void} opts.onPause
 */
export function setupTouchControls(opts) {
    const root = document.getElementById('touch-controls');
    if (!root) return { show() {}, hide() {}, tick() {} };

    const stick = document.getElementById('touch-stick');
    const knob = document.getElementById('touch-stick-knob');
    const lookPad = document.getElementById('touch-look');
    const btnFire = document.getElementById('touch-fire');
    const btnInteract = document.getElementById('touch-interact');
    const btnFlash = document.getElementById('touch-flash');
    const btnRun = document.getElementById('touch-run');
    const btnPause = document.getElementById('touch-pause');

    let stickId = null;
    let lookId = null;
    let stickOrigin = { x: 0, y: 0 };
    let lookLast = { x: 0, y: 0 };
    let fireHold = false;
    let fireTimer = 0;

    const STICK_RADIUS = 54;
    const LOOK_SENS = 0.0042;
    const DEADZONE = 0.18;

    function setStickVisual(dx, dy) {
        if (!knob) return;
        const len = Math.hypot(dx, dy) || 1;
        const scale = Math.min(1, STICK_RADIUS / len);
        knob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    }

    function applyStick(dx, dy) {
        const nx = dx / STICK_RADIUS;
        const ny = dy / STICK_RADIUS;
        const mag = Math.hypot(nx, ny);
        opts.input.forward = false;
        opts.input.back = false;
        opts.input.left = false;
        opts.input.right = false;
        if (mag < DEADZONE) {
            setStickVisual(0, 0);
            return;
        }
        setStickVisual(dx, dy);
        if (ny < -DEADZONE) opts.input.forward = true;
        if (ny > DEADZONE) opts.input.back = true;
        if (nx < -DEADZONE) opts.input.left = true;
        if (nx > DEADZONE) opts.input.right = true;
        // Outer ring auto-sprints when the run button isn't held.
        if (!btnRun?.classList.contains('active')) {
            opts.input.run = mag > 0.85;
        }
    }

    function resetStick() {
        stickId = null;
        opts.input.forward = false;
        opts.input.back = false;
        opts.input.left = false;
        opts.input.right = false;
        if (!btnRun?.classList.contains('active')) opts.input.run = false;
        setStickVisual(0, 0);
        knob?.classList.remove('active');
    }

    stick?.addEventListener('touchstart', (event) => {
        if (!opts.isPlaying()) return;
        const touch = event.changedTouches[0];
        stickId = touch.identifier;
        const rect = stick.getBoundingClientRect();
        stickOrigin.x = rect.left + rect.width / 2;
        stickOrigin.y = rect.top + rect.height / 2;
        knob?.classList.add('active');
        applyStick(touch.clientX - stickOrigin.x, touch.clientY - stickOrigin.y);
        event.preventDefault();
    }, { passive: false });

    lookPad?.addEventListener('touchstart', (event) => {
        if (!opts.isPlaying()) return;
        const touch = event.changedTouches[0];
        // Don't steal touches that land on action buttons.
        if (event.target.closest('.touch-btn')) return;
        lookId = touch.identifier;
        lookLast.x = touch.clientX;
        lookLast.y = touch.clientY;
        event.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (event) => {
        if (!opts.isPlaying()) return;
        for (const touch of event.changedTouches) {
            if (touch.identifier === stickId) {
                applyStick(touch.clientX - stickOrigin.x, touch.clientY - stickOrigin.y);
                event.preventDefault();
            } else if (touch.identifier === lookId) {
                const dx = touch.clientX - lookLast.x;
                const dy = touch.clientY - lookLast.y;
                lookLast.x = touch.clientX;
                lookLast.y = touch.clientY;
                opts.player.yaw -= dx * LOOK_SENS;
                opts.player.pitch -= dy * LOOK_SENS;
                opts.player.pitch = Math.max(
                    -Math.PI / 2 + 0.05,
                    Math.min(Math.PI / 2 - 0.05, opts.player.pitch)
                );
                event.preventDefault();
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (event) => {
        for (const touch of event.changedTouches) {
            if (touch.identifier === stickId) resetStick();
            if (touch.identifier === lookId) lookId = null;
        }
    });
    window.addEventListener('touchcancel', (event) => {
        for (const touch of event.changedTouches) {
            if (touch.identifier === stickId) resetStick();
            if (touch.identifier === lookId) lookId = null;
        }
    });

    function bindHold(button, onStart, onEnd) {
        if (!button) return;
        const start = (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!opts.isPlaying()) return;
            button.classList.add('pressed');
            onStart?.();
        };
        const end = (event) => {
            event.preventDefault();
            event.stopPropagation();
            button.classList.remove('pressed');
            onEnd?.();
        };
        button.addEventListener('touchstart', start, { passive: false });
        button.addEventListener('touchend', end, { passive: false });
        button.addEventListener('touchcancel', end, { passive: false });
        // Mouse fallback for testing in desktop DevTools.
        button.addEventListener('mousedown', start);
        button.addEventListener('mouseup', end);
        button.addEventListener('mouseleave', end);
    }

    bindHold(btnFire, () => {
        fireHold = true;
        opts.onShoot?.();
    }, () => { fireHold = false; });

    bindHold(btnInteract, () => opts.onInteract?.());
    bindHold(btnFlash, () => opts.onFlashlight?.());

    bindHold(btnRun, () => {
        btnRun.classList.add('active');
        opts.input.run = true;
    }, () => {
        btnRun.classList.remove('active');
        opts.input.run = false;
    });

    btnPause?.addEventListener('touchstart', (event) => {
        event.preventDefault();
        event.stopPropagation();
        opts.onPause?.();
    }, { passive: false });
    btnPause?.addEventListener('click', (event) => {
        event.preventDefault();
        opts.onPause?.();
    });

    function tick(dt) {
        if (!fireHold || !opts.isPlaying()) return;
        fireTimer += dt;
        if (fireTimer >= 0.12) {
            fireTimer = 0;
            opts.onShoot?.();
        }
    }

    return {
        show() {
            root.classList.add('visible');
            root.setAttribute('aria-hidden', 'false');
        },
        hide() {
            root.classList.remove('visible');
            root.setAttribute('aria-hidden', 'true');
            resetStick();
            fireHold = false;
        },
        tick
    };
}
