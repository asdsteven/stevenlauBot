// Tells Brain what I see.

import * as util from "simulation/ai/stevenlau/util.js"
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
            const templateCache = this.players[this.playerID].templatesCache
            const newEntity = new Entity(id, entity, templateCache)
            this.entities.set(id, newEntity)
            if (this.timeElapsed > 0) this.listener("new entity", newEntity)
        }
    }

    updateChangedTemplateInfo(playerID, template, variable, value) {
    }

    updateChangedEntityTemplateInfo(id, variable, value) {
    }

    scanEntities() {
        this.ccs = []
        this.civilians = []
        this.melees = []
        this.structures = []
        this.enemyCCs = []
        this.metals = []
        this.stones = []
        this.trees = []
        this.fruits = []
        this.allStructures = []
        for (const [id, entity] of this.entities.entries()) {
            const template = entity.template
            if (entity.owner == this.playerID) {
                if (template.classes.has("CivilCentre")) {
                    this.ccs.push(entity)
                    this.allStructures.push(entity)
                    warn(`CC: ${entitywhxya(entity)}`)
                } else if (template.classes.has("Civilian")) {
                    this.civilians.push(entity)
                } else if (template.classes.has("Infantry") && template.classes.has("Melee")) {
                    this.melees.push(entity)
                } else if (template.classes.has("Structure")) {
                    this.structures.push(entity)
                    this.allStructures.push(entity)
                }
            } else if (template.classes.has("CivilCentre")) {
                this.enemyCCs.push(entity)
                this.allStructures.push(entity)
            } else if (template.resourceSupplyType?.startsWith("metal.")) {
                this.metals.push(entity)
            } else if (template.resourceSupplyType?.startsWith("stone.")) {
                this.stones.push(entity)
            } else if (template.resourceSupplyType?.startsWith("wood.")) {
                this.trees.push(entity)
            } else if (template.resourceSupplyType?.endsWith(".fruit")) {
                this.fruits.push(entity)
            } else if (template.classes.has("Structure")) {
                this.allStructures.push(entity)
            }
        }
        for (const cc of this.ccs) {
            // 140 * 1.25 * 1.25 = 218
            const ccDist = `dist ${cc.id}`;
            [this.metals, this.stones, this.trees, this.fruits, this.allStructures].forEach(es =>
                es.forEach(e => e[ccDist] = cc.pos().distanceTo(e.pos())))
            const nearCC = es => es.filter(e => e[ccDist] < 250 * 250)
                                   .sort((a, b) => a[ccDist] - b[ccDist])
            cc.metals = nearCC(this.metals)
            cc.stones = nearCC(this.stones)
            cc.trees = nearCC(this.trees)
            cc.fruits = nearCC(this.fruits)
            cc.structures = nearCC(this.allStructures)

            const placements = {}
            const field = Engine.GetTemplate(`structures/${this.civ}/field`)
            const fieldWidth = +field.Obstruction.Static["@width"]
            const fieldDepth = +field.Obstruction.Static["@depth"]
            if (fieldWidth != fieldDepth) throw `field is not a square: ${fieldWidth}x${fieldDepth}`
            placements.fields =
                geom.fieldPlacements(cc, fieldWidth, +field.ResourceSupply.MaxGatherers,
                                     [...cc.metals, ...cc.stones, ...cc.structures])

            const farmstead = Engine.GetTemplate(`structures/${this.civ}/farmstead`)
            const farmsteadWidth = +farmstead.Obstruction.Static["@width"]
            const farmsteadDepth = +farmstead.Obstruction.Static["@depth"]
            for (let eps = 1 / 1024; ; eps *= 2) {
                const p = geom.firstFarmsteadPlacement(
                    cc, fieldWidth, Math.max(farmsteadWidth, farmsteadDepth), cc.fruits,
                    [...cc.metals, ...cc.stones, ...cc.trees, ...cc.fruits, ...cc.structures],
                    eps)
                const res = util.placementResult(`preview|structures/${this.civ}/farmstead`, p[0], p[1], cc.angle, this.playerID)
                if (res == null) {
                    placements.firstFarmstead = p
                    break
                }
                if (res != "obstructed") `first farmstead placement: ${res}`
                if (eps > 1) throw "first farmstead placement: failed too many times"
                this.listener("chat", `first farmstead placement: failed with eps ${eps}`)
            }

            cc.placements = placements
        }
    }
}

