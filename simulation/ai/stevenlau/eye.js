// Tells Brain what I see.

import * as util from "simulation/ai/stevenlau/util.js"
import * as geom from "simulation/ai/stevenlau/geom.js"
import { TemplateCache } from "simulation/ai/stevenlau/template.js"
import { entitywhxya } from "simulation/ai/stevenlau/util.js"
import { Entity } from "simulation/ai/stevenlau/entity.js"

export class Eye {
    constructor(timeElapsed, players, playerID, difficulty, behavior, civ) {
        this.timeElapsed = timeElapsed
        this.players = players
        this.playerID = playerID
        this.player = players[playerID]
        this.difficulty = difficulty
        this.behavior = behavior
        this.civ = civ
        this.entities = new Map()
        players.forEach(player => player.templateCache = new TemplateCache())
    }

    updateEntity(id, entity) {
        if (this.entities.has(id)) {
            this.entities.get(id).update(entity)
        } else {
            const templateCache = this.players[entity.owner].templateCache
            const newEntity = new Entity(id, entity, templateCache)
            this.entities.set(id, newEntity)
            if (this.timeElapsed > 0) {
                if (newEntity.owner == this.playerID) {
                    this.see("new own entity", newEntity)
                } else {
                    this.see("new entity", newEntity)
                }
            }
        }
    }

    updateChangedTemplateInfo(playerID, template, variable, value) {
    }

    updateChangedEntityTemplateInfo(id, variable, value) {
    }

