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
            if (this.timeElapsed > 0)
                if (newEntity.owner == this.playerID)
                    this.see("new own entity", newEntity)
                else
                    this.see("new entity", newEntity)
        }
    }

    updateChangedTemplateInfo(playerID, template, variable, value) {
    }

    updateChangedEntityTemplateInfo(id, variable, value) {
    }

    terrainObstructions([x0, x1], [z0, z1]) {
        const TERRAIN_TILES = 4
        const cmpTerrain = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_Terrain)
        const s = cmpTerrain.GetMapSize()
        return geom.tileObstructions([x0, x1], [z0, z1], s, TERRAIN_TILES, (i, j) => {
            const heights = [cmpTerrain.GetGroundLevel(i, j),
                             cmpTerrain.GetGroundLevel(i + TERRAIN_TILES, j),
                             cmpTerrain.GetGroundLevel(i, j + TERRAIN_TILES),
                             cmpTerrain.GetGroundLevel(i + TERRAIN_TILES, j + TERRAIN_TILES)]
            const slope = (Math.max(...heights) - Math.min(...heights)) / TERRAIN_TILES
            return slope >= 1
        })
    }

    edgeObstructions([x0, x1], [z0, z1]) {
        const TERRAIN_TILES = 4
        const EDGE_TILES = 3
        const cmpTerrain = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_Terrain)
        const s = cmpTerrain.GetMapSize()
        const radius2 = Math.square(s - 2 * EDGE_TILES * TERRAIN_TILES)
        return geom.tileObstructions([x0, x1], [z0, z1], s, 1, (i, j) =>
            Math.euclidDistance2DSquared(s, s, i * 2 + 1, j * 2 + 1) >= radius2)
    }

    territoryObstructions([x0, x1], [z0, z1]) {
        const TERRITORY_TILES = 8
        const cmpTerrain = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_Terrain)
        const s = cmpTerrain.GetMapSize()
        const cmpTerritoryManager = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_TerritoryManager)
        return geom.tileObstructions([x0, x1], [z0, z1], s, TERRITORY_TILES, (i, j) =>
            cmpTerritoryManager.GetOwner(i, j) == this.playerID)
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

            const field = this.player.templateCache.getOrLoad(`structures/${this.civ}/field`)
            const fieldObstructions = [].concat(cc.metals.map(e => e.obstruction(0)),
                                                cc.stones.map(e => e.obstruction(0)),
                                                cc.structures.flatMap(e => e.obstructions(0)))
            const terrainObstructions = this.terrainObstructions([0, 768], [0, 768])
            const edgeObstructions = this.edgeObstructions([0, 768], [0, 768])
            const territoryObstructions = this.territoryObstructions([0, 768], [0, 768])
            const svg = new util.SVGPrinter()
            cc.trees.forEach(e => svg.rect(e.obstruction(0), "green"))
            cc.fruits.forEach(e => svg.rect(e.obstruction(0), "red"))
            fieldObstructions.forEach(r => svg.rect(r, "grey"))
            placements.fields = geom.fieldPlacements(cc, fieldObstructions, {maxGatherers: field.maxGatherers, size: field.size.map(x => x + 0.05)}, svg)
                .map(pos => new geom.Placement(field, pos, cc.angle, cc.cos))
            terrainObstructions.forEach(r => svg.rect(r, "silver"))
            edgeObstructions.forEach(r => svg.rect(r, "grey", 0.5))
            territoryObstructions.forEach(r => svg.rect(r, "blue", 0.5))

            // const svg = new util.SVGPrinter()
            // placements.fields = geom.fieldPlacements(mockDropsite, mockObstructions, mockField, svg)
            //     .map(pos => new geom.Placement(field, pos, cc.angle, cc.cos))
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
                                           obs.disjoint(geom.Rect.fromCenter(p, field.size.map(x => x + 0.05), cc.angle, cc.cos, 0))))

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

