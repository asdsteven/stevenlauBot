// See with eye, do with hand.

import * as geom from "simulation/ai/stevenlau/geom.js"

export class Brain {
    constructor(eye, hand) {
        this.eye = eye
        this.hand = hand
        this.created = null
        this.state = 0
        this.prevTime = 0
        this.eye.listener = (event, data) => {
            warn(`${event} ${JSON.stringify(data)}`)
            if (data.owner == this.eye.playerID) {
                this.created ??= data
            }
        }
    }

    think() {
        /* this.hand.write(Engine.GetTemplate("structures/han/field").Identity.GenericName) */
        // Unit obstruction square is 1.6x1.6, can be thought of as a circle
        // Unit max distance is 2
        if (this.eye.timeElapsed == 1000) {
            this.hand.write(`I can build ${this.eye.ccs[0].fieldPlacements.length} fields`)
        }
        if (this.eye.timeElapsed >= this.prevTime + 1000) {
            if (this.created) {
                this.hand.deleteEntities([this.created])
                this.created = null
                this.prevTime = this.eye.timeElapsed
            } else if (this.state < this.eye.ccs[0].fieldPlacements.length) {
                const [x, z] = this.eye.ccs[0].fieldPlacements[this.state]
                this.hand.construct(this.eye.civilians, `structures/${this.eye.civ}/field`, x, z, this.eye.ccs[0].angle)
                this.created = null
                this.prevTime = this.eye.timeElapsed
                this.state++
            }
        }
    }
}