    scanEntities() {
        this.civilians = []
        this.melees = []
        this.ccs = []
        this.farmsteads = []
        this.storehouses = []
        this.metals = []
        this.stones = []
        this.trees = []
        this.fruits = []
        this.enemyCCs = []
        this.structures = []
        for (const [id, entity] of this.entities.entries()) {
            const template = entity.template
            if (entity.owner == this.playerID) {
                if (template.classes.has("Civilian")) {
                    this.civilians.push(entity)
                } else if (template.classes.has("Infantry") && template.classes.has("Melee")) {
                    this.melees.push(entity)
                } else if (template.classes.has("Structure")) {
                    this.structures.push(entity)
                    if (template.classes.has("CivilCentre")) {
                        this.ccs.push(entity)
                        print(`${this.playerID} CC: ${entitywhxya(entity)}\n`)
                    } else if (template.classes.has("Farmstead")) {
                        this.farmsteads.push(entity)
                    } else if (template.classes.has("Storehouse")) {
                        this.storehouses.push(entity)
                    }
                }
            } else if (template.resourceSupplyType?.startsWith("metal.")) {
                this.metals.push(entity)
            } else if (template.resourceSupplyType?.startsWith("stone.")) {
                this.stones.push(entity)
            } else if (template.resourceSupplyType?.startsWith("wood.")) {
                this.trees.push(entity)
            } else if (template.resourceSupplyType?.endsWith(".fruit")) {
                this.fruits.push(entity)
            } else if (template.classes.has("Structure")) {
                this.structures.push(entity)
                if (template.classes.has("CivilCentre")) {
                    this.enemyCCs.push(entity)
                }
            }
        }

        for (const cc of this.ccs) {
            // 140 * 1.25 * 1.25 = 218
            const nearCC = es => es.map(e => [e, e.pos().distanceTo(cc.pos())])
                                   .filter(([e, dist]) => dist < 250 * 250)
                                   .sort(([, a], [, b]) => a - b)
                                   .map(([e, ]) => e)
            cc.metals = nearCC(this.metals)
            cc.stones = nearCC(this.stones)
            cc.trees = nearCC(this.trees)
            cc.fruits = nearCC(this.fruits)
            cc.structures = nearCC(this.structures.filter(x => x != cc))

            const placements = {}
            cc.placements = placements
            const eps = 1 / 32

            const field = this.player.templateCache.getOrLoad(`structures/${this.civ}/field`)
            const fieldObstructions = [].concat(cc.metals.map(e => e.obstruction(eps)),
                                                cc.stones.map(e => e.obstruction(eps)),
                                                cc.structures.flatMap(e => e.obstructions(eps)))
            placements.fields = null
            for (let bits = 0; bits < 16; bits++) {
                const extendEnds = [1, 2, 4, 8].map(b => !!(bits & b))
                const stripes = geom.fieldStripes(field, extendEnds, cc, fieldObstructions, eps)
                const ps = geom.fieldPlacements(field, stripes, eps)
                const sumGap = util.sum(ps.map(([,gap]) => gap))
                if (placements.fields == null || placements.fields.length < ps.length ||
                    placements.fields.length == ps.length && placements.fields.sumGap > sumGap) {
                    placements.fields = ps.map(([p]) => new geom.Placement(field, p, cc.angle, cc.cos))
                    placements.fields.stripes = stripes
                    placements.fields.sumGap = sumGap
                }
            }
            const svg = new util.SVGPrinter(cc.position)
            cc.metals.forEach(e => svg.rect(e.rect))
            cc.stones.forEach(e => svg.rect(e.rect))
            cc.structures.forEach(e => e.obstructions(0).forEach(rect => svg.rect(rect)))
            cc.trees.forEach(e => svg.rect(e.rect, "green"))
            cc.fruits.forEach(e => svg.rect(e.rect, "red"))
            svg.rect(cc.rect)
            placements.fields.stripes.forEach(([stripe]) => stripe.rects().map(rect => svg.rect(rect, "blue", 0.5)))
            placements.fields.forEach(p => svg.rect(geom.Rect.fromCenter(p.position, field.size, cc.angle, cc.cos, 0), "yellow", 0.5))
            svg.print()
            continue

            const farmstead = this.player.templateCache.getOrLoad(`structures/${this.civ}/farmstead`)
            // We can do check placement.  Show off with accurate eps!
            // Can't be too small because even game engine sincos approx is inaccurate.
            // Theoretical error is around 1 / 2048.
            for (let eps = 1 / 32; ; eps *= 2) {
                const p = geom.firstFarmsteadPlacement(cc, field.size[0], Math.max(...farmstead.size), cc.fruits,
                                                       [].concat(cc.metals.map(e => e.obstruction(eps)),
                                                                 cc.stones.map(e => e.obstruction(eps)),
                                                                 cc.structures.flatMap(e => e.obstructions(eps)),
                                                                 cc.trees.map(e => e.obstruction(eps)),
                                                                 cc.fruits.map(e => e.obstruction(eps))),
                                                       eps)
                const res = util.placementResult(`preview|structures/${this.civ}/farmstead`, p.position, cc.angle, this.playerID)
                if (res == null) {
                    placements.firstFarmstead = p
                    break
                }
                if (res != "obstructed") throw `first farmstead placement: ${res}`

                // TODO: still could fail when near world edge
                if (eps > 1) throw "first farmstead placement: failed too many times"

                this.see("chat", `first farmstead placement: failed with eps ${eps}`)
            }

            // The trees blocking field construction will be chopped quite soon,
            // can be ignored.
            const treeObstructions = cc.trees.map(tree => tree.obstruction(eps))
                                       .filter(obs => placements.fields.every(p =>
                                           obs.disjoint(geom.Rect.fromCenter(p, [fieldWidth, fieldWidth], cc.angle, cc.cos, eps))))

            const house = Engine.GetTemplate(`structures/${this.civ}/house`)
            const houseWidth = +house.Obstruction.Static["@width"]
            const houseDepth = +house.Obstruction.Static["@depth"]
            const barracks = Engine.GetTemplate(`structures/${this.civ}/barracks`)
            const barracksWidth = +barracks.Obstruction.Static["@width"]
            const barracksDepth = +barracks.Obstruction.Static["@depth"]
            ({houses: placements.houses, barracks: placements.barracks} = geom.housesBarracksPlacement(
                cc, fieldWidth, Math.max(houseWidth, houseDepth), Math.max(barracksWidth, barracksDepth),
                rigidObstructions.concat(treeObstructions,
                                         [geom.Rect.fromCenter(placements.firstFarmstead,
                                                               [farmsteadWidth, farmsteadDepth],
                                                               cc.angle, cc.cos)]),
                eps))
        }
        this.see("scanned entities")
    }
}

