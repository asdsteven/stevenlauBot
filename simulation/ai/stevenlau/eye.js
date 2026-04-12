// Tells Brain what I see.

import * as geom from "simulation/ai/stevenlau/geom.js"
import { entitywhxya } from "simulation/ai/stevenlau/util.js"
import { Entity } from "simulation/ai/stevenlau/entity.js"

export class Eye {
    constructor(timeElapsed, players, playerID, civ) {
        this.timeElapsed = timeElapsed
        this.players = players
        this.playerID = playerID
        this.civ = civ
        this.entities = new Map()
        players.forEach(player => player.templatesCache = new Map())
    }

    updateEntity(id, entity) {
        if (this.entities.has(id)) {
            this.entities.get(id).update(entity)
        } else {
            const newEntity = new Entity(id, entity, this.players[this.playerID].templatesCache)
            this.entities.set(id, newEntity)
            this.listener?.("new entity", newEntity)
        }
    }

    updateChangedTemplateInfo(playerID, template, variable, value) {
    }

    updateChangedEntityTemplateInfo(id, variable, value) {
    }

    scanEntities() {
        this.ccs = []
        this.enemyCCs = []
        this.metals = []
        this.stones = []
        this.fruits = []
        this.civilians = []
        for (const [id, entity] of this.entities.entries()) {
            const template = entity.template
            if (template.genericName == "Civic Center") {
                if (entity.owner == this.playerID) {
                    this.ccs.push(entity)
                } else {
                    this.enemyCCs.push(entity)
                }
            } else if (template.resourceSupplyType?.startsWith("metal.")) {
                entity.amount
                this.metals.push(entity)
            } else if (template.resourceSupplyType?.startsWith("stone.")) {
                entity.amount
                this.stones.push(entity)
            } else if (template.resourceSupplyType?.endsWith(".fruit")) {
                entity.amount
                this.fruits.push(entity)
            } else if (template.classes.has("Civilian")) {
                this.civilians.push(entity)
            }
        }
        for (const cc of this.ccs) {
            // 140 * 1.25 * 1.25 = 218
            const ccDist = `dist ${cc.id}`
            this.metals.forEach(e => e[ccDist] = geom.distanceSquared(cc.position, e.position))
            cc.metals = this.metals
                            .filter(e => e[ccDist] < 250 * 250)
                            .sort((a, b) => a[ccDist] - b[ccDist])
            this.stones.forEach(e => e[ccDist] = geom.distanceSquared(cc.position, e.position))
            cc.stones = this.stones
                            .filter(e => e[ccDist] < 250 * 250)
                            .sort((a, b) => a[ccDist] - b[ccDist])
            this.fruits.forEach(e => e[ccDist] = geom.distanceSquared(cc.position, e.position))
            cc.fruits = this.fruits
                            .filter(e => e[ccDist] < 250 * 250)
                            .sort((a, b) => a[ccDist] - b[ccDist])
            const field = Engine.GetTemplate(`structures/${this.civ}/field`)
            cc.fieldPlacements =
                geom.fieldPlacements(cc, [...cc.metals, ...cc.stones],
                                     +field.Obstruction.Static["@width"],
                                     +field.ResourceSupply.MaxGatherers)
        }
    }
}

