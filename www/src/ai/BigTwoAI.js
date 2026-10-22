/**
 * Main AI Manager class
 */
class BigTwoAI {
    constructor(gameLogic) {
        this.gameLogic = gameLogic;
        // All available character blueprints (null = Human)
        this.availableBlueprints = [null, AlexAI, BellaAI, ChrisAI, OrangeCatAI, ShibaDogAI, BeaverAI];

        // Active characters in slots 0, 1, 2, 3
        this.characters = {
            0: null, // Human
            1: new BeaverAI(gameLogic),   // Player 2 is Beaver!
            2: new ShibaDogAI(gameLogic),  // Player 3 is Shiba Dog!
            3: new OrangeCatAI(gameLogic)  // Player 4 is Orange Cat!
        };
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
