// Translation helper
function t(key, params = {}) {
    let str = I18N[currentLang][key] || key;
    for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
    }
    return str;
}
window.t = t;

function updateRulesDescription() {
    // 只有大陆锄大地一种规则，说明文案直接对应 i18n key（不再用 HK/TW 后缀切换）
    const elements = {
        'rule-desc-suit': 'ruleSuit',
        'rule-desc-start': 'ruleStart',
        'rule-desc-dragon': 'ruleDragon',
        'rule-desc-fivecard': 'ruleFiveCard',
        'rule-desc-bombs': 'ruleBombs',
        'rule-desc-basescore': 'ruleBaseScore',
        'rule-desc-pairwise': 'rulePairwise',
        'rule-desc-winner2': 'ruleWinner2',
        'rule-desc-winner4': 'ruleWinner4',
        'rule-desc-loser10': 'ruleLoser10',
        'rule-desc-loserTwo': 'ruleLoserTwo',
        'rule-desc-loserSpecial': 'ruleLoserSpecial'
    };

    for (const [id, key] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.innerHTML = t(key);
    }

    // 「关于游戏」分页文案
    const aboutElements = {
        'about-heading': 'aboutHeading',
        'about-p1': 'aboutP1',
        'about-p2': 'aboutP2',
        'about-dev-label': 'aboutDevLabel',
        'about-dev-value': 'aboutDevValue',
        'about-privacy-label': 'aboutPrivacyLabel',
        'about-privacy-value': 'aboutPrivacyValue'
    };
    for (const [id, key] of Object.entries(aboutElements)) {
        const el = document.getElementById(id);
        if (el && I18N[currentLang][key]) el.textContent = I18N[currentLang][key];
    }
}
window.updateRulesDescription = updateRulesDescription;

function updateLanguage() {
    window.currentLang = currentLang;
    updateRulesDescription();

    if (typeof LicenseService !== 'undefined') {
        const licenseStatus = LicenseService.getLicenseStatusSync();
        if (licenseStatus && licenseStatus.isActive) {
            if (licenseStatus.isTrial) {
                window.trialDaysRemaining = licenseStatus.trialDaysRemaining;
            } else {
                window.trialDaysRemaining = null;
            }
        }
    }
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (I18N[currentLang][key]) {
            el.textContent = I18N[currentLang][key];
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (I18N[currentLang][key]) {
            el.placeholder = I18N[currentLang][key];
        }
    });

    const buildTarget = typeof LicenseService !== 'undefined' ? LicenseService.getBuildTarget() : 'GITHUB';
    
    const tabLicenseBtn = document.querySelector('[data-i18n="tabLicense"]');
    if (tabLicenseBtn) {
        if (buildTarget === 'STORE') {
            tabLicenseBtn.textContent = I18N[currentLang].tabLicenseStore || I18N['en'].tabLicenseStore;
        } else {
            tabLicenseBtn.textContent = I18N[currentLang].tabLicense || I18N['en'].tabLicense;
        }
    }



    // Update Rules Footer (Version & Author)
    let pkg = window.AppVersionInfo || { version: "1.5.0", author: "SeaGaruda", buildVersion: "1.5.0.0" };
    if (typeof require !== 'undefined' && !window.AppVersionInfo) {
        try {
            pkg = require('./package.json');
        } catch (e) {
            console.warn('[Renderer] package.json require failed, using fallbacks.');
        }
    }
    const rulesVersion = document.getElementById('rules-version');
    const rulesAuthor = document.getElementById('rules-author');
    if (rulesVersion) rulesVersion.textContent = `v${pkg.buildVersion || pkg.version}`;
    // 说明页底部直接挂开发者身份（应用商店审核要求应用名称与开发者名称可对应）
    if (rulesAuthor) rulesAuthor.textContent = `${t('aboutDevLabel')}: ${t('aboutDevValue')}`;

    // Dynamic Character Name Sync
    const names = currentLang === 'zh' ? PLAYER_NAMES_ZH : PLAYER_NAMES_EN;
    window.PLAYER_NAMES = [...names];

    if (window.AI && typeof window.AI.getNames === 'function') {
        const aiData = window.AI.getNames();
        for (let i = 0; i <= 3; i++) {
            const playerEl = document.getElementById(i === 0 ? 'human-area' : `player-${i + 1}`);
            if (!playerEl) continue;

            if (aiData[i]) {
                const data = aiData[i];
                const suffix = t('npcSuffix');

                let nameKey = data.name;
                if (data.name === '橘猫' || data.name === 'OrangeCat' || data.name === 'Orange Cat') nameKey = 'charOrangeCat';
                else if (data.name === '柴犬' || data.name === 'ShibaDog' || data.name === 'Shiba Dog') nameKey = 'charShibaDog';
                else if (data.name === '河狸' || data.name === 'Beaver') nameKey = 'charBeaver';

                const displayName = (I18N[currentLang][nameKey]) ? t(nameKey) : data.name;
                PLAYER_NAMES[i] = displayName + suffix;

                const avatarEl = playerEl.querySelector('.avatar');
                if (avatarEl) {
                    if (data.name === "橘猫" || data.name === "OrangeCat" || data.isDynamic) {
                        const canvasId = `canvas-avatar-${i}`;
                        let canvasEl = document.getElementById(canvasId);
                        if (!canvasEl) {
                            avatarEl.innerHTML = `<canvas id="${canvasId}" width="100" height="100" style="width: 100%; height: 100%; border-radius: 50%; display: block;"></canvas>`;
                            canvasEl = document.getElementById(canvasId);
                        }
                        
                        // Initialize DynamicAvatar if not exists, or update if the image changed
                        if (!window.activeDynamicAvatars) window.activeDynamicAvatars = {};
                        const hasInstance = !!window.activeDynamicAvatars[i];
                        const urlChanged = hasInstance && window.activeDynamicAvatars[i].spriteUrl !== data.avatar;
                        
                        if (!hasInstance || urlChanged) {
                            window.activeDynamicAvatars[i] = new DynamicAvatar(canvasEl, data.avatar, {
                                onTensionChange: (y) => {
                                    if (y > 0.8) {
                                        playerEl.classList.add('tension-high');
                                    } else {
                                        playerEl.classList.remove('tension-high');
                                    }
                                }
                            });
                        }
                    } else {
                        // Cleanup dynamic avatar if swapped away
                        if (window.activeDynamicAvatars && window.activeDynamicAvatars[i]) {
                            delete window.activeDynamicAvatars[i];
                            playerEl.classList.remove('tension-high');
                        }
                        if (data.avatar && data.avatar.includes('src/assets/avatars/')) {
                            avatarEl.innerHTML = `<img src="${data.avatar}" alt="${data.name}">`;
                        } else {
                            avatarEl.textContent = data.avatar;
                        }
                    }
                }
            } else {
                PLAYER_NAMES[i] = t('youName');
                const avatarEl = playerEl.querySelector('.avatar');
                if (avatarEl) {
                    const canvasId = `canvas-avatar-0`;
                    let canvasEl = document.getElementById(canvasId);
                    if (!canvasEl) {
                        avatarEl.innerHTML = `<canvas id="${canvasId}" width="100" height="100" style="width: 100%; height: 100%; border-radius: 50%; display: block;"></canvas>`;
                        canvasEl = document.getElementById(canvasId);
                    }
                    
                    // Initialize human dynamic avatar (Panda)
                    if (!window.activeDynamicAvatars) window.activeDynamicAvatars = {};
                    if (!window.activeDynamicAvatars[0]) {
                        window.activeDynamicAvatars[0] = new DynamicAvatar(canvasEl, "src/assets/avatars/panda_sprite.png", {
                            onTensionChange: (y) => {
                                if (y > 0.8) {
                                    playerEl.classList.add('tension-high');
                                } else {
                                    playerEl.classList.remove('tension-high');
                                }
                            }
                        });
                    }
                    avatarEl.classList.remove('llm-glow');
                }
                const gearIcon = playerEl.querySelector('.settings-icon');
                if (gearIcon) gearIcon.classList.add('hidden');
            }
        }
    }

    document.title = t('title');

    updateMuteUI();
    updateTrialStatusUI();
    renderAll();
    
}
window.updateLanguage = updateLanguage;

