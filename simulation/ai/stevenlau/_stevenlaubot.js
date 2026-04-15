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
    constructor({player, difficulty, behavior}) {
        this.playerID = player
        this.difficulty = difficulty
        this.behavior = behavior
        print(`player:${player} difficulty:${difficulty} behavior:${behavior}\n`)
        this.externalChats = [`Hello, I am player ${this.playerID}!`]
        this.hijackChat()
        const state = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_AIInterface).GetFullRepresentation()
        const players = state.players.map(player => ({team: player.team}))
        this.eye = new Eye(state.timeElapsed, players, this.playerID, state.players[this.playerID].civ)
        this.hand = new Hand(this.playerID)
        this.brain = new Brain(this.eye, this.hand)
        updateEntities(this.eye, state.entities)
        updateChangedTemplateInfo(this.eye, state.changedTemplateInfo)
        updateChangedEntityTemplateInfo(this.eye, state.changedEntityTemplateInfo)
        this.eye.scanEntities()
    }

    hijackChat() {
	const cmpGuiInterface = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_GuiInterface)
        cmpGuiInterface.exposedFunctions["ChatToStevenlauBot"] = 1
        cmpGuiInterface.stevenlauBots = cmpGuiInterface.stevenlauBots || []
        cmpGuiInterface.stevenlauBots.push(this)
        cmpGuiInterface.ChatToStevenlauBot = function(player, text) {
            for (const bot of this.stevenlauBots) {
                // PostCommand not available in GUI realm, cannot call bot.chat directly.
                bot.externalChats.push(`${bot.playerID} ${player} ${text}`)
            }
        }
    }

    Serialize() {
    }

    Deserialize(data) {
        this.chat("deserialize")
    }

    chat(s) {
        Engine.PostCommand(this.playerID, { "type": "aichat", "message": s.replace(/[\[\]]/g, '\\$&') })
    }

    chatJSON(x) {
        this.chat(JSON.stringify(x))
    }

    needResearch(template) {
        if (this.player.researchQueued.has(template)) return false
        if (this.player.researchedTechs.has(template)) return false
        return true
    }

    HandleMessage(state, playerID) {
        this.externalChats.forEach(s => this.chat(s))
        this.externalChats = []
        if (this.stop) return
        if (playerID != this.playerID) throw `player:${this.playerID} HandleMessage playerID:${playerID}`
        this.eye.timeElapsed = state.timeElapsed
        updateEntities(this.eye, state.entities)
        updateChangedTemplateInfo(this.eye, state.changedTemplateInfo)
        updateChangedEntityTemplateInfo(this.eye, state.changedEntityTemplateInfo)
        Object.entries(state.events).forEach(([name, msgs]) =>
            msgs.forEach(msg => warn(`${this.eye.timeElapsed} ${name} ${JSON.stringify(msg)}`)))
        try {
            this.brain.think()
        } catch (e) {
            if (e == "resign") {
                Engine.PostCommand(this.playerID, {"type": "resign"})
            } else {
                warn(`exception: ${e}`)
            }
            this.stop = true
        }
    }
}

