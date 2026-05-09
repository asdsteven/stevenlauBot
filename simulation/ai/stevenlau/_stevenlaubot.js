// Do all messy setups

import { Eye } from "simulation/ai/stevenlau/eye.js"
import { Hand } from "simulation/ai/stevenlau/hand.js"
import { Brain } from "simulation/ai/stevenlau/brain.js"

function updateEntities(eye, entities) {
    for (const [id, entity] of Object.entries(entities)) {
        eye.updateEntity(+id, entity)
    }
}

function updateChangedTemplateInfo(eye, changedTemplateInfo) {
    for (const [playerID, templateChanges] of Object.entries(changedTemplateInfo)) {
        for (const [template, variableValues] of Object.entries(templateChanges)) {
            for (const {variable, value} of variableValues) {
                eye.updateChangedTemplateInfo(+playerID, template, variable, value)
            }
        }
    }
}

function updateChangedEntityTemplateInfo(eye, changedEntityTemplateInfo) {
    for (const [id, variableValues] of Object.entries(changedEntityTemplateInfo)) {
        for (const {variable, value} of variableValues) {
            eye.updateChangedEntityTemplateInfo(+id, variable, value)
        }
    }
}

export class StevenlauBot {
    constructor({player: playerID, difficulty, behavior}) {
        const state = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_AIInterface).GetFullRepresentation()
        const players = state.players.map(player => ({
            team: player.team,
            resources: player.resourceCounts
        }))
        this.eye = new Eye(state.timeElapsed, players, playerID, difficulty, behavior, state.players[playerID].civ)
        this.hand = new Hand(playerID)
        this.brain = new Brain(this.eye, this.hand)
        updateEntities(this.eye, state.entities)
        updateChangedTemplateInfo(this.eye, state.changedTemplateInfo)
        updateChangedEntityTemplateInfo(this.eye, state.changedEntityTemplateInfo)
        this.eye.scanEntities()
        this.hijackChat()
    }

    hijackChat() {
	const cmpGuiInterface = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_GuiInterface)
        cmpGuiInterface.exposedFunctions["ChatToStevenlauBot"] = 1
        cmpGuiInterface.stevenlauBots = cmpGuiInterface.stevenlauBots || []
        cmpGuiInterface.stevenlauBots.push(this)
        cmpGuiInterface.stevenlauBots.sort((a, b) => a.eye.playerID - b.eye.playerID)
        cmpGuiInterface.ChatToStevenlauBot = function(player, text) {
            this.stevenlauBots[0].hand.write(`${player} ${text}`)
        }
    }

    Serialize() {
    }

    Deserialize(data) {
        this.hand.write("deserialize")
    }

    /* needResearch(template) {
     *     if (this.player.researchQueued.has(template)) return false
     *     if (this.player.researchedTechs.has(template)) return false
     *     return true
     * } */

    HandleMessage(state, playerID) {
        if (this.stop) return
        if (playerID != this.eye.playerID) throw `player:${this.playerID} HandleMessage playerID:${playerID}`
        this.eye.timeElapsed = state.timeElapsed
        updateEntities(this.eye, state.entities)
        updateChangedTemplateInfo(this.eye, state.changedTemplateInfo)
        updateChangedEntityTemplateInfo(this.eye, state.changedEntityTemplateInfo)
        Object.entries(state.events).forEach(([name, msgs]) =>
            msgs.forEach(msg => print(`${this.eye.timeElapsed} ${name} ${JSON.stringify(msg)}\n`)))
        try {
            this.brain.think()
            this.hand.flush()
        } catch (e) {
            if (e == "resign") {
                Engine.PostCommand(this.eye.playerID, {"type": "resign"})
                this.stop = true
            } else {
                throw e
            }
        }
    }
}

