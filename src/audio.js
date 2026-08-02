// Procedural SFX fallbacks, plus real MP3s for laser, footsteps, doors, monster, BGM.
const LASER_URL = '/music/gun/media_man_uk-lazer-gun-432285.mp3';
const MONSTER_URL = '/music/sound/moster_sound.mp3';
const STEP_URL = '/music/sound/step.mp3';
const DOOR_URL = '/music/sound/open_door.mp3';
const BGM_URL = '/music/background%20music/Resident%20Evil%204%20OST%20-%20Garrador%20%5BX70DwhWz0Lw%5D.mp3';

export class Audio {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.noiseBuffer = null;
        this.laserEl = null;
        this.monsterEl = null;
        this.stepEl = null;
        this.doorEl = null;
        this.bgmEl = null;
        this.started = false;
    }

    start() {
        if (this.started) return;
        this.started = true;

        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (Ctx) {
            this.ctx = new Ctx();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.45;
            this.master.connect(this.ctx.destination);

            const length = this.ctx.sampleRate * 2;
            this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
            const data = this.noiseBuffer.getChannelData(0);
            for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        }

        this.laserEl = new window.Audio(LASER_URL);
        this.laserEl.preload = 'auto';
        this.laserEl.volume = 0.55;

        this.monsterEl = new window.Audio(MONSTER_URL);
        this.monsterEl.preload = 'auto';
        this.monsterEl.volume = 0.92;

        this.stepEl = new window.Audio(STEP_URL);
        this.stepEl.preload = 'auto';
        this.stepEl.volume = 0.42;

        this.doorEl = new window.Audio(DOOR_URL);
        this.doorEl.preload = 'auto';
        this.doorEl.volume = 0.7;

        this.bgmEl = new window.Audio(BGM_URL);
        this.bgmEl.preload = 'auto';
        this.bgmEl.loop = true;
        // Half of the previous mix so SFX cut through more clearly.
        this.bgmEl.volume = 0.16;

        // Browsers block autoplay until a gesture; start() is called from the
        // ENTER button, so play() is allowed here.
        const playBgm = () => {
            this.bgmEl.play().catch(() => {
                // Retry once after a short delay if decode is still pending.
                setTimeout(() => this.bgmEl?.play().catch(() => {}), 400);
            });
        };
        if (this.bgmEl.readyState >= 2) playBgm();
        else this.bgmEl.addEventListener('canplaythrough', playBgm, { once: true });
    }

    noise(duration, { gain = 0.2, type = 'lowpass', frequency = 900, q = 1 } = {}) {
        if (!this.ctx) return;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        const env = this.ctx.createGain();
        const now = this.ctx.currentTime;
        env.gain.setValueAtTime(gain, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter).connect(env).connect(this.master);
        src.start(now);
        src.stop(now + duration + 0.05);
    }

    tone(frequency, duration, { gain = 0.15, type = 'sine', slideTo = null } = {}) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const env = this.ctx.createGain();
        const now = this.ctx.currentTime;
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);
        if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
        env.gain.setValueAtTime(gain, now);
        env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(env).connect(this.master);
        osc.start(now);
        osc.stop(now + duration + 0.05);
    }

    footstep() {
        if (this.stepEl) {
            try {
                // Clone so rapid steps can overlap without cutting each other off.
                const el = this.stepEl.cloneNode();
                el.volume = this.stepEl.volume;
                const play = el.play();
                if (play?.catch) play.catch(() => this.footstepFallback());
                return;
            } catch {
                // fall through
            }
        }
        this.footstepFallback();
    }

    footstepFallback() {
        this.noise(0.11, { gain: 0.11, frequency: 420, q: 1.4 });
    }

    doorOpen() {
        if (this.doorEl) {
            try {
                this.doorEl.currentTime = 0;
                const play = this.doorEl.play();
                if (play?.catch) play.catch(() => this.doorOpenFallback());
                return;
            } catch {
                // fall through
            }
        }
        this.doorOpenFallback();
    }

    doorOpenFallback() {
        this.noise(0.2, { gain: 0.2, frequency: 1400, q: 3 });
        this.tone(180, 0.5, { gain: 0.1, type: 'square', slideTo: 90 });
    }

    click() { this.noise(0.04, { gain: 0.22, type: 'highpass', frequency: 2600 }); }
    pickup() { this.tone(660, 0.25, { gain: 0.12, type: 'triangle', slideTo: 1180 }); }
    unlock() {
        this.noise(0.2, { gain: 0.2, frequency: 1400, q: 3 });
        this.tone(180, 0.5, { gain: 0.1, type: 'square', slideTo: 90 });
    }
    locked() { this.noise(0.08, { gain: 0.18, frequency: 700, q: 6 }); }

    heartbeat(strength) {
        this.tone(58, 0.13, { gain: 0.16 * strength, type: 'sine', slideTo: 34 });
        setTimeout(() => this.tone(50, 0.16, { gain: 0.11 * strength, type: 'sine', slideTo: 30 }), 165);
    }

    playMonster(volume = 0.7) {
        if (!this.monsterEl) {
            this.growlFallback();
            return;
        }
        try {
            // Clone so overlapping growls/scares can stack.
            const el = this.monsterEl.cloneNode();
            el.volume = Math.max(0, Math.min(1, volume));
            const play = el.play();
            if (play?.catch) play.catch(() => this.growlFallback());
        } catch {
            this.growlFallback();
        }
    }

    growl() {
        this.playMonster(0.88);
    }

    growlFallback() {
        this.tone(70, 1.1, { gain: 0.13, type: 'sawtooth', slideTo: 44 });
        this.noise(0.9, { gain: 0.07, frequency: 320, q: 2 });
    }

    scare() {
        this.playMonster(1);
    }

    laser() {
        if (this.laserEl) {
            try {
                this.laserEl.currentTime = 0;
                const play = this.laserEl.play();
                if (play?.catch) play.catch(() => this.laserFallback());
                return;
            } catch {
                // fall through
            }
        }
        this.laserFallback();
    }

    laserFallback() {
        this.tone(1400, 0.08, { gain: 0.12, type: 'square', slideTo: 420 });
        this.noise(0.06, { gain: 0.1, type: 'highpass', frequency: 3000 });
    }

    hit() {
        this.noise(0.12, { gain: 0.2, frequency: 900, q: 2 });
        this.tone(220, 0.15, { gain: 0.1, type: 'sawtooth', slideTo: 80 });
    }

    thunder() {
        this.noise(1.6, { gain: 0.22, frequency: 260, q: 0.8 });
        this.tone(46, 1.8, { gain: 0.1, type: 'sine', slideTo: 26 });
    }

    setMusicVolume(volume) {
        if (this.bgmEl) this.bgmEl.volume = Math.max(0, Math.min(1, volume));
    }

    pauseMusic() {
        this.bgmEl?.pause();
    }

    resumeMusic() {
        this.bgmEl?.play().catch(() => {});
    }
}
