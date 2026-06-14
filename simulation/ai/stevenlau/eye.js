// Tells Brain what I see.

import * as util from "simulation/ai/stevenlau/util.js"
import { dd } from "simulation/ai/stevenlau/util.js"
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
            // const fieldObstructions = [].concat(cc.metals.map(e => e.obstruction(eps)),
            //                                     cc.stones.map(e => e.obstruction(eps)),
            //                                     cc.fruits.map(e => e.obstruction(eps)),
            //                                     cc.trees.map(e => e.obstruction(eps)),
            //                                     cc.structures.flatMap(e => e.obstructions(eps)))
            const fieldObstructions = [].concat(cc.metals.map(e => e.obstruction(eps)),
                                                cc.stones.map(e => e.obstruction(eps)),
                                                cc.structures.flatMap(e => e.obstructions(eps)),
                                                cc.fruits.concat(cc.trees).map(e => geom.Rect.fromCenter(e.pos(), [10,10], e.angle, e.cos, eps)))

            const svg = new util.SVGPrinter(cc.position)
            const vl = field.size[0] + (0.8 + 2) * 2
            const vv = vl * vl
            const extension = field.size[0] - 0.8 * Math.sqrt(2) * (field.maxGatherers - 1)
            const areas = []
            for (const oul of cc.rect.edges) {
                const v = oul[1].perpendicular().mult(-vl / oul[2])
                const ul = oul[2] + 2 * extension
                const uu = ul * ul
                const u = Vector2D.mult(oul[1], ul / oul[2])
                const o = Vector2D.mult(oul[1], -extension / oul[2]).add(oul[0])
                areas.push(geom.Rect.fromOUV(o, [u, ul], [v, vl]))
            }
            for (const obs of fieldObstructions.filter(obs => !areas.some(area => !obs.disjoint(area)))) {
                svg.corners(obs.edges.map(([p]) => [p.x,p.y]), "black", 1)
            }
            for (const obs of fieldObstructions.filter(obs => areas.some(area => !obs.disjoint(area)))) {
                svg.corners(obs.edges.map(([p]) => [p.x,p.y]), "grey", 1)
            }
            // let jj = 0
            for (const oul of cc.rect.edges) {
                // jj += 1
                // if (jj % 2 == 0) continue
                const v = oul[1].perpendicular().mult(-vl / oul[2])
                const ul = oul[2] + 2 * extension
                const uu = ul * ul
                const u = Vector2D.mult(oul[1], ul / oul[2])
                const o = Vector2D.mult(oul[1], -extension / oul[2]).add(oul[0])
                new geom.TrapezoidalStrip(o, [u, ul], [v, vl], fieldObstructions, field, svg)
            }
            svg.print()
            placements.fields = []
            continue

            placements.fields = null
            for (const gap of [0, (0.8 + 2) * 2 - 2 * eps]) {
                for (let bits = 0; bits < 16; bits++) {
                    const extendEnds = [1, 2, 4, 8].map(b => !!(bits & b))
                    const strips = geom.fieldStrips(field, extendEnds, cc, fieldObstructions, gap, eps)
                    const ps = geom.fieldPlacements(field, strips, eps)
                    const sumGap = util.sum(ps.map(([,gap]) => gap))
                    if (placements.fields == null || ps.length > placements.fields.length ||
                        ps.length == placements.fields.length && sumGap < placements.fields.sumGap) {
                        placements.fields = ps.map(([p]) => new geom.Placement(field, p, cc.angle, cc.cos))
                        placements.fields.strips = strips
                        placements.fields.sumGap = sumGap
                    }
                }
            }
            // const svg = new util.SVGPrinter(cc.position)
            cc.metals.forEach(e => svg.rect(e.rect))
            cc.stones.forEach(e => svg.rect(e.rect))
            cc.structures.forEach(e => e.obstructions(0).forEach(rect => svg.rect(rect)))
            cc.trees.forEach(e => svg.rect(e.rect, "green"))
            cc.fruits.forEach(e => svg.rect(e.rect, "red"))
            svg.rect(cc.rect)
            placements.fields.strips.forEach(([strip]) => strip.rects().map(rect => svg.rect(rect, "blue", 0.5)))
            placements.fields.forEach(p => svg.rect(geom.Rect.fromCenter(p.position, field.size, cc.angle, cc.cos, 0), "yellow", 0.5))
            svg.print()
            continue

            const farmstead = this.player.templateCache.getOrLoad(`structures/${this.civ}/farmstead`)
            // We can do check placement.  Show off with accurate eps!
            // Can't be too small because even game engine sincos approx is inaccurate.
            // Theoretical error is around 1 / 2048.
            for (let eps = 1 / 32; ; eps *= 2) {
                const p = geom.firstFarmsteadPlacement(farmstead, placements.fields, cc, cc.fruits,
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

            const house = this.player.templateCache.getOrLoad(`structures/${this.civ}/house`)
            const barracks = this.player.templateCache.getOrLoad(`structures/${this.civ}/barracks`)
            // ({houses: placements.houses, barracks: placements.barracks} = geom.housesBarracksPlacement(
            //     cc, fieldWidth, Math.max(houseWidth, houseDepth), Math.max(barracksWidth, barracksDepth),
            //     rigidObstructions.concat(treeObstructions,
            //                              [geom.Rect.fromCenter(placements.firstFarmstead,
            //                                                    [farmsteadWidth, farmsteadDepth],
            //                                                    cc.angle, cc.cos)]),
            //     eps))
        }
        this.see("scanned entities")
    }
}

