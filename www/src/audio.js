const PERSONA_VOICE_MAP = {
    '橘貓': 'cat',
    'orangecat': 'cat',
    'orange': 'cat',
    '柴犬': 'dog',
    'shibadog': 'dog',
    'shiba': 'dog',
    '河狸': 'beaver',
    'beaver': 'beaver'
};

/**
 * Simple Audio Engine using Web Audio API
 */
class SoundEngine {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.soundMode = 0; // 0: 報牌配音開, 2: 全關（音樂已移除）
    }

    setSoundMode(mode) {
        this.soundMode = parseInt(mode) === 2 ? 2 : 0;
    }

    playTone(freq, type, duration, volume = 0.1) {
        if (this.soundMode === 2) return;
        
        // Auto-resume AudioContext if it is suspended in Android WebView
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(e => console.warn("Auto-resume AudioContext failed:", e));
        }

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playCardSelect() {
        this.playTone(800, 'sine', 0.05, 0.05);
    }

    playCardPlay() {
        this.playTone(400, 'triangle', 0.1, 0.1);
        setTimeout(() => this.playTone(600, 'triangle', 0.1, 0.05), 50);
    }

    playPass(persona = 'you') {
        if (this.soundMode === 2) return;

        // Always play SFX (Tone)
        this.playTone(200, 'sine', 0.2, 0.1);

        // Play Voice only in Mode 0 (All)
        if (this.soundMode !== 0) return;

        const personaKeyRaw = persona.toLowerCase().split(' ')[0];
        const personaKey = PERSONA_VOICE_MAP[personaKeyRaw] || personaKeyRaw;

        const audioPath = `src/assets/mp3/pass_${personaKey}.mp3`;

        const audio = new Audio(audioPath);
        audio.play().catch(err => {
            console.warn(`Failed to play character-specific Pass (${audioPath}):`, err);
            const fallbackPath = `src/assets/mp3/pass_default.mp3`;
            const fallbackAudio = new Audio(fallbackPath);
            fallbackAudio.play().catch(fallbackErr => {
                console.warn(`Failed to play default Pass (${fallbackPath}):`, fallbackErr);
            });
        });
    }

    playWin() {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C-E-G-C
        notes.forEach((freq, i) => {
            setTimeout(() => this.playTone(freq, 'sine', 0.4, 0.1), i * 150);
        });
    }

    /**
     * 報牌配音：手牌只剩 1 張「報單」時播放該角色的語音。
     * 音樂（BGM）已整個移除，這裡只保留配音與提示音效。
     */
    playDeclare(persona = 'you') {
        if (this.soundMode === 2) return;

        // 提示音效
        this.playTone(600, 'sawtooth', 0.1, 0.15);
        setTimeout(() => this.playTone(400, 'sawtooth', 0.2, 0.1), 50);
        
        const personaKeyRaw = persona.toLowerCase().split(' ')[0];
        const personaKey = PERSONA_VOICE_MAP[personaKeyRaw] || personaKeyRaw;

        const audioPath = `src/assets/mp3/la_${personaKey}.mp3`;  // 報單語音沿用 la_ 系列
        
        const audio = new Audio(audioPath);
        audio.play().catch(err => {
            console.warn(`Failed to play declare voice (${audioPath}):`, err);
            const fallbackPath = `src/assets/mp3/la_default.mp3`;
            const fallbackAudio = new Audio(fallbackPath);
            fallbackAudio.play().catch(fallbackErr => {
                console.warn(`Failed to play default declare voice (${fallbackPath}):`, fallbackErr);
            });
        });
    }

    // 相容舊呼叫
    playLa(persona = 'you') {
        this.playDeclare(persona);
    }

    // 右上角按鈕試聽報牌配音
    playDeclareSample() {
        this.playDeclare('you');
    }
}

const AudioPlayer = new SoundEngine();
if (typeof module !== 'undefined') {
    module.exports = AudioPlayer;
}

