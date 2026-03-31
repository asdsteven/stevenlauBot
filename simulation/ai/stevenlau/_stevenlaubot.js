// nav cell = 1m
// terrain tile = 4m
// territory tile = 8m

import { ResearchIronAxes } from "simulation/ai/stevenlau/researchIronAxes.js";
import * as geom from "simulation/ai/stevenlau/geom.js";

function updateEntities(m, entities) {
    const ids = [];
    for (const [id, entity] of Object.entries(entities)) {
        if (m.has(id)) {
            Object.assign(m.get(id), entity);
        } else {
            m.set(id, entity);
            ids.push(id);
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
        if (!m.has(id)) m.set(id, new Map());
        const mID = m.get(id);
        for (const {variable, value} of variableValues) {
            mID.set(variable, value);
            s.push([id, variable, value]);
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
        const state = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_AIInterface).GetFullRepresentation();
        this.player = state.players[this.playerID];
        this.entities = new Map();
        this.changedTemplateInfo = new Map();
        this.changedEntityTemplateInfo = new Map();
        updateEntities(this.entities, state.entities);
        updateChangedTemplateInfo(this.changedTemplateInfo,
                                  state.changedTemplateInfo);
        updateChangedEntityTemplateInfo(this.changedEntityTemplateInfo,
                                        state.changedEntityTemplateInfo);
        this.runner = {
            Run: () => {
                if (this.player.civ != "han") {
                    throw "stevenlauBot only works for Han.";
                }
                this.chat(`Hello, I am player ${this.playerID}!`);
                return true;
            }
        };
        this.externalChats = [];
	const cmpGuiInterface = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_GuiInterface);
        cmpGuiInterface.exposedFunctions["ChatToStevenlauBot"] = 1;
        cmpGuiInterface.ChatToStevenlauBot = (player, text) => {
            // PostCommand not available in GUI realm, cannot call this.chat directly.
            this.externalChats.push(`${this.playerID} ${player} ${text}`);
            warn(JSON.stringify(this.externalChats));
            return true;
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

    think() {
    }

    HandleMessage(state, playerID) {
        this.externalChats.forEach(s => this.chat(s));
        this.externalChats = [];
        if (this.stop) return;
        if (playerID != this.playerID) throw `player:${this.playerID} HandleMessage playerID:${playerID}`;
        this.player = state.players[this.playerID];
        updateEntities(this.entities, state.entities).forEach(id =>
            this.chat(`new entity: ${id}:${this.entities.get(id).template}`));
        updateChangedTemplateInfo(
            this.changedTemplateInfo,
            state.changedTemplateInfo
        ).forEach(([template, variable, value]) =>
            this.chat(`template change: ${template}.${variable} = ${value}`));
        updateChangedEntityTemplateInfo(
            this.changedEntityTemplateInfo,
            state.changedEntityTemplateInfo
        ).forEach(([id, variable, value]) => {
            const entity = this.entities.get(id);
            if (entity.owner == this.playerID) {
                this.chat(`template change: ${id}:${entity.template}.${variable} = ${value}`);
            }
        });
        Object.entries(state.events).forEach(([name, msgs]) =>
            msgs.forEach(msg => this.chat(`${name} ${JSON.stringify(msg)}`)));
        try {
            this.think();
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