function updateTrialStatusUI() {
    if (!trialStatus || trialDaysRemaining === null) return;
    trialStatus.textContent = t('trialDaysLeft', { days: trialDaysRemaining });
    trialStatus.title = t('trialClickToBuy');
    trialStatus.classList.remove('hidden');
}
window.updateTrialStatusUI = updateTrialStatusUI;

const openStore = () => {
    if (typeof LicenseService !== 'undefined') {
        LicenseService.openStore();
    } else if (typeof SystemService !== 'undefined') {
        SystemService.openExternal('https://appgallery.huawei.com/');
    }
};

if (trialStatus) {
    trialStatus.addEventListener('click', openStore);
}

function updateMuteUI() {
    if (!muteToggle) return;

    const muted = (soundMode === 2);
    muteToggle.textContent = muted ? '🔇' : '🔊';
    muteToggle.title = muted ? t('declareVoiceOff') : t('declareVoiceOn');
    AudioPlayer.setSoundMode(muted ? 2 : 0);
}
window.updateMuteUI = updateMuteUI;

if (muteToggle) {
    muteToggle.onclick = () => {
        // 只有「报牌配音 开／关」两态（背景音乐已移除）；每次点击都先试听「对二」
        window.soundMode = (soundMode === 2) ? 0 : 2;
        AppStorage.setItem('soundMode', soundMode);
        updateMuteUI();
        AudioPlayer.playToggleBeep();
    };
    updateMuteUI();
}


function setupAvatarClickListeners() {
    // 点头像＝换一位对手角色（纯本机规则 AI，没有大模型设定）
    for (let i = 0; i <= 3; i++) {
        const playerEl = document.getElementById(i === 0 ? 'human-area' : `player-${i + 1}`);
        if (!playerEl) continue;

        const avatarEl = playerEl.querySelector('.avatar');
        if (!avatarEl) continue;

        avatarEl.style.cursor = 'pointer';
        avatarEl.title = 'Left click: Swap';
        avatarEl.onclick = () => {
            if (!window.AI || typeof window.AI.swapCharacter !== 'function') return;
            const newChar = window.AI.swapCharacter(i);
            if (!newChar) return;

            avatarEl.style.transform = 'scale(1.2)';
            setTimeout(() => { avatarEl.style.transform = ''; }, 200);
            updateLanguage();
            AudioPlayer.playCardSelect();

            if (gameState.turn === i) {
                if (aiTurnTimeout) clearTimeout(aiTurnTimeout);
                if (newChar.type !== 'Human') {
                    updatePlayButtonVisibility();
                    updateStatus();
                    window.aiTurnTimeout = setTimeout(aiTurn, 500);
                } else {
                    updateStatus();
                    updatePlayButtonVisibility();
                }
            }
        };
        avatarEl.oncontextmenu = null;
    }
}
window.setupAvatarClickListeners = setupAvatarClickListeners;
