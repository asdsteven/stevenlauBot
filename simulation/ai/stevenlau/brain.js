// See with eye, do with hand.

import * as geom from "simulation/ai/stevenlau/geom.js"

export class Brain {
    constructor(eye, hand) {
        this.eye = eye
        this.hand = hand
        this.created = null
        this.state = 0
        this.eye.listener = (event, data) => {
            warn(`${this.eye.timeElapsed} ${event} ${JSON.stringify(data)}`)
            if (data.owner == this.eye.playerID && data.templateName.endsWith("field")) {
                this.created ??= data
            }
        }
    }

    think() {
        if (this.eye.timeElapsed == 1000) {
            this.hand.write(`I can build ${this.eye.ccs[0].fieldPlacements.length} fields`)
            const [x, z] = this.eye.ccs[0].firstFarmsteadPlacement
            this.hand.construct(this.eye.civilians, `structures/${this.eye.civ}/farmstead`, x, z, this.eye.ccs[0].angle)
            this.hand.walk(this.eye.melees.slice(0, 1), x, z)
        } else if (this.eye.timeElapsed % 1000 == 0) {
            if (this.created) {
                this.hand.deleteEntities([this.created])
                this.created = null
            } else if (this.state < this.eye.ccs[0].fieldPlacements.length) {
                const [x, z] = this.eye.ccs[0].fieldPlacements[this.state]
                this.hand.construct(this.eye.civilians, `structures/${this.eye.civ}/field`, x, z, this.eye.ccs[0].angle)
                this.created = null
                this.state++
            }
        }
    }
}

