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
            const fieldObstructions = [].concat(cc.metals.map(e => e.obstruction(eps)),
                                                cc.stones.map(e => e.obstruction(eps)),
                                                cc.fruits.map(e => e.obstruction(eps)),
                                                cc.trees.map(e => e.obstruction(eps)),
                                                cc.structures.flatMap(e => e.obstructions(eps)))
            // const fieldObstructions = [].concat(cc.metals.map(e => e.obstruction(eps)),
            //                                     cc.stones.map(e => e.obstruction(eps)),
            //                                     cc.structures.flatMap(e => e.obstructions(eps)),
            //                                     cc.fruits.concat(cc.trees).map(e => geom.Rect.fromCenter(e.pos(), [10,10], e.angle, e.cos, eps)))

const mockDropsite = {
  position: [380,652],
  angle: 2.356201171875,
  cos: -0.7071115042539267,
  rect: new geom.Rect([new Vector2D(380.0001416924946,673.2132034351232), new Vector2D(358.7867965648768,652.0001416924945), new Vector2D(379.9998583075054,630.7867965648768), new Vector2D(401.2132034351232,651.9998583075055)],
                      [new Vector2D(-21.2133451276178,-21.213061742628625), 30],
                      [new Vector2D(21.213061742628625,-21.2133451276178), 30])
}
const mockObstructions = [
  new geom.Rect([new Vector2D(359.98737696552774,701.0331906129202), new Vector2D(346.9668093870799,699.9873769655278), new Vector2D(348.01262303447226,686.9668093870798), new Vector2D(361.0331906129201,688.0126230344722)],
                [new Vector2D(-13.020567578447874,-1.0458136473923316), 13.0625],
                [new Vector2D(1.0458136473923316,-13.020567578447874), 13.0625]),
  new geom.Rect([new Vector2D(383.4642338616232,714.9993450728671), new Vector2D(369.59786432516927,697.8389924503683), new Vector2D(380.5357661383768,689.0006549271329), new Vector2D(394.40213567483073,706.1610075496317)],
                [new Vector2D(-13.866369536453908,-17.16035262249885), 22.0625],
                [new Vector2D(10.937901813207482,-8.838337523235493), 14.0625]),
  new geom.Rect([new Vector2D(405.94561569149835,625.9554220862061), new Vector2D(406.0051492028564,623.3936137383733), new Vector2D(408.56695755068915,623.4531472497314), new Vector2D(408.5074240393311,626.0149555975642)],
                [new Vector2D(0.059533511358052446,-2.561808347832714), 2.5625],
                [new Vector2D(2.561808347832714,0.059533511358052446), 2.5625]),
  new geom.Rect([new Vector2D(402.632879649007,621.9488064959914), new Vector2D(402.9500582501023,619.4060119732258), new Vector2D(405.492852772868,619.723190574321), new Vector2D(405.1756741717727,622.2659850970867)],
                [new Vector2D(0.3171786010952538,-2.542794522765703), 2.5625],
                [new Vector2D(2.542794522765703,0.3171786010952538), 2.5625]),
  new geom.Rect([new Vector2D(412.4766631909075,623.5617400757562), new Vector2D(415.03286441643127,623.3821807690326), new Vector2D(415.212423723155,625.9383819945563), new Vector2D(412.65622249763123,626.1179413012799)],
                [new Vector2D(2.556201225523708,-0.1795593067236947), 2.5625],
                [new Vector2D(0.1795593067236947,2.556201225523708), 2.5625]),
  new geom.Rect([new Vector2D(340.3614828924475,658.541270814976), new Vector2D(339.0111583842428,659.5110800604162), new Vector2D(338.0413491388025,658.1607555522115), new Vector2D(339.3916736470072,657.1909463067713)],
                [new Vector2D(-1.3503245082047715,0.96980924544033), 1.6625],
                [new Vector2D(-0.96980924544033,-1.3503245082047715), 1.6625]),
  new geom.Rect([new Vector2D(336.66168644271403,653.9668679308102), new Vector2D(336.644277088721,655.6292767747452), new Vector2D(334.98186824478597,655.6118674207523), new Vector2D(334.999277598779,653.9494585768173)],
                [new Vector2D(-0.017409353992997086,1.6624088439350733), 1.6625],
                [new Vector2D(-1.6624088439350733,-0.017409353992997086), 1.6625]),
  new geom.Rect([new Vector2D(337.416364546555,663.1381663885517), new Vector2D(335.81886486144833,663.598493452805), new Vector2D(335.358537797195,662.0009937676983), new Vector2D(336.95603748230167,661.540666703445)],
                [new Vector2D(-1.5974996851066885,0.46032706425326675), 1.6625],
                [new Vector2D(-0.46032706425326675,-1.5974996851066885), 1.6625]),
]
const mockField = {
  maxGatherers: 5,
  size: [22,22]
}

            let svg = new util.SVGPrinter(mockDropsite.position)
            // geom.fieldPlacements(mockDropsite, mockObstructions, mockField, svg)
            // svg.print()
            // placements.fields = []
            // continue

            svg = new util.SVGPrinter(cc.position)
            geom.fieldPlacements(cc, fieldObstructions, field, svg)
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

