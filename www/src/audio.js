const PERSONA_VOICE_MAP = {
    '橘猫': 'cat',
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
        this.soundMode = 0; // 0: 报牌配音开, 2: 全关（音乐已移除）
    }

    // 语音目录：中文 voice/、英文 voice_en/
    voiceDir() {
        return (window.currentLang === 'en') ? 'voice_en' : 'voice';
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

        // 语音：一律用 TTS 念「过」（原本的动物配音已删除）
        const personaKeyRaw = persona.toLowerCase().split(' ')[0];
        const mapped = PERSONA_VOICE_MAP[personaKeyRaw] || personaKeyRaw;
        const personaKey = ['cat', 'dog', 'beaver', 'you'].includes(mapped) ? mapped : 'you';

        const audioPath = `src/assets/mp3/${this.voiceDir()}/pass_${personaKey}.mp3`;

        const audio = new Audio(audioPath);
        audio.play().catch(err => {
            console.warn(`Failed to play Pass voice (${audioPath}):`, err);
            const fallbackPath = `src/assets/mp3/${this.voiceDir()}/pass_you.mp3`;
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
     * 报牌配音：手牌只剩 1 张「报单」时播放该角色的语音。
     * 音乐（BGM）已整个移除，这里只保留配音与提示音效。
     */
    playDeclare(persona = 'you') {
        if (this.soundMode === 2) return;

        // 提示音效
        this.playTone(600, 'sawtooth', 0.1, 0.15);
        setTimeout(() => this.playTone(400, 'sawtooth', 0.2, 0.1), 50);
        
        const personaKeyRaw = persona.toLowerCase().split(' ')[0];
        const mapped = PERSONA_VOICE_MAP[personaKeyRaw] || personaKeyRaw;
        // 只认 cat / dog / beaver / you，其它角色（Alex、Bella…）回退人类语音
        const personaKey = ['cat', 'dog', 'beaver', 'you'].includes(mapped) ? mapped : 'you';

        const audioPath = `src/assets/mp3/${this.voiceDir()}/declare_${personaKey}.mp3`;
        
        const audio = new Audio(audioPath);
        audio.play().catch(err => {
            console.warn(`Failed to play declare voice (${audioPath}):`, err);
            const fallbackPath = `src/assets/mp3/${this.voiceDir()}/declare_you.mp3`;
            const fallbackAudio = new Audio(fallbackPath);
            fallbackAudio.play().catch(fallbackErr => {
                console.warn(`Failed to play default declare voice (${fallbackPath}):`, fallbackErr);
            });
        });
    }

    // 相容旧呼叫
    playLa(persona = 'you') {
        this.playDeclare(persona);
    }

    /**
     * 报牌名：AI 出牌时念出牌型，例如「对二」「顺子」「同花」。
     * 单张／对子／三条会带点数（single_0..12 = 三..二），五张牌型只念类型。
     */
    playHandName(info, cards) {
        if (this.soundMode === 2 || !info) return;

        const typeKey = {
            SINGLE: 'single', PAIR: 'pair', TRIPLE: 'triple',
            STRAIGHT: 'straight', FLUSH: 'flush', FULL_HOUSE: 'fullhouse',
            FOUR_OF_A_KIND: 'fourwithone', STRAIGHT_FLUSH: 'straightflush', DRAGON: 'dragon'
        }[info.type];

        if (!typeKey) return;

        let key = typeKey;
        if (info.type === 'SINGLE' || info.type === 'PAIR' || info.type === 'TRIPLE') {
            const rank = (cards && cards.length) ? (cards[0] % 13) : 0;
            key = `${typeKey}_${rank}`;
        }

        // 新的一声盖掉上一声，避免连续出牌时叠音
        if (this.handVoice) {
            try { this.handVoice.pause(); } catch (e) { /* ignore */ }
        }
        const audio = new Audio(`src/assets/mp3/${this.voiceDir()}/${key}.mp3`);
        this.handVoice = audio;
        audio.play().catch(err => console.warn(`Hand name voice failed (${key}):`, err));
    }

    // 右上角按钮只切换开关：不念任何牌名，仅一声轻提示音（避免误以为在报牌）
    playToggleBeep() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
        this.playTone(880, 'sine', 0.06, 0.06);
    }
}

const AudioPlayer = new SoundEngine();
if (typeof module !== 'undefined') {
    module.exports = AudioPlayer;
}

