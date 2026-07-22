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
        const EDGE_TILES = 3
        const obstructions = []
        const cmpTerrain = SimEngine.QueryInterface(Sim.SYSTEM_ENTITY, Sim.IID_Terrain)
        const s = cmpTerrain.GetMapSize()
        const bound0 = x => Math.max(0, Math.floor(x / TERRAIN_TILES) * TERRAIN_TILES)
        const bound1 = x => Math.min(s, Math.ceil(x / TERRAIN_TILES) * TERRAIN_TILES)
        ;[x0, x1] = [bound0(x0), bound1(x1)]
        ;[z0, z1] = [bound0(z0), bound1(z1)]
        const radius2 = Math.square(s - 2 * EDGE_TILES * TERRAIN_TILES)
        const prev = []
        const commit = ([i0, i1, j0, j1]) =>
            obstructions.push(geom.Rect.fromCenter(new Vector2D((i0 + i1) / 2, (j0 + j1) / 2),
                                                     [i1 - i0, j1 - j0], 0, 1, 0))
        const extend = (i01s, i0, i1) => {
            if (i01s.length == 0 || i01s.at(-1)[1] < i0)
                i01s.push([i0, i1])
            else
                i01s.at(-1)[1] = i1
        }
        for (let j = z0; j < z1; j += TERRAIN_TILES) {
            const row = []
            for (let dj = 0; dj < TERRAIN_TILES; dj++)
                row.push([])
            for (let i = x0; i < x1; i += TERRAIN_TILES) {
                const heights = [cmpTerrain.GetGroundLevel(i, j),
                                 cmpTerrain.GetGroundLevel(i + TERRAIN_TILES, j),
                                 cmpTerrain.GetGroundLevel(i, j + TERRAIN_TILES),
                                 cmpTerrain.GetGroundLevel(i + TERRAIN_TILES, j + TERRAIN_TILES)]
                const slope = (Math.max(...heights) - Math.min(...heights)) / TERRAIN_TILES
                if (slope >= 1) {
                    for (let dj = 0; dj < TERRAIN_TILES; dj++)
                        extend(row[dj], i, i + TERRAIN_TILES)
                    continue
                }
                for (let dj = 0; dj < TERRAIN_TILES; dj++)
                    for (let di = 0; di < TERRAIN_TILES; di++) {
                        const dist2 = Math.euclidDistance2DSquared(s, s, (i + di) * 2 + 1, (j + dj) * 2 + 1)
                        if (dist2 < radius2) continue
                        extend(row[dj], i + di, i + di + 1)
                    }
            }
            for (let dj = 0; dj < TERRAIN_TILES; dj++) {
                let p = 0
                for (const [i0, i1] of row[dj]) {
                    while (p < prev.length && prev[p][0] < i0)
                        prev.splice(p, 1).forEach(commit)
                    if (p < prev.length && prev[p][0] == i0 && prev[p][1] == i1) {
                        prev[p][3] = j + dj + 1
                    } else {
                        while (p < prev.length && prev[p][0] < i1)
                            prev.splice(p, 1).forEach(commit)
                        prev.splice(p, 0, [i0, i1, j + dj, j + dj + 1])
                    }
                }
            }
        }
        prev.forEach(commit)
        return obstructions
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
            const terrainObstructions = this.terrainObstructions([cc.pos().x - 1000, cc.pos().x + 1000], [cc.pos().y - 1000, cc.pos().y + 1000])
            const svg = new util.SVGPrinter()
            cc.trees.forEach(e => svg.rect(e.obstruction(0), "green"))
            cc.fruits.forEach(e => svg.rect(e.obstruction(0), "red"))
            fieldObstructions.forEach(r => svg.rect(r, "grey"))
            placements.fields = geom.fieldPlacements(cc, fieldObstructions, {maxGatherers: field.maxGatherers, size: field.size.map(x => x + 0.05)}, svg)
                .map(pos => new geom.Placement(field, pos, cc.angle, cc.cos))
            terrainObstructions.forEach(r => svg.rect(r, "silver"))

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

