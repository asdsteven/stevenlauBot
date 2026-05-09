// See with eye, do with hand.

import * as geom from "simulation/ai/stevenlau/geom.js"
import { dd } from "simulation/ai/stevenlau/util.js"
import * as util from "simulation/ai/stevenlau/util.js"

export class Brain {
    constructor(eye, hand) {
        this.preConstructs = new Set()
        this.constructeds = new Map()
        this.eye = eye
        this.hand = hand
        this.eye.see = (event, data) => {
            if (event == "scanned entities") {
                const fields = this.eye.ccs[0].placements.fields
                fields.forEach(placement => this.preConstructs.add(placement))
                /* const farmstead = this.eye.ccs[0].placements.firstFarmstead
                 * this.preConstructs.add(farmstead) */
                this.hand.write(`Hello, I am difficulty:${this.eye.difficulty} ${this.eye.behavior} player:${this.eye.playerID}!`)
                this.hand.write(`I can build ${fields.length} fields total ${dd(fields.sumGap)} away from cc.`)
            } else if (event == "chat") {
                this.hand.write(data)
            } else if (event == "new own entity") {
                const [x, z] = data.position
                this.constructeds.set(`${data.templateName} ${Math.round(x)} ${Math.round(z)}`, data)
            }
        }
    }

    preConstruct(resources) {
        Array.from(this.preConstructs).filter(placement => {
            if (placement.tries > 10) return false
            if (placement.tries > 0) {
                const entity = this.constructeds.get(placement.key())
                if (entity) {
                    this.constructeds.delete(placement.key())
                    this.hand.deleteEntities([entity])
                    Object.keys(resources).forEach(k => resources[k] += placement.template.costs[k])
                    return true
                }
                this.hand.write(`construct fail x ${placement.tries}: ${placement.template.name}`)
                // TODO: move a bit
            }
            if (Object.entries(resources).some(([k, v]) => v < placement.template.costs[k])) return false
            /* const inset = geom.Rect.fromCenter(placement.position, placement.template.size, angle) */
            /* const result = util.placementResult("preview|" + template, position, angle, this.eye.playerID)
             * if (result != null) {
             *     this.hand.write(`skip preview ${template} due to ${result}`)
             *     return true
             * } */
            this.hand.construct(this.eye.civilians, placement.template.name, placement.position, placement.angle)
            placement.tries += 1
            Object.keys(resources).forEach(k => resources[k] -= placement.template.costs[k])
            return false
        }).forEach(x => this.preConstructs.delete(x))
    }

    think() {
        const resources = {...this.eye.player.resources}
        this.preConstruct(resources)
    }
}

