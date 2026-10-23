/**
 * Main AI Manager class
 */
class BigTwoAI {
    constructor(gameLogic) {
        this.gameLogic = gameLogic;
        // All available character blueprints (null = Human)
        this.availableBlueprints = [null, AlexAI, BellaAI, ChrisAI, OrangeCatAI, ShibaDogAI, BeaverAI];

        // Active characters in slots 0, 1, 2, 3
        // 每次開啟 App 都重新洗牌三個電腦玩家（河狸／柴犬／橘貓）的座位：
        // 1=河狸位(左)、2=柴犬位(上)、3=橘貓位(右)，名字與頭像都跟著角色走。
        const cpuBlueprints = [BeaverAI, ShibaDogAI, OrangeCatAI];
        for (let i = cpuBlueprints.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cpuBlueprints[i], cpuBlueprints[j]] = [cpuBlueprints[j], cpuBlueprints[i]];
        }
        this.characters = {
            0: null, // Human
            1: new cpuBlueprints[0](gameLogic),
            2: new cpuBlueprints[1](gameLogic),
            3: new cpuBlueprints[2](gameLogic)
        };
        // 供測試／除錯確認本次抽到的座位順序（1=左 2=上 3=右）
        this.seatOrder = [1, 2, 3].map(i => this.characters[i].name);
    }

    swapCharacter(playerIndex) {
        const currentBlueprint = this.characters[playerIndex] ? this.characters[playerIndex].constructor : null;
        const otherActiveBlueprints = Object.entries(this.characters)
            .filter(([idx]) => parseInt(idx) !== playerIndex)
            .map(([_, c]) => c ? c.constructor : null);

        // Find current index in the pool
        let currentIndex = this.availableBlueprints.indexOf(currentBlueprint);

        // Search for the next available character in a circle
        for (let i = 1; i <= this.availableBlueprints.length; i++) {
            let nextIndex = (currentIndex + i) % this.availableBlueprints.length;
            let candidateBlueprint = this.availableBlueprints[nextIndex];

            // Prevention: Only slot 0 (the player) can be 'null' (Human). 
            // This prevents CPUs in slots 1-3 from accidentally becoming Human.
            if (playerIndex > 0 && candidateBlueprint === null) continue;

            if (!otherActiveBlueprints.includes(candidateBlueprint)) {
                if (candidateBlueprint === null) {
                    this.characters[playerIndex] = null;
                    console.log(`%c[AI Manager] Player ${playerIndex + 1} is now Human control`, 'color: #3498db; font-weight: bold;');
                    return { name: "You", avatar: "src/assets/avatars/avatar_you.png", type: "Human" };
                } else {
                    const newCharacter = new candidateBlueprint(this.gameLogic);
                    this.characters[playerIndex] = newCharacter;
                    console.log(`%c[AI Manager] Swapped Player ${playerIndex + 1} to ${newCharacter.name}`, 'color: #3498db; font-weight: bold;');
                    return newCharacter;
                }
            }
        }

        return this.characters[playerIndex] || { name: "You", avatar: "src/assets/avatars/avatar_you.png", type: "Human" };
    }

    async findPlay(playerIndex, context) {
        const character = this.characters[playerIndex];
        if (!character) return null;

        const enhancedContext = { ...context, playerIndex };
        return await character.decide(enhancedContext);
    }

    getCharacter(playerIndex) {
        return this.characters[playerIndex];
    }

    getNames() {
        const getCharData = (i) => {
            const char = this.characters[i];
            if (!char) return null;
            return { name: char.name, avatar: char.avatar, type: char.type, isDynamic: char.isDynamic };
        };
        return {
            0: getCharData(0),
            1: getCharData(1),
            2: getCharData(2),
            3: getCharData(3)
        };
    }

}

// Electron/Browser Export Logic
if (typeof module !== 'undefined') {
    module.exports = { BigTwoAI };
}

window.AI = new BigTwoAI(window.GameLogic || (typeof GameLogic !== 'undefined' ? GameLogic : null));
