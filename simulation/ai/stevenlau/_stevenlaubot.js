// Do all messy setups

import { Eye } from "simulation/ai/stevenlau/eye.js";
import { Hand } from "simulation/ai/stevenlau/hand.js";
import { Brain } from "simulation/ai/stevenlau/brain.js";

function updateEntities(m, entities) {
    const ids = [];
    for (const [id, entity] of Object.entries(entities)) {
        if (m.has(+id)) {
            Object.assign(m.get(+id), entity);
        } else {
            m.set(+id, entity);
            ids.push(+id);
        }
    }
    return ids;
}

function updateChangedTemplateInfo(m, changedTemplateInfo) {
    const s = [];
    for (const [player, templateChanges] of Object.entries(changedTemplateInfo)) {
        if (!m.has(player)) m.set(player, new Map());
        const mPlayer = m.get(player);
        for (const [template, variableValues] of Object.entries(templateChanges)) {
            if (!mPlayer.has(template)) mPlayer.set(template, new Map());
            const mPlayerTemplate = mPlayer.get(template);
            for (const {variable, value} of variableValues) {
                mPlayerTemplate.set(variable, value);
                s.push([template, variable, value]);
            }
        }
    }
    return s;
}

function updateChangedEntityTemplateInfo(m, changedEntityTemplateInfo) {
    const s = [];
    for (const [id, variableValues] of Object.entries(changedEntityTemplateInfo)) {
        if (!m.has(+id)) m.set(+id, new Map());
        const mID = m.get(+id);
        for (const {variable, value} of variableValues) {
            mID.set(variable, value);
            s.push([+id, variable, value]);
        }
    }
    return s;
}

export class StevenlauBot {
    constructor({player, difficulty, behavior}) {
        this.playerID = player;
        this.difficulty = difficulty;
        this.behavior = behavior;
        print(`player:${player} difficulty:${difficulty} behavior:${behavior}\n`);
        this.externalChats = [`Hello, I am player ${this.playerID}!`];
        this.hijackChat();
        const state = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_AIInterface).GetFullRepresentation();
        this.eye = new Eye(this.playerID, state.players[this.playerID].civ, state.timeElapsed);
        updateEntities(this.eye.entities, state.entities);
        updateChangedTemplateInfo(this.eye.changedTemplateInfo,
                                  state.changedTemplateInfo);
        updateChangedEntityTemplateInfo(this.eye.changedEntityTemplateInfo,
                                        state.changedEntityTemplateInfo);
        this.hand = new Hand(this.playerID);
        this.brain = new Brain(this.eye, this.hand);
    }

    hijackChat() {
	const cmpGuiInterface = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_GuiInterface);
        cmpGuiInterface.exposedFunctions["ChatToStevenlauBot"] = 1;
        cmpGuiInterface.stevenlauBots = cmpGuiInterface.stevenlauBots || [];
        cmpGuiInterface.stevenlauBots.push(this);
        cmpGuiInterface.ChatToStevenlauBot = function(player, text) {
            for (const bot of this.stevenlauBots) {
                // PostCommand not available in GUI realm, cannot call bot.chat directly.
                bot.externalChats.push(`${bot.playerID} ${player} ${text}`);
            };
        };
    }

    Serialize() {
    }

    Deserialize(data) {
        this.chat("deserialize");
    }

    chat(s) {
        Engine.PostCommand(this.playerID, { "type": "aichat", "message": s.replace(/[\[\]]/g, '\\$&') });
    }

    chatJSON(x) {
        this.chat(JSON.stringify(x));
    }

    needResearch(template) {
        if (this.player.researchQueued.has(template)) return false;
        if (this.player.researchedTechs.has(template)) return false;
        return true;
    }

    HandleMessage(state, playerID) {
        this.externalChats.forEach(s => this.chat(s));
        this.externalChats = [];
        if (this.stop) return;
        if (playerID != this.playerID) throw `player:${this.playerID} HandleMessage playerID:${playerID}`;
        /* const civ = state.players[this.playerID].civ; */
        this.eye.timeElapsed = state.timeElapsed;
        updateEntities(this.eye.entities, state.entities).forEach(id =>
            this.chat(`new entity: ${id}:${this.entities.get(id).template}`));
        updateChangedTemplateInfo(
            this.eye.changedTemplateInfo,
            state.changedTemplateInfo
        ).forEach(([template, variable, value]) =>
            this.chat(`template change: ${template}.${variable} = ${value}`));
        updateChangedEntityTemplateInfo(
            this.eye.changedEntityTemplateInfo,
            state.changedEntityTemplateInfo
        ).forEach(([id, variable, value]) => {
            const entity = this.eye.entities.get(id);
            if (entity.owner == this.playerID) {
                this.chat(`template change: ${id}:${entity.template}.${variable} = ${value}`);
            }
        });
        Object.entries(state.events).forEach(([name, msgs]) =>
            msgs.forEach(msg => this.chat(`${name} ${JSON.stringify(msg)}`)));
        try {
            this.brain.think();
        } catch (e) {
            if (e == "resign") {
                Engine.PostCommand(this.playerID, {"type": "resign"});
            } else {
                warn(`exception: ${e}`);
            }
            this.stop = true;
        }
    }
}

